"use server";

import { revalidatePath } from "next/cache";
import { Prisma, type EstadoPuesto } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/server";
import type { PermissionKey } from "@/lib/auth/permissions";
import { normalizeToken } from "@/lib/socios/normalize";
import type {
  ActionResult,
  CreatePuestoInput,
  UpdatePuestoPatch,
  ListPuestosParams,
  ListPuestosResult,
  PuestoRow,
  PuestoDetail,
  PuestoStats,
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
function refresh() {
  revalidatePath("/puestos");
}
function isP2002(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

function buildSearchKey(p: {
  codigo: string;
  giro?: string | null;
  zona?: string | null;
}): string {
  return [p.codigo, p.giro, p.zona]
    .filter((x): x is string => Boolean(x))
    .map(normalizeToken)
    .join(" ");
}

const SORT_KEYS = ["codigo", "giro", "zona", "estado"] as const;
type SortKey = (typeof SORT_KEYS)[number];

function buildOrderBy(
  sort: SortKey,
  dir: "asc" | "desc",
): Prisma.PuestoOrderByWithRelationInput[] {
  switch (sort) {
    case "giro":
      return [{ giro: dir }, { codigo: "asc" }];
    case "zona":
      return [{ zona: dir }, { codigo: "asc" }];
    case "estado":
      return [{ estado: dir }, { codigo: "asc" }];
    case "codigo":
    default:
      return [{ codigo: dir }];
  }
}

function buildWhere(params: {
  q?: string;
  estado?: EstadoPuesto;
}): Prisma.PuestoWhereInput {
  const where: Prisma.PuestoWhereInput = {};
  if (params.estado) where.estado = params.estado;
  const q = params.q?.trim() ?? "";
  if (q) {
    const tokens = q
      .split(/\s+/)
      .filter((t) => t.length > 0)
      .map(normalizeToken);
    if (tokens.length > 0) {
      where.AND = tokens.map((token) => ({ searchKey: { contains: token } }));
    }
  }
  return where;
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

export async function listPuestos(
  params: ListPuestosParams,
): Promise<ActionResult<ListPuestosResult>> {
  try {
    await authorize("puestos.read");
    const page = Math.max(1, params.page ?? 1);
    const sort: SortKey = SORT_KEYS.includes(params.sort as SortKey)
      ? (params.sort as SortKey)
      : "codigo";
    const dir: "asc" | "desc" = params.dir === "desc" ? "desc" : "asc";
    const pageSize = clampSize(params.pageSize);
    const where = buildWhere(params);

    const [total, rows] = await Promise.all([
      prisma.puesto.count({ where }),
      prisma.puesto.findMany({
        where,
        orderBy: buildOrderBy(sort, dir),
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          codigo: true,
          giro: true,
          zona: true,
          area: true,
          estado: true,
          fotoUrl: true,
          asignaciones: {
            where: { hasta: null },
            take: 1,
            select: {
              socio: {
                select: {
                  id: true,
                  apellidoPaterno: true,
                  apellidoMaterno: true,
                  nombres: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const items: PuestoRow[] = rows.map((p) => {
      const vig = p.asignaciones[0]?.socio;
      return {
        id: p.id,
        codigo: p.codigo,
        giro: p.giro,
        zona: p.zona,
        area: p.area,
        estado: p.estado,
        fotoUrl: p.fotoUrl,
        socioActual: vig
          ? { id: vig.id, nombre: socioNombre(vig) }
          : null,
      };
    });

    return ok({ items, total, page, pageSize, sort, dir });
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("listPuestos", e);
    return fail("No se pudieron cargar los puestos.");
  }
}

export async function getPuesto(
  id: string,
): Promise<ActionResult<PuestoDetail>> {
  try {
    await authorize("puestos.read");
    const p = await prisma.puesto.findUnique({
      where: { id },
      include: {
        asignaciones: {
          orderBy: [{ hasta: "asc" }, { desde: "desc" }],
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
            byUser: { select: { name: true } },
          },
        },
      },
    });
    if (!p) return fail("Puesto no encontrado.");

    return ok({
      id: p.id,
      codigo: p.codigo,
      giro: p.giro,
      zona: p.zona,
      area: p.area,
      estado: p.estado,
      fotoUrl: p.fotoUrl,
      observaciones: p.observaciones,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      asignaciones: p.asignaciones.map((a) => ({
        id: a.id,
        socioId: a.socioId,
        socioNombre: socioNombre(a.socio),
        socioCodigo: a.socio.codigo,
        desde: a.desde.toISOString(),
        hasta: a.hasta ? a.hasta.toISOString() : null,
        motivo: a.motivo,
        byUser: a.byUser?.name ?? null,
      })),
    });
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("getPuesto", e);
    return fail("No se pudo cargar el puesto.");
  }
}

function validate(
  input: Partial<CreatePuestoInput>,
  isCreate: boolean,
): { fieldErrors: Record<string, string>; normalized: Partial<CreatePuestoInput> } {
  const fe: Record<string, string> = {};
  const out: Partial<CreatePuestoInput> = {};

  if (isCreate || input.codigo !== undefined) {
    const c = (input.codigo ?? "").trim();
    if (!c) fe.codigo = "El código del puesto es obligatorio.";
    else out.codigo = c;
  }
  if (input.area !== undefined && input.area !== null) {
    const n = Number(input.area);
    if (isNaN(n) || n < 0) fe.area = "Área inválida.";
    else out.area = n;
  } else if (input.area === null) {
    out.area = null;
  }
  for (const k of ["giro", "zona", "observaciones"] as const) {
    if (input[k] !== undefined) {
      const t = String(input[k]).trim();
      (out as Record<string, string | undefined>)[k] = t || undefined;
    }
  }
  if (input.estado !== undefined) out.estado = input.estado;
  return { fieldErrors: fe, normalized: out };
}

export async function createPuesto(
  input: CreatePuestoInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const me = await authorize("puestos.write");
    const { fieldErrors, normalized } = validate(input, true);
    if (Object.keys(fieldErrors).length > 0)
      return fail("Revisa los campos marcados.", fieldErrors);

    try {
      const created = await prisma.puesto.create({
        data: {
          codigo: normalized.codigo!,
          giro: normalized.giro ?? null,
          zona: normalized.zona ?? null,
          area: normalized.area ?? null,
          estado: normalized.estado ?? "vacio",
          observaciones: normalized.observaciones ?? null,
          searchKey: buildSearchKey({
            codigo: normalized.codigo!,
            giro: normalized.giro,
            zona: normalized.zona,
          }),
          createdById: me.id,
          updatedById: me.id,
        },
      });
      refresh();
      return ok({ id: created.id });
    } catch (e) {
      if (isP2002(e))
        return fail("Ya existe un puesto con ese código.", {
          codigo: "Código en uso.",
        });
      throw e;
    }
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("createPuesto", e);
    return fail("No se pudo crear el puesto.");
  }
}

export async function updatePuesto(
  id: string,
  patch: UpdatePuestoPatch,
): Promise<ActionResult> {
  try {
    const me = await authorize("puestos.write");
    const existing = await prisma.puesto.findUnique({
      where: { id },
      select: { codigo: true, giro: true, zona: true },
    });
    if (!existing) return fail("Puesto no encontrado.");

    const { fieldErrors, normalized } = validate(patch, false);
    if (Object.keys(fieldErrors).length > 0)
      return fail("Revisa los campos marcados.", fieldErrors);

    const data: Prisma.PuestoUpdateInput = {
      updatedBy: { connect: { id: me.id } },
    };
    if (normalized.codigo) data.codigo = normalized.codigo;
    if ("giro" in normalized) data.giro = normalized.giro ?? null;
    if ("zona" in normalized) data.zona = normalized.zona ?? null;
    if ("area" in normalized) data.area = normalized.area ?? null;
    if (normalized.estado) data.estado = normalized.estado;
    if ("observaciones" in normalized)
      data.observaciones = normalized.observaciones ?? null;

    data.searchKey = buildSearchKey({
      codigo: normalized.codigo ?? existing.codigo,
      giro: "giro" in normalized ? normalized.giro : existing.giro,
      zona: "zona" in normalized ? normalized.zona : existing.zona,
    });

    try {
      await prisma.puesto.update({ where: { id }, data });
    } catch (e) {
      if (isP2002(e))
        return fail("Ya existe un puesto con ese código.", {
          codigo: "Código en uso.",
        });
      throw e;
    }
    refresh();
    return ok();
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("updatePuesto", e);
    return fail("No se pudo actualizar el puesto.");
  }
}

export async function deletePuesto(id: string): Promise<ActionResult> {
  try {
    await authorize("puestos.delete");
    const existing = await prisma.puesto.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) return fail("Puesto no encontrado.");
    await prisma.puesto.delete({ where: { id } });
    refresh();
    return ok();
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("deletePuesto", e);
    return fail("No se pudo eliminar el puesto.");
  }
}

export async function assignPuesto(
  puestoId: string,
  socioId: string,
  motivo?: string,
): Promise<ActionResult> {
  try {
    const me = await authorize("puestos.assign");
    await prisma.$transaction(async (tx) => {
      // Bloquea la fila del puesto para serializar asignaciones concurrentes:
      // sin esto, dos asignaciones simultáneas del mismo puesto pueden dejar
      // dos asignaciones abiertas (hasta = null) a la vez (dos socios dueños).
      await tx.$queryRaw`SELECT id FROM "Puesto" WHERE id = ${puestoId} FOR UPDATE`;
      const puesto = await tx.puesto.findUnique({
        where: { id: puestoId },
        select: { id: true },
      });
      if (!puesto) throw new Denied("Puesto no encontrado.");
      const socio = await tx.socio.findUnique({
        where: { id: socioId },
        select: { id: true },
      });
      if (!socio) throw new Denied("Socio no encontrado.");

      // Cerrar la asignación vigente (si la hay).
      await tx.puestoAsignacion.updateMany({
        where: { puestoId, hasta: null },
        data: { hasta: new Date(), motivo: "Reasignación" },
      });
      await tx.puestoAsignacion.create({
        data: {
          puestoId,
          socioId,
          motivo: motivo?.trim() || null,
          byUserId: me.id,
        },
      });
      await tx.puesto.update({
        where: { id: puestoId },
        data: { estado: "activo", updatedById: me.id },
      });
    });
    refresh();
    return ok();
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("assignPuesto", e);
    return fail("No se pudo asignar el puesto.");
  }
}

export async function unassignPuesto(
  puestoId: string,
  motivo: string,
): Promise<ActionResult> {
  try {
    const me = await authorize("puestos.assign");
    const m = (motivo ?? "").trim();
    if (m.length < 3)
      return fail("Indica un motivo para liberar el puesto.", {
        motivo: "Mínimo 3 caracteres.",
      });
    await prisma.$transaction(async (tx) => {
      const closed = await tx.puestoAsignacion.updateMany({
        where: { puestoId, hasta: null },
        data: { hasta: new Date(), motivo: m },
      });
      if (closed.count === 0) throw new Denied("El puesto ya está libre.");
      await tx.puesto.update({
        where: { id: puestoId },
        data: { estado: "vacio", updatedById: me.id },
      });
    });
    refresh();
    return ok();
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("unassignPuesto", e);
    return fail("No se pudo liberar el puesto.");
  }
}

export async function getPuestoStats(): Promise<ActionResult<PuestoStats>> {
  try {
    await authorize("puestos.read");
    const grouped = await prisma.puesto.groupBy({
      by: ["estado"],
      _count: { _all: true },
    });
    const stats: PuestoStats = {
      total: 0,
      activo: 0,
      vacio: 0,
      clausurado: 0,
      construccion: 0,
    };
    for (const g of grouped) {
      stats.total += g._count._all;
      stats[g.estado] = g._count._all;
    }
    return ok(stats);
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("getPuestoStats", e);
    return fail("No se pudieron cargar las estadísticas.");
  }
}
