"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/server";
import { validateSocioInput, buildSocioUpdateData } from "@/lib/socios/update";
import { normalizeToken } from "@/lib/socios/normalize";
import type { ActionResult, CreateSocioInput } from "@/app/(admin)/socios/types";

// Sentinel error thrown inside the transaction when the updateMany guard finds
// count === 0 (i.e., the registro was already resolved by another request).
// Using a sentinel class instead of constructing PrismaClientKnownRequestError
// avoids the need to supply a valid `clientVersion` and keeps the code clean.
class RegistroYaResuelto extends Error {
  constructor() {
    super("El registro ya fue resuelto.");
    this.name = "RegistroYaResuelto";
  }
}

async function requireReview() {
  const u = await getCurrentUser();
  if (!u || !u.permissions.has("socios.write")) return null;
  return u;
}

export type RegistroPublicoRow = {
  id: string;
  numeroDocumento: string;
  nombreCompleto: string;
  telefono: string;
  email: string | null;
  creadoEn: string;
};

export type SocioMatch = {
  id: string;
  codigo: string;
  nombre: string;
  tipoDocumento: string;
  numeroDocumento: string;
};

export async function listRegistrosPublicos(): Promise<
  ActionResult<RegistroPublicoRow[]>
> {
  const me = await requireReview();
  if (!me) return { ok: false, error: "No tienes permisos para esta acción." };

  const rows = await prisma.solicitudRegistroPublico.findMany({
    where: { estado: "pendiente" },
    orderBy: { creadoEn: "asc" },
    select: {
      id: true,
      numeroDocumento: true,
      nombreCompleto: true,
      telefono: true,
      email: true,
      creadoEn: true,
    },
  });

  return {
    ok: true,
    data: rows.map((r) => ({ ...r, creadoEn: r.creadoEn.toISOString() })),
  };
}

export async function buscarSociosParaMatch(
  q: string,
): Promise<ActionResult<SocioMatch[]>> {
  const me = await requireReview();
  if (!me) return { ok: false, error: "No tienes permisos para esta acción." };

  // Tokenizar + normalizar (mismo criterio que listSocios). searchKey ordena
  // apellidos ANTES que nombres, así que un `contains` de la frase completa
  // fallaría con "julia mondragon" (nombre+apellido). En cambio exigimos que
  // CADA palabra esté presente: el orden no importa y "Mondragón" matchea con
  // "mondragon".
  const tokens = (q ?? "")
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .map(normalizeToken);

  if (tokens.length === 0 || tokens.join("").length < 2) {
    return { ok: true, data: [] };
  }

  const rows = await prisma.socio.findMany({
    where: { AND: tokens.map((token) => ({ searchKey: { contains: token } })) },
    orderBy: { apellidoPaterno: "asc" },
    take: 10,
    select: {
      id: true,
      codigo: true,
      apellidoPaterno: true,
      apellidoMaterno: true,
      nombres: true,
      tipoDocumento: true,
      numeroDocumento: true,
    },
  });

  return {
    ok: true,
    data: rows.map((s) => ({
      id: s.id,
      codigo: s.codigo,
      nombre: `${s.apellidoPaterno} ${s.apellidoMaterno ?? ""}, ${s.nombres}`.replace(
        /\s+,/,
        ",",
      ),
      tipoDocumento: s.tipoDocumento,
      numeroDocumento: s.numeroDocumento,
    })),
  };
}

export async function aprobarRegistroPublico(
  id: string,
  socioId: string,
): Promise<ActionResult> {
  const me = await requireReview();
  if (!me) return { ok: false, error: "No tienes permisos para esta acción." };

  try {
    // Read registro and existing socio BEFORE the transaction to validate the
    // patch. These reads are non-transactional (optimistic), but the updateMany
    // guard inside the transaction is the true atomicity barrier.
    const reg = await prisma.solicitudRegistroPublico.findUnique({
      where: { id },
      select: {
        id: true,
        estado: true,
        numeroDocumento: true,
        telefono: true,
        email: true,
      },
    });
    if (!reg) return { ok: false, error: "Registro no encontrado." };
    if (reg.estado !== "pendiente")
      return { ok: false, error: "El registro ya fue resuelto." };
    if (!socioId)
      return { ok: false, error: "Selecciona el socio a emparejar." };

    const existing = await prisma.socio.findUnique({
      where: { id: socioId },
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

    // Build patch: only DNI + telefono + email (NOT name fields).
    const patch: Partial<CreateSocioInput> = {
      tipoDocumento: "DNI",
      numeroDocumento: reg.numeroDocumento,
      telefono: reg.telefono,
      ...(reg.email ? { email: reg.email } : {}),
    };

    // Re-validate the patch at approval time.
    const { fieldErrors, normalized } = validateSocioInput(
      { tipoDocumento: existing.tipoDocumento, ...patch },
      false,
    );
    if (Object.keys(fieldErrors).length > 0) {
      return {
        ok: false,
        error: "Los datos del registro no son válidos.",
        fieldErrors,
      };
    }

    const { data, docCambia } = buildSocioUpdateData(normalized, existing);
    data.updatedBy = { connect: { id: me.id } };

    try {
      await prisma.$transaction(async (tx) => {
        // Atomic guard: flip pendiente → aprobada only if still pendiente.
        // If another request already resolved it, count === 0 → abort.
        const upd = await tx.solicitudRegistroPublico.updateMany({
          where: { id: reg.id, estado: "pendiente" },
          data: {
            estado: "aprobada",
            socioVinculadoId: socioId,
            revisadoPorId: me.id,
            revisadoEn: new Date(),
          },
        });
        if (upd.count === 0) throw new RegistroYaResuelto();

        await tx.socio.update({ where: { id: socioId }, data });

        // Propagate document change to the linked User if applicable.
        if (existing.userId && docCambia) {
          await tx.user.update({
            where: { id: existing.userId },
            data: {
              tipoDocumento:
                normalized.tipoDocumento ?? existing.tipoDocumento,
              numeroDocumento:
                normalized.numeroDocumento ?? existing.numeroDocumento,
            },
          });
        }
      });
    } catch (e) {
      if (e instanceof RegistroYaResuelto) {
        return { ok: false, error: "El registro ya fue resuelto." };
      }
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        return {
          ok: false,
          error:
            "Ese DNI ya está registrado en otro socio; no se aplicó.",
        };
      }
      throw e;
    }

    revalidatePath("/socios");
    revalidatePath("/socios/registros");
    return { ok: true };
  } catch (e) {
    console.error("aprobarRegistroPublico", e);
    return { ok: false, error: "No se pudo aprobar el registro." };
  }
}

export async function rechazarRegistroPublico(
  id: string,
  motivo: string,
): Promise<ActionResult> {
  const me = await requireReview();
  if (!me) return { ok: false, error: "No tienes permisos para esta acción." };

  const m = (motivo ?? "").trim();
  if (m.length < 5) {
    return { ok: false, error: "Indica un motivo (mínimo 5 caracteres)." };
  }

  const upd = await prisma.solicitudRegistroPublico.updateMany({
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
      error: "El registro no existe o ya fue resuelto.",
    };
  }

  revalidatePath("/socios");
  revalidatePath("/socios/registros");
  return { ok: true };
}

export async function contarRegistrosPublicos(): Promise<number> {
  const me = await requireReview();
  if (!me) return 0;
  return prisma.solicitudRegistroPublico.count({ where: { estado: "pendiente" } });
}
