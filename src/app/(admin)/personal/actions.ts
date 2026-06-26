"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import {
  Prisma,
  type TipoDocumento,
  type CargoEmpleado,
  type EstadoEmpleado,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/server";
import type { PermissionKey } from "@/lib/auth/permissions";
import { toNumber } from "@/lib/money";
import { inicioDiaUTC, hoyISOPeru } from "@/lib/fecha";
import {
  validateNumeroDocumento,
  normalizeNumeroDocumento,
} from "@/lib/socios/document";
import { EMAIL_RE } from "@/lib/socios/update";
import {
  lookupDniUnamad,
  type DniLookupResult,
} from "@/lib/socios/dni-lookup";
import { normalizeToken, splitSearchTokens } from "@/lib/socios/normalize";
import {
  validateUpload,
  sniffMime,
  SNIFF_BYTES,
  type UploadKind,
} from "@/lib/socios/limits";
import { nextCodigoEmpleado } from "@/lib/empleados/codigo";
import { CARGO_LABEL } from "@/lib/empleados/labels";
import {
  writeAdjunto,
  removeAdjunto,
  removeEmpleadoDir,
  extFromMime,
} from "@/lib/empleados/storage";
import type {
  ActionResult,
  CreateEmpleadoInput,
  UpdateEmpleadoPatch,
  ListEmpleadosParams,
  ListEmpleadosResult,
  EmpleadoRow,
  EmpleadoDetail,
  EmpleadoStats,
} from "./types";

const PAGE_SIZE = 25;
const PAGE_SIZES = [25, 50, 100];
function clampSize(n?: number): number {
  return n && PAGE_SIZES.includes(n) ? n : PAGE_SIZE;
}
// Fecha de calendario estricta: debe ser exactamente "yyyy-mm-dd" (lo único que
// inicioDiaUTC interpreta sin caer silenciosamente a hoy).
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CARGOS = new Set<CargoEmpleado>([
  "seguridad",
  "secretaria",
  "limpieza",
  "bano",
  "administracion",
  "mantenimiento",
  "cobranza",
  "otro",
]);

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
  revalidatePath("/personal");
}

// Consulta el DNI (RENIEC vía UNAMAD) para autocompletar el formulario de
// personal — misma fuente que socios, pero con permiso de personal.
export async function lookupDniEmpleadoAction(
  dni: string,
): Promise<ActionResult<DniLookupResult>> {
  try {
    await authorize("personal.write");
    const clean = (dni ?? "").trim();
    if (!/^\d{8}$/.test(clean))
      return fail("El DNI debe tener exactamente 8 dígitos.");
    let data: DniLookupResult | null;
    try {
      data = await lookupDniUnamad(clean);
    } catch (e) {
      console.error("lookupDniEmpleadoAction fetch", e);
      const err = e as { name?: string };
      if (err?.name === "AbortError")
        return fail("La consulta al servicio de DNI tardó demasiado.");
      return fail("No se pudo consultar el servicio de DNI.");
    }
    if (!data) return fail("No se encontró información para este DNI.");
    return ok(data);
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("lookupDniEmpleadoAction", e);
    return fail("No se pudo consultar el DNI.");
  }
}
function isP2002(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

function buildSearchKey(p: {
  codigo: string;
  numeroDocumento: string;
  apellidoPaterno: string;
  apellidoMaterno: string | null;
  nombres: string;
  cargo: CargoEmpleado;
}): string {
  return [
    p.codigo,
    p.numeroDocumento,
    p.apellidoPaterno,
    p.apellidoMaterno,
    p.nombres,
    CARGO_LABEL[p.cargo],
  ]
    .filter((x): x is string => Boolean(x))
    .map(normalizeToken)
    .join(" ");
}

type FieldErrors = Record<string, string>;

function validate(
  input: Partial<CreateEmpleadoInput>,
  isCreate: boolean,
): { fieldErrors: FieldErrors; normalized: Partial<CreateEmpleadoInput> } {
  const fe: FieldErrors = {};
  const out: Partial<CreateEmpleadoInput> = {};
  const hoyUTC = inicioDiaUTC(hoyISOPeru()).getTime();

  if (isCreate || input.tipoDocumento !== undefined) {
    if (!input.tipoDocumento) fe.tipoDocumento = "Selecciona el tipo de documento.";
    else out.tipoDocumento = input.tipoDocumento;
  }
  if (isCreate || input.numeroDocumento !== undefined) {
    const tipo = input.tipoDocumento ?? out.tipoDocumento;
    const num = (input.numeroDocumento ?? "").trim();
    if (!num) fe.numeroDocumento = "Número de documento requerido.";
    else if (tipo && !validateNumeroDocumento(tipo, num))
      fe.numeroDocumento = "Formato inválido para el tipo de documento.";
    else if (tipo) out.numeroDocumento = normalizeNumeroDocumento(tipo, num);
  }
  if (isCreate || input.apellidoPaterno !== undefined) {
    const ap = (input.apellidoPaterno ?? "").trim();
    if (!ap) fe.apellidoPaterno = "Apellido paterno requerido.";
    else out.apellidoPaterno = ap;
  }
  if (isCreate || input.nombres !== undefined) {
    const nom = (input.nombres ?? "").trim();
    if (!nom) fe.nombres = "Nombres requeridos.";
    else out.nombres = nom;
  }
  if (input.apellidoMaterno !== undefined) {
    out.apellidoMaterno = input.apellidoMaterno.trim() || undefined;
  }
  if (isCreate || input.cargo !== undefined) {
    if (!input.cargo || !CARGOS.has(input.cargo)) fe.cargo = "Cargo inválido.";
    else out.cargo = input.cargo;
  }
  if (input.cargoDetalle !== undefined) {
    out.cargoDetalle = input.cargoDetalle.trim() || undefined;
  }
  if (isCreate || input.fechaIngreso !== undefined) {
    const fi = (input.fechaIngreso ?? "").trim();
    // Exigir formato ISO antes de parsear: new Date("2026/06/15") o "June 15"
    // parsean OK pero inicioDiaUTC los descartaría y guardaría HOY en silencio.
    const d = ISO_DATE.test(fi) ? new Date(`${fi}T00:00:00.000Z`) : null;
    if (!d || isNaN(d.getTime())) fe.fechaIngreso = "Fecha de ingreso inválida.";
    else if (d.getTime() > hoyUTC)
      fe.fechaIngreso = "La fecha de ingreso no puede ser futura.";
    else out.fechaIngreso = fi;
  }
  if (input.email !== undefined && input.email.trim() !== "") {
    const em = input.email.trim().toLowerCase();
    if (!EMAIL_RE.test(em)) fe.email = "Correo no válido.";
    else out.email = em;
  } else if (input.email !== undefined) {
    out.email = undefined;
  }
  if (input.salario !== undefined) {
    if (input.salario === null || (input.salario as unknown) === "") {
      out.salario = null;
    } else {
      const n = Number(input.salario);
      if (!isFinite(n) || n < 0) fe.salario = "Salario inválido.";
      else out.salario = Math.round(n * 100) / 100;
    }
  }
  for (const k of ["telefono", "direccion", "observaciones"] as const) {
    const v = input[k];
    if (v !== undefined) {
      const t = String(v).trim();
      (out as Record<string, string | undefined>)[k] = t || undefined;
    }
  }
  return { fieldErrors: fe, normalized: out };
}

function toRow(s: {
  id: string;
  codigo: string;
  tipoDocumento: TipoDocumento;
  numeroDocumento: string;
  apellidoPaterno: string;
  apellidoMaterno: string | null;
  nombres: string;
  cargo: CargoEmpleado;
  cargoDetalle: string | null;
  estado: EstadoEmpleado;
  fechaIngreso: Date;
  fotoUrl: string | null;
}): EmpleadoRow {
  return {
    id: s.id,
    codigo: s.codigo,
    tipoDocumento: s.tipoDocumento,
    numeroDocumento: s.numeroDocumento,
    apellidoPaterno: s.apellidoPaterno,
    apellidoMaterno: s.apellidoMaterno,
    nombres: s.nombres,
    cargo: s.cargo,
    cargoDetalle: s.cargoDetalle,
    estado: s.estado,
    fechaIngreso: s.fechaIngreso.toISOString(),
    fotoUrl: s.fotoUrl,
  };
}

function buildWhere(params: ListEmpleadosParams): Prisma.EmpleadoWhereInput {
  const where: Prisma.EmpleadoWhereInput = {};
  if (params.estado) where.estado = params.estado;
  if (params.cargo) where.cargo = params.cargo;
  const q = params.q?.trim() ?? "";
  if (q) {
    const tokens = splitSearchTokens(q).map(normalizeToken);
    if (tokens.length > 0)
      where.AND = tokens.map((t) => ({ searchKey: { contains: t } }));
  }
  return where;
}

const SORT_KEYS = ["codigo", "nombre", "cargo", "ingreso", "estado"] as const;
type SortKey = (typeof SORT_KEYS)[number];
function buildOrderBy(
  sort: SortKey,
  dir: "asc" | "desc",
): Prisma.EmpleadoOrderByWithRelationInput[] {
  switch (sort) {
    case "codigo":
      return [{ codigo: dir }];
    case "cargo":
      return [{ cargo: dir }, { apellidoPaterno: "asc" }];
    case "ingreso":
      return [{ fechaIngreso: dir }];
    case "estado":
      return [{ estado: dir }, { apellidoPaterno: "asc" }];
    case "nombre":
    default:
      return [{ apellidoPaterno: dir }, { apellidoMaterno: dir }, { nombres: dir }];
  }
}

const ROW_SELECT = {
  id: true,
  codigo: true,
  tipoDocumento: true,
  numeroDocumento: true,
  apellidoPaterno: true,
  apellidoMaterno: true,
  nombres: true,
  cargo: true,
  cargoDetalle: true,
  estado: true,
  fechaIngreso: true,
  fotoUrl: true,
} as const;

export async function listEmpleados(
  params: ListEmpleadosParams,
): Promise<ActionResult<ListEmpleadosResult>> {
  try {
    await authorize("personal.read");
    const page = Math.max(1, params.page ?? 1);
    const sort: SortKey = SORT_KEYS.includes(params.sort as SortKey)
      ? (params.sort as SortKey)
      : "nombre";
    const dir: "asc" | "desc" = params.dir === "desc" ? "desc" : "asc";
    const pageSize = clampSize(params.pageSize);
    const where = buildWhere(params);

    const [total, rows] = await Promise.all([
      prisma.empleado.count({ where }),
      prisma.empleado.findMany({
        where,
        orderBy: buildOrderBy(sort, dir),
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: ROW_SELECT,
      }),
    ]);
    return ok({ items: rows.map(toRow), total, page, pageSize, sort, dir });
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("listEmpleados", e);
    return fail("No se pudo cargar el personal.");
  }
}

export async function getEmpleadoStats(): Promise<ActionResult<EmpleadoStats>> {
  try {
    await authorize("personal.read");
    const grouped = await prisma.empleado.groupBy({
      by: ["estado"],
      _count: { _all: true },
    });
    const stats: EmpleadoStats = { total: 0, activo: 0, suspendido: 0, inactivo: 0 };
    for (const g of grouped) {
      stats.total += g._count._all;
      stats[g.estado] = g._count._all;
    }
    return ok(stats);
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("getEmpleadoStats", e);
    return fail("No se pudieron cargar las estadísticas.");
  }
}

export async function getEmpleado(
  id: string,
): Promise<ActionResult<EmpleadoDetail>> {
  try {
    await authorize("personal.read");
    const s = await prisma.empleado.findUnique({
      where: { id },
      include: { adjuntos: { orderBy: { createdAt: "desc" } } },
    });
    if (!s) return fail("Empleado no encontrado.");
    return ok({
      ...toRow(s),
      telefono: s.telefono,
      email: s.email,
      direccion: s.direccion,
      fechaCese: s.fechaCese ? s.fechaCese.toISOString() : null,
      salario: s.salario != null ? toNumber(s.salario) : null,
      observaciones: s.observaciones,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
      adjuntos: s.adjuntos.map((a) => ({
        id: a.id,
        tipo: a.tipo,
        url: a.url,
        mimeType: a.mimeType,
        sizeBytes: a.sizeBytes,
        createdAt: a.createdAt.toISOString(),
      })),
    });
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("getEmpleado", e);
    return fail("No se pudo cargar el empleado.");
  }
}

export async function createEmpleado(
  input: CreateEmpleadoInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const me = await authorize("personal.write");
    const { fieldErrors, normalized } = validate(input, true);
    if (Object.keys(fieldErrors).length > 0)
      return fail("Revisa los campos marcados.", fieldErrors);

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const dup = await prisma.empleado.findFirst({
          where: {
            tipoDocumento: normalized.tipoDocumento!,
            numeroDocumento: normalized.numeroDocumento!,
          },
          select: { id: true },
        });
        if (dup)
          return fail("Ya existe un empleado con ese documento.", {
            numeroDocumento: "Documento en uso.",
          });

        const last = await prisma.empleado.findFirst({
          orderBy: { codigo: "desc" },
          select: { codigo: true },
        });
        const codigo = nextCodigoEmpleado(last?.codigo ?? null);
        const cargo = normalized.cargo!;
        const created = await prisma.empleado.create({
          data: {
            codigo,
            tipoDocumento: normalized.tipoDocumento!,
            numeroDocumento: normalized.numeroDocumento!,
            apellidoPaterno: normalized.apellidoPaterno!,
            apellidoMaterno: normalized.apellidoMaterno ?? null,
            nombres: normalized.nombres!,
            cargo,
            // El detalle solo aplica cuando el cargo es "otro".
            cargoDetalle: cargo === "otro" ? normalized.cargoDetalle ?? null : null,
            telefono: normalized.telefono ?? null,
            email: normalized.email ?? null,
            direccion: normalized.direccion ?? null,
            fechaIngreso: inicioDiaUTC(normalized.fechaIngreso),
            salario:
              normalized.salario != null
                ? new Prisma.Decimal(normalized.salario.toFixed(2))
                : null,
            observaciones: normalized.observaciones ?? null,
            searchKey: buildSearchKey({
              codigo,
              numeroDocumento: normalized.numeroDocumento!,
              apellidoPaterno: normalized.apellidoPaterno!,
              apellidoMaterno: normalized.apellidoMaterno ?? null,
              nombres: normalized.nombres!,
              cargo,
            }),
            createdById: me.id,
            updatedById: me.id,
          },
          select: { id: true },
        });
        refresh();
        return ok({ id: created.id });
      } catch (e) {
        if (isP2002(e)) {
          const target = (e as Prisma.PrismaClientKnownRequestError).meta
            ?.target as string[] | undefined;
          if (target?.includes("codigo")) continue;
          if (
            target?.includes("tipoDocumento") ||
            target?.includes("numeroDocumento")
          )
            return fail("Ya existe un empleado con ese documento.", {
              numeroDocumento: "Documento en uso.",
            });
          throw e;
        }
        throw e;
      }
    }
    return fail("Conflicto al generar el código. Reintenta.");
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("createEmpleado", e);
    return fail("No se pudo crear el empleado.");
  }
}

export async function updateEmpleado(
  id: string,
  patch: UpdateEmpleadoPatch,
): Promise<ActionResult> {
  try {
    const me = await authorize("personal.write");
    const existing = await prisma.empleado.findUnique({
      where: { id },
      select: {
        codigo: true,
        tipoDocumento: true,
        numeroDocumento: true,
        apellidoPaterno: true,
        apellidoMaterno: true,
        nombres: true,
        cargo: true,
      },
    });
    if (!existing) return fail("Empleado no encontrado.");

    const merged: Partial<CreateEmpleadoInput> = {
      tipoDocumento: patch.tipoDocumento ?? existing.tipoDocumento,
      ...patch,
    };
    const { fieldErrors, normalized } = validate(merged, false);
    if (Object.keys(fieldErrors).length > 0)
      return fail("Revisa los campos marcados.", fieldErrors);

    const data: Prisma.EmpleadoUpdateInput = {
      updatedBy: { connect: { id: me.id } },
    };
    if (normalized.tipoDocumento) data.tipoDocumento = normalized.tipoDocumento;
    if (normalized.numeroDocumento) data.numeroDocumento = normalized.numeroDocumento;
    if (normalized.apellidoPaterno) data.apellidoPaterno = normalized.apellidoPaterno;
    if ("apellidoMaterno" in normalized)
      data.apellidoMaterno = normalized.apellidoMaterno ?? null;
    if (normalized.nombres) data.nombres = normalized.nombres;
    if (normalized.cargo) data.cargo = normalized.cargo;
    // Normalizar el detalle según el cargo EFECTIVO (patch o existente): si no es
    // "otro", se limpia aunque el cliente lo haya enviado (campo oculto stale).
    const finalCargo = normalized.cargo ?? existing.cargo;
    if (finalCargo !== "otro") data.cargoDetalle = null;
    else if ("cargoDetalle" in normalized)
      data.cargoDetalle = normalized.cargoDetalle ?? null;
    if ("telefono" in normalized) data.telefono = normalized.telefono ?? null;
    if ("email" in normalized) data.email = normalized.email ?? null;
    if ("direccion" in normalized) data.direccion = normalized.direccion ?? null;
    if (normalized.fechaIngreso)
      data.fechaIngreso = inicioDiaUTC(normalized.fechaIngreso);
    if ("salario" in normalized)
      data.salario =
        normalized.salario != null
          ? new Prisma.Decimal(normalized.salario.toFixed(2))
          : null;
    if ("observaciones" in normalized)
      data.observaciones = normalized.observaciones ?? null;

    const finalAM =
      "apellidoMaterno" in normalized
        ? normalized.apellidoMaterno ?? null
        : existing.apellidoMaterno;
    data.searchKey = buildSearchKey({
      codigo: existing.codigo,
      numeroDocumento: normalized.numeroDocumento ?? existing.numeroDocumento,
      apellidoPaterno: normalized.apellidoPaterno ?? existing.apellidoPaterno,
      apellidoMaterno: finalAM,
      nombres: normalized.nombres ?? existing.nombres,
      cargo: normalized.cargo ?? existing.cargo,
    });

    try {
      await prisma.empleado.update({ where: { id }, data });
    } catch (e) {
      if (isP2002(e))
        return fail("Ya existe un empleado con ese documento.", {
          numeroDocumento: "Documento en uso.",
        });
      throw e;
    }
    refresh();
    return ok();
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("updateEmpleado", e);
    return fail("No se pudo actualizar el empleado.");
  }
}

export async function setEstadoEmpleado(
  id: string,
  estado: EstadoEmpleado,
  fechaCese?: string | null,
): Promise<ActionResult> {
  try {
    const me = await authorize("personal.write");
    if (!["activo", "suspendido", "inactivo"].includes(estado))
      return fail("Estado inválido.");

    const existing = await prisma.empleado.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) return fail("Empleado no encontrado.");

    const data: Prisma.EmpleadoUpdateInput = {
      estado,
      updatedBy: { connect: { id: me.id } },
    };
    // Cese: al pasar a "inactivo" se fija la fecha de cese (la indicada o hoy);
    // al reactivar se limpia. La fecha de cese se valida igual que la de ingreso
    // (formato ISO y no futura) para no aceptar valores absurdos silenciosamente.
    if (estado === "inactivo") {
      const f = (fechaCese ?? "").trim();
      if (f) {
        const hoyUTC = inicioDiaUTC(hoyISOPeru()).getTime();
        const d = ISO_DATE.test(f) ? new Date(`${f}T00:00:00.000Z`) : null;
        if (!d || isNaN(d.getTime()))
          return fail("Fecha de cese inválida.", { fechaCese: "Formato inválido." });
        if (d.getTime() > hoyUTC)
          return fail("La fecha de cese no puede ser futura.", {
            fechaCese: "No puede ser futura.",
          });
        data.fechaCese = d;
      } else {
        data.fechaCese = inicioDiaUTC(hoyISOPeru());
      }
    } else {
      data.fechaCese = null;
    }
    await prisma.empleado.update({ where: { id }, data });
    refresh();
    return ok();
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("setEstadoEmpleado", e);
    return fail("No se pudo cambiar el estado del empleado.");
  }
}

export async function deleteEmpleado(id: string): Promise<ActionResult> {
  try {
    await authorize("personal.delete");
    const existing = await prisma.empleado.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) return fail("Empleado no encontrado.");
    // Borra el empleado y sus adjuntos (cascade); limpia los archivos en disco.
    await prisma.empleado.delete({ where: { id } });
    await removeEmpleadoDir(id);
    refresh();
    return ok();
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("deleteEmpleado", e);
    return fail("No se pudo eliminar el empleado.");
  }
}

export async function uploadEmpleadoAdjunto(
  empleadoId: string,
  tipo: string,
  file: File,
): Promise<ActionResult<{ id: string; url: string }>> {
  try {
    const me = await authorize("personal.write");
    const trimmedTipo = (tipo ?? "").trim() || "otro";
    const kind: UploadKind = trimmedTipo === "foto" ? "foto" : "doc";

    const buffer = Buffer.from(await file.arrayBuffer());
    const sniffed = sniffMime(buffer.subarray(0, SNIFF_BYTES));
    const effectiveType = sniffed ?? file.type;
    const invalid = validateUpload(file, kind, sniffed);
    if (invalid) return fail(invalid);

    const existing = await prisma.empleado.findUnique({
      where: { id: empleadoId },
      select: { id: true },
    });
    if (!existing) return fail("Empleado no encontrado.");

    // Escribir el archivo PRIMERO y crear la fila ya con la URL final (evita
    // adjuntos con url="" si el proceso muere a mitad).
    const ext = extFromMime(effectiveType);
    const fileName = `${randomBytes(12).toString("hex")}.${ext}`;
    let url: string;
    try {
      url = await writeAdjunto(empleadoId, fileName, buffer);
    } catch (e) {
      console.error("uploadEmpleadoAdjunto write", e);
      return fail("No se pudo guardar el archivo.");
    }

    let row: { id: string };
    try {
      // Crear la fila y (si es foto) actualizar fotoUrl ATÓMICAMENTE: si algo
      // falla, se revierte la BD y se borra el archivo recién escrito.
      row = await prisma.$transaction(async (tx) => {
        const created = await tx.empleadoAdjunto.create({
          data: {
            empleadoId,
            tipo: trimmedTipo,
            url,
            mimeType: effectiveType,
            sizeBytes: file.size,
            uploadedById: me.id,
          },
          select: { id: true },
        });
        if (trimmedTipo === "foto") {
          await tx.empleado.update({
            where: { id: empleadoId },
            data: { fotoUrl: url, updatedBy: { connect: { id: me.id } } },
          });
        }
        return created;
      });
    } catch (e) {
      await removeAdjunto(empleadoId, fileName).catch(() => undefined);
      throw e;
    }

    refresh();
    return ok({ id: row.id, url });
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("uploadEmpleadoAdjunto", e);
    return fail("No se pudo subir el archivo.");
  }
}

export async function removeEmpleadoAdjunto(
  adjuntoId: string,
): Promise<ActionResult> {
  try {
    const me = await authorize("personal.write");
    const row = await prisma.empleadoAdjunto.findUnique({
      where: { id: adjuntoId },
      select: { id: true, empleadoId: true, url: true, tipo: true },
    });
    if (!row) return fail("Adjunto no encontrado.");
    await prisma.empleadoAdjunto.delete({ where: { id: row.id } });
    const fileName = row.url.split("/").pop();
    if (fileName) await removeAdjunto(row.empleadoId, fileName);
    if (row.tipo === "foto") {
      await prisma.empleado.update({
        where: { id: row.empleadoId },
        data: { fotoUrl: null, updatedBy: { connect: { id: me.id } } },
      });
    }
    refresh();
    return ok();
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("removeEmpleadoAdjunto", e);
    return fail("No se pudo eliminar el adjunto.");
  }
}

function csvCell(value: string | null | undefined): string {
  const s = (value ?? "").replace(/"/g, '""');
  return `"${s}"`;
}

export async function exportEmpleadosCsv(
  params: ListEmpleadosParams,
): Promise<ActionResult<{ csv: string; filename: string; count: number }>> {
  try {
    await authorize("personal.read");
    const where = buildWhere(params);
    const rows = await prisma.empleado.findMany({
      where,
      orderBy: [
        { apellidoPaterno: "asc" },
        { apellidoMaterno: "asc" },
        { nombres: "asc" },
      ],
    });
    const headers = [
      "Código",
      "Tipo Doc.",
      "Número Doc.",
      "Apellido Paterno",
      "Apellido Materno",
      "Nombres",
      "Cargo",
      "Detalle cargo",
      "Teléfono",
      "Email",
      "Dirección",
      "Fecha Ingreso",
      "Fecha Cese",
      "Estado",
      "Salario (S/)",
      "Observaciones",
    ];
    const fmt = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
    const lines = [headers.map(csvCell).join(";")];
    for (const r of rows) {
      lines.push(
        [
          r.codigo,
          r.tipoDocumento,
          r.numeroDocumento,
          r.apellidoPaterno,
          r.apellidoMaterno ?? "",
          r.nombres,
          CARGO_LABEL[r.cargo],
          r.cargoDetalle ?? "",
          r.telefono ?? "",
          r.email ?? "",
          r.direccion ?? "",
          fmt(r.fechaIngreso),
          fmt(r.fechaCese),
          r.estado,
          r.salario != null ? toNumber(r.salario).toFixed(2) : "",
          r.observaciones ?? "",
        ]
          .map(csvCell)
          .join(";"),
      );
    }
    const csv = "﻿" + lines.join("\r\n");
    const stamp = new Date().toISOString().slice(0, 10);
    return ok({ csv, filename: `personal-${stamp}.csv`, count: rows.length });
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("exportEmpleadosCsv", e);
    return fail("No se pudo generar el archivo.");
  }
}
