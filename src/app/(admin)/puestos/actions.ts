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
import { esDocumentoPendiente } from "@/lib/socios/document";
import { toNumber } from "@/lib/money";
import {
  GIRO_LABEL,
  bandaPorNumero,
  dimensionPorBanda,
  puestoCodigo,
  maxNumero,
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

const MSG_PUESTO_CON_HISTORIAL =
  "No se puede eliminar: el puesto tiene historial de asignaciones. Cámbialo a estado “clausurado” para conservar la trazabilidad.";

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
      // Cada token debe matchear el searchKey del puesto (código/bloque/giro) o
      // el searchKey del socio ocupante vigente, que es la concatenación
      // normalizada de documento + nombres + código. Así un puesto puede
      // encontrarse por el N.º de documento (o el nombre) de su titular actual.
      where.AND = tokens.map((token) => {
        const branches: Prisma.PuestoWhereInput[] = [
          { searchKey: { contains: token } },
        ];
        // La rama "socio" solo para tokens de ≥2 caracteres. Una sola letra
        // (p. ej. un bloque A–M) aparecería en casi cualquier apellido y
        // volvería el token prácticamente universal, degradando la búsqueda por
        // bloque. Documentos (8–11 díg.) y nombres siempre superan ese umbral.
        if (token.length >= 2) {
          branches.push({
            asignaciones: {
              some: { hasta: null, socio: { searchKey: { contains: token } } },
            },
          });
        }
        return branches.length === 1 ? branches[0] : { OR: branches };
      });
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
    // La tabla lista solo puestos reales (SS-HH/almacenes solo viven en el plano).
    const where: Prisma.PuestoWhereInput = { ...buildWhere(params), tipo: "puesto" };

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
                  numeroDocumento: true,
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
        socioActual: vig
          ? {
              id: vig.id,
              nombre: socioNombre(vig),
              documento: vig.numeroDocumento,
              sinDni: esDocumentoPendiente(vig.numeroDocumento),
            }
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

    // Número visible del puesto = su posición entre los puestos reales del
    // bloque (excluye SS-HH/almacenes), ordenado por número físico.
    const puestoNro =
      p.tipo === "puesto"
        ? await prisma.puesto.count({
            where: {
              etapa: p.etapa,
              bloque: p.bloque,
              tipo: "puesto",
              numero: { lte: p.numero },
            },
          })
        : 0;

    return ok({
      id: p.id,
      codigo: p.codigo,
      etapa: p.etapa,
      bloque: p.bloque,
      numero: p.numero,
      puestoNro,
      tipo: p.tipo,
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

function validate(
  input: Partial<CreatePuestoInput>,
  isCreate: boolean,
  existingEtapa?: number,
): {
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
    // El máximo depende de la etapa: en un update parcial sin etapa, usar la
    // etapa real del puesto (existingEtapa) — antes caía a 24 y rechazaba los
    // números 25–36 válidos en etapa 2.
    const etapaForMax = out.etapa ?? existingEtapa ?? 1;
    const max = maxNumero(Number(etapaForMax) === 2 ? 2 : 1);
    if (!Number.isInteger(n) || n < 1 || n > max)
      fe.numero = `Número inválido (1–${max}).`;
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
    const banda = normalized.banda ?? bandaPorNumero(numero, etapa);
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

    const { fieldErrors, normalized } = validate(patch, false, existing.etapa);
    if (Object.keys(fieldErrors).length > 0)
      return fail("Revisa los campos marcados.", fieldErrors);

    const etapa = normalized.etapa ?? existing.etapa;
    const bloque = normalized.bloque ?? existing.bloque;
    const numero = normalized.numero ?? existing.numero;
    let banda = existing.banda;
    if (normalized.banda !== undefined) banda = normalized.banda;
    else if (normalized.numero !== undefined) banda = bandaPorNumero(numero, etapa);
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
    if (normalized.estado) {
      // Coherencia estado↔ocupación: no permitir estados imposibles. "vacio" con
      // un socio asignado o "activo" sin asignación rompen la invariante (el
      // estado se deriva de la ocupación vía assign/unassign, no a mano).
      if (normalized.estado === "vacio" || normalized.estado === "activo") {
        const activa = await prisma.puestoAsignacion.findFirst({
          where: { puestoId: id, hasta: null },
          select: { id: true },
        });
        if (normalized.estado === "vacio" && activa)
          return fail(
            "No puedes marcar el puesto como “vacío”: tiene un socio asignado. Libéralo primero.",
            { estado: "Tiene un socio asignado." },
          );
        if (normalized.estado === "activo" && !activa)
          return fail(
            "No puedes marcar el puesto como “activo”: no tiene socio asignado. Asígnalo primero.",
            { estado: "No tiene socio asignado." },
          );
      }
      data.estado = normalized.estado;
    }
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

    // El borrado es físico. No destruir la trazabilidad de ocupación: si el
    // puesto tuvo (o tiene) asignaciones, la FK Restrict bloquea el borrado a
    // nivel de BD. Aquí lo comprobamos antes para devolver un mensaje claro
    // (clausurar en vez de eliminar) en el caso normal.
    const asignaciones = await prisma.puestoAsignacion.count({
      where: { puestoId: id },
    });
    if (asignaciones > 0) {
      return fail(MSG_PUESTO_CON_HISTORIAL);
    }

    await prisma.puesto.delete({ where: { id } });
    refresh();
    return ok();
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    // Carrera TOCTOU: si se asignó el puesto entre el conteo y el delete, la FK
    // Restrict lanza P2003. Devolvemos el mismo mensaje claro, no el genérico.
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2003"
    ) {
      return fail(MSG_PUESTO_CON_HISTORIAL);
    }
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
        select: { id: true, estado: true, tipo: true },
      });
      if (!puesto) throw new Denied("Puesto no encontrado.");
      // Solo se asignan ESPACIOS comerciales (no SS-HH ni almacenes).
      if (puesto.tipo !== "puesto")
        throw new Denied(
          "Ese espacio no es un puesto comercial (SS-HH/almacén); no puede asignarse a un socio.",
        );
      // No reactivar implícitamente un puesto clausurado o en construcción:
      // asignar no debe saltarse la clausura/obra. Hay que reabrirlo primero.
      if (puesto.estado === "clausurado" || puesto.estado === "construccion")
        throw new Denied(
          `El puesto está en estado “${puesto.estado}”. Reábrelo (cámbialo a vacío) antes de asignarlo.`,
        );
      const socio = await tx.socio.findUnique({
        where: { id: socioId },
        select: { id: true, estado: true },
      });
      if (!socio) throw new Denied("Socio no encontrado.");
      // Simetría con changeEstadoSocio/efectivizarRenuncia (que liberan puestos
      // al retirar/fallecer): no asignar a un socio no activo. Cierra la carrera
      // con un cambio de estado concurrente al estar dentro del FOR UPDATE.
      if (socio.estado !== "activo")
        throw new Denied(
          `No se puede asignar un puesto a un socio en estado “${socio.estado}”.`,
        );

      // Propietario actual (asignación vigente). Si se transfiere a OTRO socio
      // y el saliente tiene deuda pendiente, no se permite: debe regularizar
      // sus cuotas antes de la venta/traspaso.
      const actual = await tx.puestoAsignacion.findFirst({
        where: { puestoId, hasta: null },
        select: { socioId: true },
      });
      if (actual && actual.socioId !== socioId) {
        const pend = await tx.cuota.findMany({
          where: { socioId: actual.socioId, estado: "pendiente" },
          select: { monto: true },
        });
        const deuda = pend.reduce((acc, c) => acc + toNumber(c.monto), 0);
        if (deuda > 0) {
          const prev = await tx.socio.findUnique({
            where: { id: actual.socioId },
            select: {
              apellidoPaterno: true,
              apellidoMaterno: true,
              nombres: true,
            },
          });
          throw new Denied(
            `El propietario actual${prev ? ` (${socioNombre(prev)})` : ""} tiene S/ ${deuda.toFixed(2)} de deuda pendiente. Regulariza sus cuotas antes de transferir el puesto.`,
          );
        }
      }

      await tx.puestoAsignacion.updateMany({
        where: { puestoId, hasta: null },
        data: { hasta: new Date(), motivo: "Transferencia" },
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
      // Bloquea la fila del puesto para serializar contra assignPuesto /
      // formalizarTransferencia / efectivizarRenuncia (mismo lock), evitando
      // reabrir un puesto que otra transacción acaba de reasignar.
      await tx.$queryRaw`SELECT id FROM "Puesto" WHERE id = ${puestoId} FOR UPDATE`;
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
      where: { tipo: "puesto" },
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
        tipo: true,
        estado: true,
        giro: true,
        codigo: true,
        observaciones: true,
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
                numeroDocumento: true,
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
        tipo: p.tipo,
        estado: p.estado,
        giro: p.giro,
        codigo: p.codigo,
        esAlquiler: (p.observaciones ?? "").toLowerCase().includes("alquiler"),
        socioActual: vig
          ? {
              id: vig.id,
              nombre: socioNombre(vig),
              sinDni: esDocumentoPendiente(vig.numeroDocumento),
            }
          : null,
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

// Rangos de banda según etapa.
//   Etapa 1: 3 bandas de 8 = 24 por bloque (abajo→arriba).
//   Etapa 2: una grilla 2×18 = 36 por bloque, todas 3×3 (numeración en U).
function bandaRanges(etapa: number): {
  banda: BandaPuesto;
  from: number;
  to: number;
  dimension: DimensionPuesto;
}[] {
  if (Number(etapa) === 2)
    return [{ banda: "media", from: 1, to: 36, dimension: "d3x3" }];
  return [
    { banda: "baja", from: 1, to: 8, dimension: "d3x5" },
    { banda: "media", from: 9, to: 16, dimension: "d3x3" },
    { banda: "alta", from: 17, to: 24, dimension: "d3x5" },
  ];
}

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

    const ranges = bandaRanges(etapa);
    const data: Prisma.PuestoCreateManyInput[] = [];
    for (const bloque of bloques) {
      for (const r of ranges) {
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
