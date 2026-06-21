"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/server";
import {
  validateSocioInput,
  buildSocioUpdateData,
} from "@/lib/socios/update";
import type { ActionResult, CreateSocioInput } from "@/app/(admin)/socios/types";

// Sentinel error thrown inside the transaction when the updateMany guard finds
// count === 0 (i.e., the solicitud was already resolved by another request).
// Using a sentinel class instead of constructing PrismaClientKnownRequestError
// avoids the need to supply a valid `clientVersion` and keeps the code clean.
class SolicitudYaResuelta extends Error {
  constructor() {
    super("La solicitud ya fue resuelta.");
    this.name = "SolicitudYaResuelta";
  }
}

async function requireReview() {
  const user = await getCurrentUser();
  if (!user || !user.permissions.has("socios.write")) return null;
  return user;
}

export type SolicitudPendiente = {
  id: string;
  creadoEn: string;
  socio: {
    id: string;
    codigo: string;
    nombre: string;
    tipoDocumento: string;
    numeroDocumento: string;
  };
  // Solo los campos que difieren entre propuesto y actual.
  propuesto: Record<string, unknown>;
  actual: Record<string, unknown>;
};

const DIFF_FIELDS = [
  "tipoDocumento",
  "numeroDocumento",
  "apellidoPaterno",
  "apellidoMaterno",
  "nombres",
  "fechaNacimiento",
  "sexo",
  "estadoCivil",
  "telefono",
  "email",
  "direccion",
  "distrito",
  "provincia",
  "departamento",
] as const;

export async function listSolicitudesPendientes(): Promise<
  ActionResult<SolicitudPendiente[]>
> {
  const me = await requireReview();
  if (!me) return { ok: false, error: "No tienes permisos para esta acción." };

  const rows = await prisma.solicitudActualizacionDatos.findMany({
    where: { estado: "pendiente" },
    orderBy: { creadoEn: "asc" },
    select: {
      id: true,
      creadoEn: true,
      datos: true,
      socio: {
        select: {
          id: true,
          codigo: true,
          apellidoPaterno: true,
          apellidoMaterno: true,
          nombres: true,
          tipoDocumento: true,
          numeroDocumento: true,
          fechaNacimiento: true,
          sexo: true,
          estadoCivil: true,
          telefono: true,
          email: true,
          direccion: true,
          distrito: true,
          provincia: true,
          departamento: true,
        },
      },
    },
  });

  const items: SolicitudPendiente[] = rows.map((r) => {
    const datos = (r.datos ?? {}) as Record<string, unknown>;
    const s = r.socio;
    const actual: Record<string, unknown> = {};
    const propuesto: Record<string, unknown> = {};

    for (const k of DIFF_FIELDS) {
      const cur =
        k === "fechaNacimiento"
          ? s.fechaNacimiento
            ? s.fechaNacimiento.toISOString().slice(0, 10)
            : null
          : (s as Record<string, unknown>)[k] ?? null;

      // Only include in the diff fields that the solicitud actually contains.
      if (k in datos) {
        const prop =
          k === "fechaNacimiento" && typeof datos[k] === "string"
            ? (datos[k] as string).slice(0, 10)
            : datos[k] ?? null;
        if (String(prop ?? "") !== String(cur ?? "")) {
          actual[k] = cur;
          propuesto[k] = prop;
        }
      }
    }

    return {
      id: r.id,
      creadoEn: r.creadoEn.toISOString(),
      socio: {
        id: s.id,
        codigo: s.codigo,
        nombre: `${s.apellidoPaterno} ${s.apellidoMaterno ?? ""}, ${s.nombres}`.replace(
          /\s+,/,
          ",",
        ),
        tipoDocumento: s.tipoDocumento,
        numeroDocumento: s.numeroDocumento,
      },
      propuesto,
      actual,
    };
  });

  return { ok: true, data: items };
}

export async function contarSolicitudesPendientes(): Promise<number> {
  const me = await requireReview();
  if (!me) return 0;
  return prisma.solicitudActualizacionDatos.count({
    where: { estado: "pendiente" },
  });
}

export async function aprobarSolicitud(id: string): Promise<ActionResult> {
  const me = await requireReview();
  if (!me) return { ok: false, error: "No tienes permisos para esta acción." };

  try {
    // Read solicitud and existing socio BEFORE the transaction to validate the
    // patch. These reads are non-transactional (optimistic), but the updateMany
    // guard inside the transaction is the true atomicity barrier.
    const sol = await prisma.solicitudActualizacionDatos.findUnique({
      where: { id },
      select: { id: true, socioId: true, estado: true, datos: true },
    });
    if (!sol) return { ok: false, error: "Solicitud no encontrada." };
    if (sol.estado !== "pendiente")
      return { ok: false, error: "La solicitud ya fue resuelta." };

    const existing = await prisma.socio.findUnique({
      where: { id: sol.socioId },
      select: {
        tipoDocumento: true,
        codigo: true,
        numeroPadron: true,
        numeroDocumento: true,
        apellidoPaterno: true,
        apellidoMaterno: true,
        nombres: true,
        userId: true,
      },
    });
    if (!existing) return { ok: false, error: "Socio no encontrado." };

    // Re-validate the proposed data at approval time.
    const datos = (sol.datos ?? {}) as Partial<CreateSocioInput>;
    const merged: Partial<CreateSocioInput> = {
      tipoDocumento: datos.tipoDocumento ?? existing.tipoDocumento,
      ...datos,
    };
    const { fieldErrors, normalized } = validateSocioInput(merged, false);
    if (Object.keys(fieldErrors).length > 0) {
      return {
        ok: false,
        error: "Los datos de la solicitud no son válidos.",
        fieldErrors,
      };
    }

    const { data, docCambia } = buildSocioUpdateData(normalized, existing);
    data.updatedBy = { connect: { id: me.id } };

    try {
      await prisma.$transaction(async (tx) => {
        // Atomic guard: flip pendiente → aprobada only if still pendiente.
        // If another request already resolved it, count === 0 → abort.
        const upd = await tx.solicitudActualizacionDatos.updateMany({
          where: { id: sol.id, estado: "pendiente" },
          data: {
            estado: "aprobada",
            revisadoPorId: me.id,
            revisadoEn: new Date(),
          },
        });
        if (upd.count === 0) throw new SolicitudYaResuelta();

        await tx.socio.update({ where: { id: sol.socioId }, data });

        // Propagate document change to the linked User if applicable.
        if (existing.userId && docCambia) {
          await tx.user.update({
            where: { id: existing.userId },
            data: {
              tipoDocumento: normalized.tipoDocumento ?? existing.tipoDocumento,
              numeroDocumento:
                normalized.numeroDocumento ?? existing.numeroDocumento,
            },
          });
        }
      });
    } catch (e) {
      if (e instanceof SolicitudYaResuelta) {
        return { ok: false, error: "La solicitud ya fue resuelta." };
      }
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        return {
          ok: false,
          error: "Ya existe un socio con ese documento; no se aplicó.",
        };
      }
      throw e;
    }

    revalidatePath("/socios");
    revalidatePath("/socios/solicitudes");
    return { ok: true };
  } catch (e) {
    console.error("aprobarSolicitud", e);
    return { ok: false, error: "No se pudo aprobar la solicitud." };
  }
}

export async function rechazarSolicitud(
  id: string,
  motivo: string,
): Promise<ActionResult> {
  const me = await requireReview();
  if (!me) return { ok: false, error: "No tienes permisos para esta acción." };

  const m = (motivo ?? "").trim();
  if (m.length < 5) {
    return { ok: false, error: "Indica un motivo (mínimo 5 caracteres)." };
  }

  const upd = await prisma.solicitudActualizacionDatos.updateMany({
    where: { id, estado: "pendiente" },
    data: {
      estado: "rechazada",
      motivoRechazo: m,
      revisadoPorId: me.id,
      revisadoEn: new Date(),
    },
  });

  if (upd.count === 0) {
    return {
      ok: false,
      error: "La solicitud no existe o ya fue resuelta.",
    };
  }

  revalidatePath("/socios/solicitudes");
  return { ok: true };
}
