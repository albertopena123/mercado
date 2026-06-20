"use server";

import { revalidatePath } from "next/cache";
import {
  Prisma,
  type TipoMovimiento,
  type CategoriaMovimiento,
  type TipoComprobante,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/server";
import type { PermissionKey } from "@/lib/auth/permissions";
import { normalizeToken } from "@/lib/socios/normalize";
import { toNumber } from "@/lib/money";
import { hoyISOPeru } from "@/lib/fecha";
import {
  CATEGORIA_LABEL,
  TIPO_LABEL,
  COMPROBANTE_LABEL,
  tipoDeCategoria,
} from "@/lib/caja/labels";
import { validateUpload, sniffMime, SNIFF_BYTES } from "@/lib/socios/limits";
import {
  writeComprobante,
  extFromMime,
  removeMovimientoDir,
  removeComprobante,
} from "@/lib/caja/storage";
import type {
  ActionResult,
  CreateMovimientoInput,
  UpdateMovimientoPatch,
  ListMovimientosParams,
  ListMovimientosResult,
  MovimientoRow,
  MovimientoDetail,
  CajaStats,
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
    throw new Denied("No tienes permiso para esta acción.");
  return user;
}
function fail(error: string, fieldErrors?: Record<string, string>): ActionResult {
  return { ok: false, error, fieldErrors };
}
function ok<T>(data?: T): ActionResult<T> {
  return { ok: true, data };
}
function refresh() {
  revalidatePath("/caja");
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

function buildSearchKey(p: {
  concepto: string;
  categoria: CategoriaMovimiento;
  comprobanteNumero?: string | null;
}): string {
  return [p.concepto, CATEGORIA_LABEL[p.categoria], p.comprobanteNumero]
    .filter((x): x is string => Boolean(x))
    .map(normalizeToken)
    .join(" ");
}

// Interpreta "YYYY-MM-DD" como fecha de CALENDARIO → medianoche UTC, siguiendo
// la convención de src/lib/fecha.ts. Así, al mostrarse con timeZone UTC
// (fechaCorta / toLocaleDateString con timeZone:"UTC"), la fecha coincide con la
// que el usuario eligió, sin importar la zona horaria del servidor.
function parseFecha(s: string): Date {
  const d = new Date(`${s}T00:00:00.000Z`);
  return isNaN(d.getTime()) ? new Date() : d;
}

// Rango de fechas (en UTC, consistente con cómo se guarda `fecha`): desde 00:00
// del "desde" hasta 23:59:59.999 del "hasta".
function fechaRange(
  desde?: string,
  hasta?: string,
): Prisma.DateTimeFilter | undefined {
  const f: Prisma.DateTimeFilter = {};
  if (desde) {
    const d = new Date(`${desde}T00:00:00.000Z`);
    if (!isNaN(d.getTime())) f.gte = d;
  }
  if (hasta) {
    const h = new Date(`${hasta}T23:59:59.999Z`);
    if (!isNaN(h.getTime())) f.lte = h;
  }
  return f.gte || f.lte ? f : undefined;
}

function buildWhere(params: ListMovimientosParams): Prisma.MovimientoCajaWhereInput {
  const where: Prisma.MovimientoCajaWhereInput = {};
  if (params.tipo) where.tipo = params.tipo;
  if (params.categoria) where.categoria = params.categoria;
  const fecha = fechaRange(params.desde, params.hasta);
  if (fecha) where.fecha = fecha;
  const q = params.q?.trim() ?? "";
  if (q) {
    const tokens = q
      .split(/\s+/)
      .filter((t) => t.length > 0)
      .map(normalizeToken);
    if (tokens.length > 0)
      where.AND = tokens.map((token) => ({ searchKey: { contains: token } }));
  }
  return where;
}

const SORT_KEYS = ["fecha", "monto", "categoria", "tipo"] as const;
type SortKey = (typeof SORT_KEYS)[number];
function buildOrderBy(
  sort: SortKey,
  dir: "asc" | "desc",
): Prisma.MovimientoCajaOrderByWithRelationInput[] {
  switch (sort) {
    case "monto":
      return [{ monto: dir }];
    case "categoria":
      return [{ categoria: dir }, { fecha: "desc" }];
    case "tipo":
      return [{ tipo: dir }, { fecha: "desc" }];
    case "fecha":
    default:
      return [{ fecha: dir }, { createdAt: dir }];
  }
}

const SOCIO_SELECT = {
  id: true,
  apellidoPaterno: true,
  apellidoMaterno: true,
  nombres: true,
} as const;

function rowOf(m: {
  id: string;
  tipo: TipoMovimiento;
  categoria: CategoriaMovimiento;
  monto: Prisma.Decimal;
  fecha: Date;
  concepto: string;
  metodoPago: string | null;
  comprobanteTipo: TipoComprobante;
  comprobanteUrl: string | null;
  socio: {
    id: string;
    apellidoPaterno: string;
    apellidoMaterno: string | null;
    nombres: string;
  } | null;
}): MovimientoRow {
  return {
    id: m.id,
    tipo: m.tipo,
    categoria: m.categoria,
    monto: toNumber(m.monto),
    fecha: m.fecha.toISOString(),
    concepto: m.concepto,
    metodoPago: m.metodoPago,
    comprobanteTipo: m.comprobanteTipo,
    comprobanteUrl: m.comprobanteUrl,
    socio: m.socio
      ? { id: m.socio.id, nombre: socioNombre(m.socio) }
      : null,
  };
}

export async function listMovimientos(
  params: ListMovimientosParams,
): Promise<ActionResult<ListMovimientosResult>> {
  try {
    await authorize("caja.read");
    const page = Math.max(1, params.page ?? 1);
    const sort: SortKey = SORT_KEYS.includes(params.sort as SortKey)
      ? (params.sort as SortKey)
      : "fecha";
    const dir: "asc" | "desc" = params.dir === "asc" ? "asc" : "desc";
    const pageSize = clampSize(params.pageSize);
    const where = buildWhere(params);

    const [total, rows] = await Promise.all([
      prisma.movimientoCaja.count({ where }),
      prisma.movimientoCaja.findMany({
        where,
        orderBy: buildOrderBy(sort, dir),
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          tipo: true,
          categoria: true,
          monto: true,
          fecha: true,
          concepto: true,
          metodoPago: true,
          comprobanteTipo: true,
          comprobanteUrl: true,
          socio: { select: SOCIO_SELECT },
        },
      }),
    ]);
    return ok({ items: rows.map(rowOf), total, page, pageSize, sort, dir });
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("listMovimientos", e);
    return fail("No se pudieron cargar los movimientos.");
  }
}

export async function getMovimiento(
  id: string,
): Promise<ActionResult<MovimientoDetail>> {
  try {
    await authorize("caja.read");
    const m = await prisma.movimientoCaja.findUnique({
      where: { id },
      include: {
        socio: { select: SOCIO_SELECT },
        registradoPor: { select: { name: true } },
      },
    });
    if (!m) return fail("Movimiento no encontrado.");
    return ok({
      ...rowOf(m),
      comprobanteNumero: m.comprobanteNumero,
      origen: m.origen,
      registradoPor: m.registradoPor?.name ?? null,
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
    });
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("getMovimiento", e);
    return fail("No se pudo cargar el movimiento.");
  }
}

function validate(
  input: Partial<CreateMovimientoInput>,
  isCreate: boolean,
): { fieldErrors: Record<string, string>; normalized: Partial<CreateMovimientoInput> } {
  const fe: Record<string, string> = {};
  const out: Partial<CreateMovimientoInput> = {};

  if (isCreate || input.tipo !== undefined) {
    if (input.tipo !== "ingreso" && input.tipo !== "egreso")
      fe.tipo = "Tipo inválido.";
    else out.tipo = input.tipo;
  }
  if (isCreate || input.categoria !== undefined) {
    const c = input.categoria;
    if (!c) fe.categoria = "Elige una categoría.";
    else {
      out.categoria = c;
      // La categoría debe corresponder al tipo (ingreso/egreso).
      const tipoEsperado = tipoDeCategoria(c);
      const tipo = out.tipo ?? input.tipo;
      if (tipo && tipo !== tipoEsperado)
        fe.categoria = "La categoría no corresponde al tipo.";
    }
  }
  if (isCreate || input.monto !== undefined) {
    const n = Number(input.monto);
    if (!isFinite(n) || n <= 0) fe.monto = "Ingresa un monto mayor a 0.";
    else out.monto = Math.round(n * 100) / 100;
  }
  if (isCreate || input.concepto !== undefined) {
    const c = String(input.concepto ?? "").trim();
    if (c.length < 2) fe.concepto = "Describe el movimiento.";
    else out.concepto = c;
  }
  if (input.fecha !== undefined) {
    if (input.fecha === null || input.fecha === "") out.fecha = undefined;
    else {
      const d = new Date(input.fecha);
      if (isNaN(d.getTime())) fe.fecha = "Fecha inválida.";
      else out.fecha = input.fecha;
    }
  }
  if (input.metodoPago !== undefined)
    out.metodoPago = String(input.metodoPago).trim() || undefined;
  if (input.socioId !== undefined) out.socioId = input.socioId || null;
  if (input.comprobanteTipo !== undefined)
    out.comprobanteTipo = input.comprobanteTipo;
  if (input.comprobanteNumero !== undefined)
    out.comprobanteNumero = String(input.comprobanteNumero).trim() || undefined;

  return { fieldErrors: fe, normalized: out };
}

export async function createMovimiento(
  input: CreateMovimientoInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const me = await authorize("caja.write");
    const { fieldErrors, normalized } = validate(input, true);
    if (Object.keys(fieldErrors).length > 0)
      return fail("Revisa los campos marcados.", fieldErrors);

    const categoria = normalized.categoria!;
    const concepto = normalized.concepto!;
    const created = await prisma.movimientoCaja.create({
      data: {
        tipo: normalized.tipo!,
        categoria,
        monto: new Prisma.Decimal(normalized.monto!),
        // Sin fecha → hoy (Perú) como fecha de CALENDARIO (medianoche UTC), no
        // un instante: así no se corre un día al mostrarse/filtrarse en UTC.
        fecha: normalized.fecha
          ? parseFecha(normalized.fecha)
          : parseFecha(hoyISOPeru()),
        concepto,
        metodoPago: normalized.metodoPago ?? null,
        socioId: normalized.socioId ?? null,
        comprobanteTipo: normalized.comprobanteTipo ?? "ninguno",
        comprobanteNumero: normalized.comprobanteNumero ?? null,
        searchKey: buildSearchKey({
          concepto,
          categoria,
          comprobanteNumero: normalized.comprobanteNumero,
        }),
        registradoPorId: me.id,
      },
    });
    refresh();
    return ok({ id: created.id });
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("createMovimiento", e);
    return fail("No se pudo registrar el movimiento.");
  }
}

export async function updateMovimiento(
  id: string,
  patch: UpdateMovimientoPatch,
): Promise<ActionResult> {
  try {
    await authorize("caja.write");
    const existing = await prisma.movimientoCaja.findUnique({
      where: { id },
      select: {
        concepto: true,
        categoria: true,
        comprobanteNumero: true,
        origen: true,
      },
    });
    if (!existing) return fail("Movimiento no encontrado.");
    // Los movimientos automáticos (pago de cuota/inscripción) están ligados 1:1
    // a un comprobante emitido y a la cuota saldada; editarlos desincronizaría
    // la contabilidad respecto de los recibos. Solo se editan los manuales.
    if (existing.origen !== "manual")
      return fail(
        "Este movimiento se generó automáticamente (pago de cuota/inscripción) y está ligado a un comprobante; no se puede editar desde Caja.",
      );

    const { fieldErrors, normalized } = validate(patch, false);
    if (Object.keys(fieldErrors).length > 0)
      return fail("Revisa los campos marcados.", fieldErrors);

    const data: Prisma.MovimientoCajaUpdateInput = {};
    if (normalized.tipo !== undefined) data.tipo = normalized.tipo;
    if (normalized.categoria !== undefined) data.categoria = normalized.categoria;
    if (normalized.monto !== undefined)
      data.monto = new Prisma.Decimal(normalized.monto);
    if (normalized.fecha !== undefined)
      data.fecha = normalized.fecha
        ? parseFecha(normalized.fecha)
        : parseFecha(hoyISOPeru());
    if (normalized.concepto !== undefined) data.concepto = normalized.concepto;
    if (normalized.metodoPago !== undefined)
      data.metodoPago = normalized.metodoPago ?? null;
    if (normalized.comprobanteTipo !== undefined)
      data.comprobanteTipo = normalized.comprobanteTipo;
    if (normalized.comprobanteNumero !== undefined)
      data.comprobanteNumero = normalized.comprobanteNumero ?? null;
    if ("socioId" in normalized)
      data.socio = normalized.socioId
        ? { connect: { id: normalized.socioId } }
        : { disconnect: true };

    const concepto = normalized.concepto ?? existing.concepto;
    const categoria = normalized.categoria ?? existing.categoria;
    const compNum =
      normalized.comprobanteNumero !== undefined
        ? normalized.comprobanteNumero
        : existing.comprobanteNumero;
    data.searchKey = buildSearchKey({
      concepto,
      categoria,
      comprobanteNumero: compNum,
    });

    await prisma.movimientoCaja.update({ where: { id }, data });
    refresh();
    return ok();
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("updateMovimiento", e);
    return fail("No se pudo actualizar el movimiento.");
  }
}

export async function deleteMovimiento(id: string): Promise<ActionResult> {
  try {
    await authorize("caja.delete");
    const mov = await prisma.movimientoCaja.findUnique({
      where: { id },
      select: { origen: true },
    });
    if (!mov) return fail("Movimiento no encontrado.");
    // No borrar movimientos automáticos (pago de cuota/inscripción): dejarían un
    // comprobante huérfano y la cuota como pagada sin respaldo en caja.
    if (mov.origen !== "manual")
      return fail(
        "Este movimiento se generó automáticamente (pago de cuota/inscripción) y está ligado a un comprobante; no se puede eliminar desde Caja.",
      );
    await prisma.movimientoCaja.delete({ where: { id } });
    await removeMovimientoDir(id);
    refresh();
    return ok();
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("deleteMovimiento", e);
    return fail("No se pudo eliminar el movimiento.");
  }
}

export async function getCajaStats(params: {
  desde?: string;
  hasta?: string;
}): Promise<ActionResult<CajaStats>> {
  try {
    await authorize("caja.read");
    const where: Prisma.MovimientoCajaWhereInput = {};
    const fecha = fechaRange(params.desde, params.hasta);
    if (fecha) where.fecha = fecha;

    const grouped = await prisma.movimientoCaja.groupBy({
      by: ["tipo", "categoria"],
      where,
      _sum: { monto: true },
    });
    let ingresos = 0;
    let egresos = 0;
    const porCategoria = grouped
      .map((g) => {
        const total = toNumber(g._sum.monto);
        if (g.tipo === "ingreso") ingresos += total;
        else egresos += total;
        return { categoria: g.categoria, tipo: g.tipo, total };
      })
      .sort((a, b) => b.total - a.total);

    return ok({
      ingresos,
      egresos,
      balance: Math.round((ingresos - egresos) * 100) / 100,
      porCategoria,
    });
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("getCajaStats", e);
    return fail("No se pudieron cargar las estadísticas.");
  }
}

function csvCell(value: string | null | undefined): string {
  const s = (value ?? "").replace(/"/g, '""');
  return `"${s}"`;
}

// Exporta los movimientos que cumplen los filtros actuales a CSV (separador ";"
// y BOM UTF-8 para que Excel en español respete tildes y columnas). El monto va
// firmado (egresos en negativo) para poder sumarlo directamente en una hoja.
export async function exportMovimientosCsv(
  params: ListMovimientosParams,
): Promise<ActionResult<{ csv: string; filename: string; count: number }>> {
  try {
    await authorize("caja.read");
    const where = buildWhere(params);
    const rows = await prisma.movimientoCaja.findMany({
      where,
      orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
      include: {
        socio: {
          select: {
            codigo: true,
            apellidoPaterno: true,
            apellidoMaterno: true,
            nombres: true,
          },
        },
        registradoPor: { select: { name: true } },
      },
    });

    const headers = [
      "Fecha",
      "Tipo",
      "Categoría",
      "Concepto",
      "Monto (S/)",
      "Método de pago",
      "Comprobante",
      "N° comprobante",
      "Socio",
      "Registrado por",
    ];
    const lines = [headers.map(csvCell).join(";")];
    for (const m of rows) {
      const socioTxt = m.socio
        ? `${socioNombre(m.socio)} (${m.socio.codigo})`
        : "";
      const signed = m.tipo === "egreso" ? -toNumber(m.monto) : toNumber(m.monto);
      lines.push(
        [
          m.fecha.toISOString().slice(0, 10),
          TIPO_LABEL[m.tipo],
          CATEGORIA_LABEL[m.categoria],
          m.concepto,
          signed.toFixed(2),
          m.metodoPago ?? "",
          m.comprobanteTipo === "ninguno"
            ? ""
            : COMPROBANTE_LABEL[m.comprobanteTipo],
          m.comprobanteNumero ?? "",
          socioTxt,
          m.registradoPor?.name ?? "",
        ]
          .map(csvCell)
          .join(";"),
      );
    }

    const csv = "﻿" + lines.join("\r\n");
    const stamp = new Date().toISOString().slice(0, 10);
    return ok({ csv, filename: `caja-${stamp}.csv`, count: rows.length });
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("exportMovimientosCsv", e);
    return fail("No se pudo generar el archivo.");
  }
}

export async function uploadComprobante(
  movId: string,
  file: File,
): Promise<ActionResult<{ url: string }>> {
  try {
    await authorize("caja.write");
    const mov = await prisma.movimientoCaja.findUnique({
      where: { id: movId },
      select: { id: true, comprobanteUrl: true },
    });
    if (!mov) return fail("Movimiento no encontrado.");

    const head = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
    const sniffed = sniffMime(head);
    const err = validateUpload(file, "doc", sniffed);
    if (err) return fail(err);

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = extFromMime(sniffed ?? file.type);
    const fileName = `comp-${Date.now()}.${ext}`;
    const url = await writeComprobante(movId, fileName, buffer);

    await prisma.movimientoCaja.update({
      where: { id: movId },
      data: { comprobanteUrl: url },
    });

    // Reemplazo: borrar el comprobante anterior para no acumular huérfanos.
    const prevFile = mov.comprobanteUrl?.split("/").pop();
    if (prevFile && prevFile !== fileName) {
      await removeComprobante(movId, prevFile);
    }
    refresh();
    return ok({ url });
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("uploadComprobante", e);
    return fail("No se pudo subir el comprobante.");
  }
}
