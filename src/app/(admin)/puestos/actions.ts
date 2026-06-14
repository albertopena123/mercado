"use server";

import { revalidatePath } from "next/cache";
import {
  Prisma,
  type EstadoPuesto,
  type BandaPuesto,
  type DimensionPuesto,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/server";
import type { PermissionKey } from "@/lib/auth/permissions";
import { normalizeToken } from "@/lib/socios/normalize";
import {
  GIRO_LABEL,
  bandaPorNumero,
  dimensionPorBanda,
  puestoCodigo,
} from "@/lib/puestos/giro";
import type {
  ActionResult,
  CreatePuestoInput,
  UpdatePuestoPatch,
  ListPuestosParams,
  ListPuestosResult,
  PuestoRow,
  PuestoDetail,
  PuestoStats,
  PlanoCell,
  GenerarGrillaInput,
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
  bloque: string;
  giro?: CreatePuestoInput["giro"];
}): string {
  const giroLabel = p.giro ? GIRO_LABEL[p.giro] : null;
  return [p.codigo, p.bloque, giroLabel]
    .filter((x): x is string => Boolean(x))
    .map(normalizeToken)
    .join(" ");
}

const SORT_KEYS = ["codigo", "bloque", "numero", "giro", "estado"] as const;
type SortKey = (typeof SORT_KEYS)[number];

function buildOrderBy(
  sort: SortKey,
  dir: "asc" | "desc",
): Prisma.PuestoOrderByWithRelationInput[] {
  switch (sort) {
    case "giro":
      return [{ giro: dir }, { etapa: "asc" }, { bloque: "asc" }, { numero: "asc" }];
    case "estado":
      return [{ estado: dir }, { etapa: "asc" }, { bloque: "asc" }, { numero: "asc" }];
    case "bloque":
      return [{ etapa: dir }, { bloque: dir }, { numero: "asc" }];
    case "numero":
      return [{ etapa: "asc" }, { bloque: "asc" }, { numero: dir }];
    case "codigo":
    default:
      return [{ etapa: dir }, { bloque: dir }, { numero: dir }];
  }
}

function buildWhere(params: {
  q?: string;
  estado?: EstadoPuesto;
  etapa?: number;
  bloque?: string;
}): Prisma.PuestoWhereInput {
  const where: Prisma.PuestoWhereInput = {};
  if (params.estado) where.estado = params.estado;
  if (params.etapa) where.etapa = params.etapa;
  if (params.bloque) where.bloque = params.bloque.toUpperCase();
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
          etapa: true,
          bloque: true,
          numero: true,
          banda: true,
          dimension: true,
          giro: true,
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
        etapa: p.etapa,
        bloque: p.bloque,
        numero: p.numero,
        banda: p.banda,
        dimension: p.dimension,
        giro: p.giro,
        estado: p.estado,
        fotoUrl: p.fotoUrl,
        socioActual: vig ? { id: vig.id, nombre: socioNombre(vig) } : null,
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
      etapa: p.etapa,
      bloque: p.bloque,
      numero: p.numero,
      banda: p.banda,
      dimension: p.dimension,
      giro: p.giro,
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

function validate(input: Partial<CreatePuestoInput>, isCreate: boolean): {
  fieldErrors: Record<string, string>;
  normalized: Partial<CreatePuestoInput>;
} {
  const fe: Record<string, string> = {};
  const out: Partial<CreatePuestoInput> = {};

  if (isCreate || input.etapa !== undefined) {
    const e = Number(input.etapa);
    if (e !== 1 && e !== 2) fe.etapa = "Etapa inválida (1 o 2).";
    else out.etapa = e;
  }
  if (isCreate || input.bloque !== undefined) {
    const b = String(input.bloque ?? "").trim().toUpperCase();
    if (!/^[A-M]$/.test(b)) fe.bloque = "Bloque inválido (A–M).";
    else out.bloque = b;
  }
  if (isCreate || input.numero !== undefined) {
    const n = Number(input.numero);
    if (!Number.isInteger(n) || n < 1) fe.numero = "Número inválido.";
    else out.numero = n;
  }
  if (input.banda !== undefined) out.banda = input.banda;
  if (input.dimension !== undefined) out.dimension = input.dimension;
  if (input.giro !== undefined) out.giro = input.giro ?? null;
  if (input.estado !== undefined) out.estado = input.estado;
  if (input.observaciones !== undefined) {
    const t = String(input.observaciones).trim();
    out.observaciones = t || undefined;
  }
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

    const etapa = normalized.etapa!;
    const bloque = normalized.bloque!;
    const numero = normalized.numero!;
    const banda = normalized.banda ?? bandaPorNumero(numero);
    const dimension = normalized.dimension ?? dimensionPorBanda(banda);
    const codigo = puestoCodigo(etapa, bloque, numero);
    const giro = normalized.giro ?? null;

    try {
      const created = await prisma.puesto.create({
        data: {
          etapa,
          bloque,
          numero,
          banda,
          dimension,
          giro,
          codigo,
          estado: normalized.estado ?? "vacio",
          observaciones: normalized.observaciones ?? null,
          searchKey: buildSearchKey({ codigo, bloque, giro }),
          createdById: me.id,
          updatedById: me.id,
        },
      });
      refresh();
      return ok({ id: created.id });
    } catch (e) {
      if (isP2002(e))
        return fail(`Ya existe el puesto ${codigo}.`, {
          numero: "Ese número ya existe en el bloque.",
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
      select: {
        etapa: true,
        bloque: true,
        numero: true,
        banda: true,
        dimension: true,
        giro: true,
      },
    });
    if (!existing) return fail("Puesto no encontrado.");

    const { fieldErrors, normalized } = validate(patch, false);
    if (Object.keys(fieldErrors).length > 0)
      return fail("Revisa los campos marcados.", fieldErrors);

    const etapa = normalized.etapa ?? existing.etapa;
    const bloque = normalized.bloque ?? existing.bloque;
    const numero = normalized.numero ?? existing.numero;
    let banda = existing.banda;
    if (normalized.banda !== undefined) banda = normalized.banda;
    else if (normalized.numero !== undefined) banda = bandaPorNumero(numero);
    let dimension = existing.dimension;
    if (normalized.dimension !== undefined) dimension = normalized.dimension;
    else if (banda !== existing.banda) dimension = dimensionPorBanda(banda);
    const giro = "giro" in normalized ? normalized.giro ?? null : existing.giro;
    const codigo = puestoCodigo(etapa, bloque, numero);

    const data: Prisma.PuestoUpdateInput = {
      etapa,
      bloque,
      numero,
      banda,
      dimension,
      giro,
      codigo,
      searchKey: buildSearchKey({ codigo, bloque, giro }),
      updatedBy: { connect: { id: me.id } },
    };
    if (normalized.estado) data.estado = normalized.estado;
    if ("observaciones" in normalized)
      data.observaciones = normalized.observaciones ?? null;

    try {
      await prisma.puesto.update({ where: { id }, data });
    } catch (e) {
      if (isP2002(e))
        return fail(`Ya existe el puesto ${codigo}.`, {
          numero: "Ese número ya existe en el bloque.",
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
      // Bloquea la fila del puesto para serializar asignaciones concurrentes.
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

/* ─────────────────────── Plano ─────────────────────── */

export async function listPuestosForPlano(
  etapa: number,
): Promise<ActionResult<PlanoCell[]>> {
  try {
    await authorize("puestos.read");
    const et = Number(etapa) === 2 ? 2 : 1;
    const rows = await prisma.puesto.findMany({
      where: { etapa: et },
      orderBy: [{ bloque: "asc" }, { numero: "asc" }],
      select: {
        id: true,
        bloque: true,
        numero: true,
        banda: true,
        dimension: true,
        estado: true,
        giro: true,
        codigo: true,
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
    });
    const cells: PlanoCell[] = rows.map((p) => {
      const vig = p.asignaciones[0]?.socio;
      return {
        id: p.id,
        bloque: p.bloque,
        numero: p.numero,
        banda: p.banda,
        dimension: p.dimension,
        estado: p.estado,
        giro: p.giro,
        codigo: p.codigo,
        socioActual: vig ? { id: vig.id, nombre: socioNombre(vig) } : null,
      };
    });
    return ok(cells);
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("listPuestosForPlano", e);
    return fail("No se pudo cargar el plano.");
  }
}

/* ─────────────────────── Generador de grilla ─────────────────────── */

// Numeración anclada abajo: #1 en la banda de abajo (junto al SS-HH) → arriba.
const BANDA_RANGES: {
  banda: BandaPuesto;
  from: number;
  to: number;
  dimension: DimensionPuesto;
}[] = [
  { banda: "baja", from: 1, to: 8, dimension: "d3x5" },
  { banda: "media", from: 9, to: 24, dimension: "d3x3" },
  { banda: "alta", from: 25, to: 48, dimension: "d3x5" },
];

export async function generarGrillaEtapa(
  input: GenerarGrillaInput,
): Promise<ActionResult<{ creados: number; omitidos: number }>> {
  try {
    const me = await authorize("puestos.write");
    const etapa = Number(input.etapa);
    if (etapa !== 1 && etapa !== 2) return fail("Etapa inválida (1 o 2).");
    const bloques = (input.bloques ?? [])
      .map((b) => String(b).toUpperCase())
      .filter((b) => /^[A-M]$/.test(b));
    if (bloques.length === 0)
      return fail("Selecciona al menos un bloque (A–M).");

    const data: Prisma.PuestoCreateManyInput[] = [];
    for (const bloque of bloques) {
      for (const r of BANDA_RANGES) {
        for (let n = r.from; n <= r.to; n++) {
          const codigo = puestoCodigo(etapa, bloque, n);
          data.push({
            etapa,
            bloque,
            numero: n,
            banda: r.banda,
            dimension: r.dimension,
            codigo,
            estado: "vacio",
            searchKey: buildSearchKey({ codigo, bloque, giro: null }),
            createdById: me.id,
            updatedById: me.id,
          });
        }
      }
    }

    const res = await prisma.puesto.createMany({ data, skipDuplicates: true });
    refresh();
    return ok({ creados: res.count, omitidos: data.length - res.count });
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("generarGrillaEtapa", e);
    return fail("No se pudo generar la grilla.");
  }
}
