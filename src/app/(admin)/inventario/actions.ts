"use server";

import { revalidatePath } from "next/cache";
import {
  Prisma,
  type UbicacionBien,
  type EstadoBien,
  type TipoMovBien,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/server";
import type { PermissionKey } from "@/lib/auth/permissions";
import { normalizeToken, splitSearchTokens } from "@/lib/socios/normalize";
import { nextCodigo } from "@/lib/inventario/codigo";
import type {
  ActionResult,
  CreateBienInput,
  UpdateBienPatch,
  MovimientoInput,
  ListBienesParams,
  ListBienesResult,
  BienRow,
  BienDetail,
  BienStats,
  SortKey,
} from "./types";

const PAGE_SIZE = 25;
const PAGE_SIZES = [25, 50, 100];
function clampSize(n?: number): number {
  return n && PAGE_SIZES.includes(n) ? n : PAGE_SIZE;
}

const UBICACIONES: UbicacionBien[] = ["oficina", "almacen"];
const ESTADOS: EstadoBien[] = [
  "nuevo",
  "conservado",
  "en_uso",
  "sin_usar",
  "desuso",
  "mal_estado",
  "roto",
  "baja",
];
const ALERTA: EstadoBien[] = ["mal_estado", "roto", "baja"];

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
  revalidatePath("/inventario");
}

function buildSearchKey(p: {
  codigo: string;
  nombre: string;
  marcaModelo?: string | null;
  unidad?: string | null;
}): string {
  return [p.codigo, p.nombre, p.marcaModelo, p.unidad]
    .filter((x): x is string => Boolean(x))
    .map(normalizeToken)
    .join(" ");
}

const SORT_KEYS = ["codigo", "nombre", "cantidad", "estado", "ubicacion"] as const;

function buildOrderBy(
  sort: SortKey,
  dir: "asc" | "desc",
): Prisma.BienOrderByWithRelationInput[] {
  switch (sort) {
    case "nombre":
      return [{ nombre: dir }, { codigo: "asc" }];
    case "cantidad":
      return [{ cantidad: dir }, { nombre: "asc" }];
    case "estado":
      return [{ estado: dir }, { nombre: "asc" }];
    case "ubicacion":
      return [{ ubicacion: dir }, { nombre: "asc" }];
    case "codigo":
    default:
      return [{ codigo: dir }];
  }
}

function buildWhere(params: {
  q?: string;
  ubicacion?: UbicacionBien;
  estado?: EstadoBien;
}): Prisma.BienWhereInput {
  const where: Prisma.BienWhereInput = {};
  if (params.ubicacion) where.ubicacion = params.ubicacion;
  if (params.estado) where.estado = params.estado;
  const q = params.q?.trim() ?? "";
  if (q) {
    const tokens = splitSearchTokens(q).map(normalizeToken);
    if (tokens.length > 0) {
      where.AND = tokens.map((token) => ({ searchKey: { contains: token } }));
    }
  }
  return where;
}

export async function listBienes(
  params: ListBienesParams,
): Promise<ActionResult<ListBienesResult>> {
  try {
    await authorize("inventario.read");
    const page = Math.max(1, params.page ?? 1);
    const sort: SortKey = SORT_KEYS.includes(params.sort as SortKey)
      ? (params.sort as SortKey)
      : "codigo";
    const dir: "asc" | "desc" = params.dir === "desc" ? "desc" : "asc";
    const pageSize = clampSize(params.pageSize);
    const where = buildWhere(params);

    const [total, rows] = await Promise.all([
      prisma.bien.count({ where }),
      prisma.bien.findMany({
        where,
        orderBy: buildOrderBy(sort, dir),
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          codigo: true,
          nombre: true,
          ubicacion: true,
          unidad: true,
          marcaModelo: true,
          cantidad: true,
          estado: true,
          observaciones: true,
        },
      }),
    ]);

    const items: BienRow[] = rows.map((b) => ({
      id: b.id,
      codigo: b.codigo,
      nombre: b.nombre,
      ubicacion: b.ubicacion,
      unidad: b.unidad,
      marcaModelo: b.marcaModelo,
      cantidad: b.cantidad,
      estado: b.estado,
      observaciones: b.observaciones,
    }));

    return ok({ items, total, page, pageSize, sort, dir });
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("listBienes", e);
    return fail("No se pudieron cargar los bienes.");
  }
}

export async function getBien(id: string): Promise<ActionResult<BienDetail>> {
  try {
    await authorize("inventario.read");
    const b = await prisma.bien.findUnique({
      where: { id },
      include: {
        movimientos: {
          orderBy: { createdAt: "desc" },
          take: 100,
          include: { byUser: { select: { name: true } } },
        },
      },
    });
    if (!b) return fail("Bien no encontrado.");
    return ok({
      id: b.id,
      codigo: b.codigo,
      nombre: b.nombre,
      ubicacion: b.ubicacion,
      unidad: b.unidad,
      marcaModelo: b.marcaModelo,
      cantidad: b.cantidad,
      estado: b.estado,
      observaciones: b.observaciones,
      createdAt: b.createdAt.toISOString(),
      updatedAt: b.updatedAt.toISOString(),
      movimientos: b.movimientos.map((m) => ({
        id: m.id,
        tipo: m.tipo,
        cantidad: m.cantidad,
        cantidadAnterior: m.cantidadAnterior,
        cantidadNueva: m.cantidadNueva,
        motivo: m.motivo,
        byUser: m.byUser?.name ?? null,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("getBien", e);
    return fail("No se pudo cargar el bien.");
  }
}

function validate(
  input: Partial<CreateBienInput>,
  isCreate: boolean,
): { fieldErrors: Record<string, string>; normalized: Partial<CreateBienInput> } {
  const fe: Record<string, string> = {};
  const out: Partial<CreateBienInput> = {};

  if (isCreate || input.nombre !== undefined) {
    const n = String(input.nombre ?? "").trim();
    if (n.length < 2) fe.nombre = "Indica el nombre del bien (mín. 2).";
    else out.nombre = n;
  }
  if (isCreate || input.ubicacion !== undefined) {
    const u = input.ubicacion;
    if (!u || !UBICACIONES.includes(u)) fe.ubicacion = "Ubicación inválida.";
    else out.ubicacion = u;
  }
  if (input.unidad !== undefined) {
    const u = String(input.unidad).trim().toUpperCase();
    out.unidad = u || "UND";
  }
  if (input.marcaModelo !== undefined) {
    const m = String(input.marcaModelo ?? "").trim();
    out.marcaModelo = m || null;
  }
  if (input.cantidad !== undefined) {
    const c = Number(input.cantidad);
    if (!Number.isInteger(c) || c < 0) fe.cantidad = "Cantidad inválida (≥ 0).";
    else out.cantidad = c;
  }
  if (input.estado !== undefined) {
    if (!ESTADOS.includes(input.estado)) fe.estado = "Estado inválido.";
    else out.estado = input.estado;
  }
  if (input.observaciones !== undefined) {
    const t = String(input.observaciones).trim();
    out.observaciones = t || undefined;
  }
  return { fieldErrors: fe, normalized: out };
}

export async function createBien(
  input: CreateBienInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const me = await authorize("inventario.write");
    const { fieldErrors, normalized } = validate(input, true);
    if (Object.keys(fieldErrors).length > 0)
      return fail("Revisa los campos marcados.", fieldErrors);

    const nombre = normalized.nombre!;
    const ubicacion = normalized.ubicacion!;
    const unidad = normalized.unidad ?? "UND";
    const marcaModelo = normalized.marcaModelo ?? null;
    const cantidad = normalized.cantidad ?? 0;
    const estado = normalized.estado ?? "conservado";

    // Reintenta ante colisión del código correlativo bajo concurrencia (dos
    // altas simultáneas leerían el mismo "último" código). Mismo patrón que
    // createEmpleado.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const last = await prisma.bien.findFirst({
          orderBy: { codigo: "desc" },
          select: { codigo: true },
        });
        const codigo = nextCodigo(last?.codigo ?? null);

        const created = await prisma.$transaction(async (tx) => {
          const bien = await tx.bien.create({
            data: {
              codigo,
              nombre,
              ubicacion,
              unidad,
              marcaModelo,
              cantidad,
              estado,
              observaciones: normalized.observaciones ?? null,
              searchKey: buildSearchKey({ codigo, nombre, marcaModelo, unidad }),
              createdById: me.id,
              updatedById: me.id,
            },
            select: { id: true },
          });
          // Asiento de apertura del kardex: deja trazable el stock inicial para
          // que la cantidad pueda reconstruirse desde cero a partir de los
          // movimientos.
          if (cantidad > 0) {
            await tx.movimientoBien.create({
              data: {
                bienId: bien.id,
                tipo: "entrada",
                cantidad,
                cantidadAnterior: 0,
                cantidadNueva: cantidad,
                motivo: "Stock inicial",
                byUserId: me.id,
              },
            });
          }
          return bien;
        });
        refresh();
        return ok({ id: created.id });
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === "P2002"
        ) {
          const target = e.meta?.target as string[] | undefined;
          if (target?.includes("codigo") && attempt < 2) continue;
        }
        throw e;
      }
    }
    return fail("No se pudo generar el código del bien. Reintenta.");
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("createBien", e);
    return fail("No se pudo crear el bien.");
  }
}

export async function updateBien(
  id: string,
  patch: UpdateBienPatch,
): Promise<ActionResult> {
  try {
    const me = await authorize("inventario.write");
    const existing = await prisma.bien.findUnique({
      where: { id },
      select: { codigo: true, nombre: true, marcaModelo: true, unidad: true },
    });
    if (!existing) return fail("Bien no encontrado.");

    const { fieldErrors, normalized } = validate(patch, false);
    if (Object.keys(fieldErrors).length > 0)
      return fail("Revisa los campos marcados.", fieldErrors);

    const nombre = normalized.nombre ?? existing.nombre;
    const marcaModelo =
      "marcaModelo" in normalized ? normalized.marcaModelo ?? null : existing.marcaModelo;
    const unidad = normalized.unidad ?? existing.unidad;

    const data: Prisma.BienUpdateInput = {
      searchKey: buildSearchKey({ codigo: existing.codigo, nombre, marcaModelo, unidad }),
      updatedBy: { connect: { id: me.id } },
    };
    if (normalized.nombre !== undefined) data.nombre = nombre;
    if (normalized.ubicacion !== undefined) data.ubicacion = normalized.ubicacion;
    if (normalized.unidad !== undefined) data.unidad = unidad;
    if ("marcaModelo" in normalized) data.marcaModelo = marcaModelo;
    // La cantidad NO se edita aquí: cambia solo vía movimientos (kardex).
    if (normalized.estado !== undefined) data.estado = normalized.estado;
    if ("observaciones" in normalized)
      data.observaciones = normalized.observaciones ?? null;

    await prisma.bien.update({ where: { id }, data });
    refresh();
    return ok();
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("updateBien", e);
    return fail("No se pudo actualizar el bien.");
  }
}

export async function deleteBien(id: string): Promise<ActionResult> {
  try {
    await authorize("inventario.delete");
    const existing = await prisma.bien.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) return fail("Bien no encontrado.");
    // Borrado físico: los movimientos (kardex) se eliminan en cascada.
    await prisma.bien.delete({ where: { id } });
    refresh();
    return ok();
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("deleteBien", e);
    return fail("No se pudo eliminar el bien.");
  }
}

export async function registrarMovimiento(
  input: MovimientoInput,
): Promise<ActionResult<{ cantidad: number }>> {
  try {
    const me = await authorize("inventario.move");
    const tipo: TipoMovBien = input.tipo;
    if (!["entrada", "salida", "ajuste"].includes(tipo))
      return fail("Tipo de movimiento inválido.");
    const cantidad = Number(input.cantidad);
    const minimo = tipo === "ajuste" ? 0 : 1;
    if (!Number.isInteger(cantidad) || cantidad < minimo)
      return fail("Cantidad inválida.", {
        cantidad:
          tipo === "ajuste" ? "Indica el nuevo total (≥ 0)." : "Indica una cantidad (≥ 1).",
      });
    const motivo = (input.motivo ?? "").trim() || null;

    const result = await prisma.$transaction(async (tx) => {
      // Bloquea la fila del bien para serializar movimientos concurrentes.
      await tx.$queryRaw`SELECT id FROM "Bien" WHERE id = ${input.bienId} FOR UPDATE`;
      const bien = await tx.bien.findUnique({
        where: { id: input.bienId },
        select: { cantidad: true },
      });
      if (!bien) throw new Denied("Bien no encontrado.");

      const anterior = bien.cantidad;
      let nueva: number;
      if (tipo === "entrada") nueva = anterior + cantidad;
      else if (tipo === "salida") nueva = anterior - cantidad;
      else nueva = cantidad; // ajuste: cantidad = nuevo total

      if (nueva < 0)
        throw new Denied(
          `No hay stock suficiente: hay ${anterior} y se intentó retirar ${cantidad}.`,
        );

      await tx.movimientoBien.create({
        data: {
          bienId: input.bienId,
          tipo,
          cantidad,
          cantidadAnterior: anterior,
          cantidadNueva: nueva,
          motivo,
          byUserId: me.id,
        },
      });
      await tx.bien.update({
        where: { id: input.bienId },
        data: { cantidad: nueva, updatedById: me.id },
      });
      return nueva;
    });

    refresh();
    return ok({ cantidad: result });
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("registrarMovimiento", e);
    return fail("No se pudo registrar el movimiento.");
  }
}

export async function getBienStats(): Promise<ActionResult<BienStats>> {
  try {
    await authorize("inventario.read");
    const [porUbicacion, sum, alerta] = await Promise.all([
      prisma.bien.groupBy({ by: ["ubicacion"], _count: { _all: true } }),
      prisma.bien.aggregate({ _sum: { cantidad: true } }),
      prisma.bien.count({ where: { estado: { in: ALERTA } } }),
    ]);
    const stats: BienStats = {
      total: 0,
      unidades: sum._sum.cantidad ?? 0,
      oficina: 0,
      almacen: 0,
      alerta,
    };
    for (const g of porUbicacion) {
      stats.total += g._count._all;
      if (g.ubicacion === "oficina") stats.oficina = g._count._all;
      else if (g.ubicacion === "almacen") stats.almacen = g._count._all;
    }
    return ok(stats);
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("getBienStats", e);
    return fail("No se pudieron cargar las estadísticas.");
  }
}
