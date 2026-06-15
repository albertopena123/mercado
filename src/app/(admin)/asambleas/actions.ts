"use server";

import { revalidatePath } from "next/cache";
import {
  Prisma,
  type EstadoAsistencia,
  type TipoAsamblea,
  type EstadoAsamblea,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/server";
import type { PermissionKey } from "@/lib/auth/permissions";
import { peruDateTime } from "@/lib/fecha";
import { generarCodigoVerificacion, anioLima } from "@/lib/constancia/codigo";
import type {
  ActionResult,
  CreateAsambleaInput,
  UpdateAsambleaPatch,
  ListAsambleasResult,
  AsambleaDetail,
  AsambleaRow,
  CheckInResult,
} from "./types";

const PAGE_SIZE = 25;
const PAGE_SIZES = [25, 50, 100];
function clampSize(n?: number): number {
  return n && PAGE_SIZES.includes(n) ? n : PAGE_SIZE;
}

class Denied extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Denied";
  }
}

async function authorize(perm: PermissionKey): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new Denied("No autenticado.");
  if (!user.permissions.has(perm))
    throw new Denied("No tienes permisos para esta acción.");
  return user;
}

function fail(error: string, fieldErrors?: Record<string, string>): ActionResult {
  return { ok: false, error, fieldErrors };
}
function ok<T>(data?: T): ActionResult<T> {
  return { ok: true, data };
}
function refresh(id?: string) {
  revalidatePath("/asambleas");
  if (id) revalidatePath(`/asambleas/${id}`);
}

function socioNombre(s: {
  apellidoPaterno: string;
  apellidoMaterno: string | null;
  nombres: string;
}): string {
  return `${s.apellidoPaterno} ${s.apellidoMaterno ?? ""}, ${s.nombres}`.replace(
    /\s+,/,
    ",",
  );
}

export async function listAsambleas(params: {
  page?: number;
  pageSize?: number;
  q?: string;
  estado?: EstadoAsamblea;
}): Promise<ActionResult<ListAsambleasResult>> {
  try {
    await authorize("asambleas.read");
    const p = Math.max(1, params.page ?? 1);
    const pageSize = clampSize(params.pageSize);
    const where: Prisma.AsambleaWhereInput = {};
    if (params.estado) where.estado = params.estado;
    const q = params.q?.trim();
    if (q) where.titulo = { contains: q, mode: "insensitive" };

    const [total, rows] = await Promise.all([
      prisma.asamblea.count({ where }),
      prisma.asamblea.findMany({
        where,
        orderBy: { fecha: "desc" },
        skip: (p - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          titulo: true,
          tipo: true,
          fecha: true,
          estado: true,
          quorumMinimo: true,
          _count: { select: { asistencias: true } },
          asistencias: {
            where: { estado: { in: ["presente", "tardanza"] } },
            select: { id: true },
          },
        },
      }),
    ]);

    const items: AsambleaRow[] = rows.map((a) => ({
      id: a.id,
      titulo: a.titulo,
      tipo: a.tipo,
      fecha: a.fecha.toISOString(),
      estado: a.estado,
      total: a._count.asistencias,
      asistieron: a.asistencias.length,
      quorumMinimo: a.quorumMinimo,
    }));

    return ok({ items, total, page: p, pageSize });
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("listAsambleas", e);
    return fail("No se pudieron cargar las asambleas.");
  }
}

export async function getAsamblea(
  id: string,
): Promise<ActionResult<AsambleaDetail>> {
  try {
    await authorize("asambleas.read");
    const a = await prisma.asamblea.findUnique({
      where: { id },
      include: {
        asistencias: {
          include: {
            socio: {
              select: {
                id: true,
                codigo: true,
                apellidoPaterno: true,
                apellidoMaterno: true,
                nombres: true,
              },
            },
          },
          orderBy: [
            { socio: { apellidoPaterno: "asc" } },
            { socio: { nombres: "asc" } },
          ],
        },
      },
    });
    if (!a) return fail("Asamblea no encontrada.");

    const counts = { presente: 0, ausente: 0, justificado: 0, tardanza: 0 };
    for (const x of a.asistencias) counts[x.estado]++;

    return ok({
      id: a.id,
      titulo: a.titulo,
      tipo: a.tipo,
      fecha: a.fecha.toISOString(),
      lugar: a.lugar,
      agenda: a.agenda,
      estado: a.estado,
      quorumMinimo: a.quorumMinimo,
      toleranciaMin: a.toleranciaMin,
      total: a.asistencias.length,
      presente: counts.presente,
      ausente: counts.ausente,
      justificado: counts.justificado,
      tardanza: counts.tardanza,
      asistencias: a.asistencias.map((x) => ({
        id: x.id,
        socioId: x.socioId,
        socioNombre: socioNombre(x.socio),
        socioCodigo: x.socio.codigo,
        estado: x.estado,
        observacion: x.observacion,
      })),
    });
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("getAsamblea", e);
    return fail("No se pudo cargar la asamblea.");
  }
}

export async function createAsamblea(
  input: CreateAsambleaInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const me = await authorize("asambleas.write");
    const titulo = (input.titulo ?? "").trim();
    const fe: Record<string, string> = {};
    if (titulo.length < 3) fe.titulo = "El título es obligatorio.";
    // fecha + hora de inicio combinadas, interpretadas como hora de Perú
    const fecha = input.fecha
      ? peruDateTime(input.fecha, input.hora ?? "00:00")
      : null;
    if (!fecha || isNaN(fecha.getTime())) fe.fecha = "Fecha inválida.";
    let quorum: number | null = null;
    if (input.quorumMinimo != null && String(input.quorumMinimo) !== "") {
      const n = Number(input.quorumMinimo);
      if (isNaN(n) || n < 0 || n > 100) fe.quorumMinimo = "Debe ser 0–100.";
      else quorum = n;
    }
    let tolerancia = 15;
    if (input.toleranciaMin != null && String(input.toleranciaMin) !== "") {
      const t = Number(input.toleranciaMin);
      if (isNaN(t) || t < 0 || t > 240) fe.toleranciaMin = "0–240 min.";
      else tolerancia = t;
    }
    if (Object.keys(fe).length > 0)
      return fail("Revisa los campos marcados.", fe);

    // Snapshot de socios activos al momento de crear la asamblea.
    const activos = await prisma.socio.findMany({
      where: { estado: "activo" },
      select: { id: true },
    });

    const created = await prisma.$transaction(async (tx) => {
      const asamblea = await tx.asamblea.create({
        data: {
          titulo,
          tipo: input.tipo,
          fecha: fecha!,
          lugar: input.lugar?.trim() || null,
          agenda: input.agenda?.trim() || null,
          quorumMinimo: quorum,
          toleranciaMin: tolerancia,
          codigoVerificacion: generarCodigoVerificacion(anioLima()),
          createdById: me.id,
        },
      });
      if (activos.length > 0) {
        await tx.asistencia.createMany({
          data: activos.map((s) => ({
            asambleaId: asamblea.id,
            socioId: s.id,
            estado: "ausente" as EstadoAsistencia,
          })),
        });
      }
      return asamblea;
    });

    refresh();
    return ok({ id: created.id });
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("createAsamblea", e);
    return fail("No se pudo crear la asamblea.");
  }
}

export async function updateAsamblea(
  id: string,
  patch: UpdateAsambleaPatch,
): Promise<ActionResult> {
  try {
    await authorize("asambleas.write");
    const data: Prisma.AsambleaUpdateInput = {};
    if (patch.titulo !== undefined) {
      const t = patch.titulo.trim();
      if (t.length < 3) return fail("Título inválido.", { titulo: "Mínimo 3." });
      data.titulo = t;
    }
    if (patch.tipo !== undefined) data.tipo = patch.tipo as TipoAsamblea;
    if (patch.estado !== undefined) data.estado = patch.estado as EstadoAsamblea;
    if (patch.fecha !== undefined) {
      // Combinar fecha + hora interpretadas como hora de Perú (igual que
      // createAsamblea); antes usaba new Date() (UTC/zona del servidor) e
      // ignoraba la hora, corriendo el instante de inicio.
      const d = peruDateTime(patch.fecha, patch.hora ?? "00:00");
      if (isNaN(d.getTime())) return fail("Fecha inválida.", { fecha: "Inválida." });
      data.fecha = d;
    }
    if (patch.lugar !== undefined) data.lugar = patch.lugar.trim() || null;
    if (patch.agenda !== undefined) data.agenda = patch.agenda.trim() || null;
    if (patch.quorumMinimo !== undefined) {
      if (patch.quorumMinimo == null || String(patch.quorumMinimo) === "") {
        data.quorumMinimo = null;
      } else {
        const n = Number(patch.quorumMinimo);
        if (isNaN(n) || n < 0 || n > 100)
          return fail("Quórum inválido.", { quorumMinimo: "0–100." });
        data.quorumMinimo = n;
      }
    }
    await prisma.asamblea.update({ where: { id }, data });
    refresh(id);
    return ok();
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("updateAsamblea", e);
    return fail("No se pudo actualizar la asamblea.");
  }
}

export async function deleteAsamblea(id: string): Promise<ActionResult> {
  try {
    await authorize("asambleas.delete");
    await prisma.asamblea.delete({ where: { id } });
    refresh();
    return ok();
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("deleteAsamblea", e);
    return fail("No se pudo eliminar la asamblea.");
  }
}

export async function checkInByDni(
  asambleaId: string,
  dni: string,
): Promise<ActionResult<CheckInResult>> {
  try {
    const me = await authorize("asambleas.attendance");
    const num = (dni ?? "").trim();
    if (!/^\d{6,12}$/.test(num))
      return fail("Ingresa un número de documento válido.");

    const asamblea = await prisma.asamblea.findUnique({
      where: { id: asambleaId },
      select: { fecha: true, toleranciaMin: true, estado: true },
    });
    if (!asamblea) return fail("Asamblea no encontrada.");
    // Una asamblea cerrada tiene la asistencia finalizada: no se registra por la
    // puerta. Las correcciones puntuales se hacen con las pastillas manuales.
    if (asamblea.estado === "cerrada")
      return fail("La asamblea está cerrada; no se puede registrar asistencia.");

    // Resolver el socio por número de documento. numeroDocumento NO es único por
    // sí solo (la unicidad es por tipoDocumento + numeroDocumento), así que si
    // hay más de un socio con el mismo número (p. ej. un DNI y un pasaporte que
    // comparten dígitos) rechazamos para no marcar presente a la persona
    // equivocada y falsear el quórum.
    const socios = await prisma.socio.findMany({
      where: { numeroDocumento: num },
      select: { id: true },
    });
    if (socios.length === 0)
      return fail("No existe un socio con ese documento.");
    if (socios.length > 1)
      return fail(
        "Hay más de un socio con ese número de documento. Regístralo desde la lista de la asamblea.",
      );
    const socioId = socios[0].id;

    // Buscar la fila de asistencia de ese socio en esta asamblea.
    const asis = await prisma.asistencia.findFirst({
      where: { asambleaId, socioId },
      include: {
        socio: {
          select: {
            codigo: true,
            apellidoPaterno: true,
            apellidoMaterno: true,
            nombres: true,
          },
        },
      },
    });

    if (!asis) {
      return fail("El socio no está en la lista de esta asamblea.");
    }

    const yaRegistrado =
      asis.estado === "presente" || asis.estado === "tardanza";

    let estado: "presente" | "tardanza";
    let hora: Date;

    if (yaRegistrado) {
      // El primer registro manda: un re-escaneo NO cambia el estado ni la hora.
      // Su llegada ya quedó sellada (presente/tardanza). Las correcciones se
      // hacen con las pastillas manuales, no por la puerta.
      estado = asis.estado === "presente" ? "presente" : "tardanza";
      hora = asis.updatedAt;
    } else {
      // Primer registro: presente si llega dentro de inicio + tolerancia; si
      // no, tardanza. (Un socio "ausente" o "justificado" que aparece y escanea
      // queda registrado según la hora real de llegada.)
      const now = new Date();
      const cutoff = new Date(
        asamblea.fecha.getTime() + (asamblea.toleranciaMin ?? 15) * 60000,
      );
      estado = now.getTime() <= cutoff.getTime() ? "presente" : "tardanza";
      hora = now;
      await prisma.asistencia.update({
        where: { id: asis.id },
        data: { estado, byUserId: me.id },
      });
      refresh(asambleaId);
    }

    return ok({
      socioNombre: socioNombre(asis.socio),
      socioCodigo: asis.socio.codigo,
      estado,
      hora: hora.toISOString(),
      yaRegistrado,
    });
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("checkInByDni", e);
    return fail("No se pudo registrar el check-in.");
  }
}

export async function marcarTodosAsistencia(
  asambleaId: string,
  estado: EstadoAsistencia,
): Promise<ActionResult<{ count: number }>> {
  try {
    const me = await authorize("asambleas.attendance");
    const r = await prisma.asistencia.updateMany({
      where: { asambleaId },
      data: { estado, byUserId: me.id },
    });
    refresh(asambleaId);
    return ok({ count: r.count });
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("marcarTodosAsistencia", e);
    return fail("No se pudo actualizar la asistencia.");
  }
}

export async function setAsistencia(
  asistenciaId: string,
  estado: EstadoAsistencia,
  observacion?: string,
): Promise<ActionResult> {
  try {
    const me = await authorize("asambleas.attendance");
    const row = await prisma.asistencia.update({
      where: { id: asistenciaId },
      data: {
        estado,
        observacion: observacion?.trim() || null,
        byUserId: me.id,
      },
      select: { asambleaId: true },
    });
    refresh(row.asambleaId);
    return ok();
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("setAsistencia", e);
    return fail("No se pudo registrar la asistencia.");
  }
}
