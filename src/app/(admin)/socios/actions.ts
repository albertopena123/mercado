"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { Prisma, type EstadoSocio, type TipoDocumento } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/server";
import type { PermissionKey } from "@/lib/auth/permissions";
import { hashPassword } from "@/lib/auth/password";
import { esDocumentoPendiente } from "@/lib/socios/document";
import { nextCodigoFromList } from "@/lib/socios/codigo";
import { buildStyledXlsx, type XlsxColumn, type XlsxValue } from "@/lib/xlsx";
import { ORG } from "@/lib/org";
import {
  buildSocioSearchKey,
  normalizeToken,
  splitSearchTokens,
} from "@/lib/socios/normalize";
import {
  lookupDniUnamad,
  type DniLookupResult,
} from "@/lib/socios/dni-lookup";
import { toNumber } from "@/lib/money";
import { hoyISOPeru } from "@/lib/fecha";
import { CATEGORIA_LABEL } from "@/lib/caja/labels";
import {
  writeAdjunto,
  removeAdjunto,
  removeSocioDir,
  extFromMime,
} from "@/lib/socios/storage";
import {
  validateUpload,
  sniffMime,
  SNIFF_BYTES,
  type UploadKind,
} from "@/lib/socios/limits";
import type {
  ActionResult,
  CreateSocioInput,
  UpdateSocioPatch,
  ListSociosParams,
  ListSociosResult,
  SocioRow,
  SocioDetail,
} from "./types";
import {
  validateSocioInput,
  buildSocioUpdateData,
} from "@/lib/socios/update";
import { getAntiguedadSocio, buscarRegistros, getHistoricoSocio } from "@/lib/padron/historico";
import type { AntiguedadSocio, RegistroBusqueda, LinajePuesto } from "@/lib/padron/types";

const ESTADO_LABEL: Record<EstadoSocio, string> = {
  activo: "Activo",
  suspendido: "Suspendido",
  retirado: "Retirado",
  fallecido: "Fallecido",
};

const PAGE_SIZE = 25;
const PAGE_SIZES = [25, 50, 100];
function clampSize(n?: number): number {
  return n && PAGE_SIZES.includes(n) ? n : PAGE_SIZE;
}
const MOTIVO_MIN = 5;

class Denied extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Denied";
  }
}

async function authorize(perm: PermissionKey): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new Denied("No autenticado.");
  if (!user.permissions.has(perm)) {
    throw new Denied("No tienes permisos para esta acción.");
  }
  return user;
}

function fail(error: string, fieldErrors?: Record<string, string>): ActionResult {
  return { ok: false, error, fieldErrors };
}

function ok<T>(data?: T): ActionResult<T> {
  return { ok: true, data };
}

function refresh() {
  revalidatePath("/socios");
}

function isP2002(e: unknown): boolean {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002"
  );
}

function toSocioRow(s: {
  id: string;
  codigo: string;
  numeroPadron: number | null;
  tipoDocumento: TipoDocumento;
  numeroDocumento: string;
  apellidoPaterno: string;
  apellidoMaterno: string | null;
  nombres: string;
  estado: EstadoSocio;
  fechaIngreso: Date;
  fotoUrl: string | null;
}): SocioRow {
  return {
    id: s.id,
    codigo: s.codigo,
    numeroPadron: s.numeroPadron,
    tipoDocumento: s.tipoDocumento,
    numeroDocumento: s.numeroDocumento,
    apellidoPaterno: s.apellidoPaterno,
    apellidoMaterno: s.apellidoMaterno,
    nombres: s.nombres,
    estado: s.estado,
    fechaIngreso: s.fechaIngreso.toISOString(),
    fotoUrl: s.fotoUrl,
  };
}

function buildWhere(params: {
  q?: string;
  estado?: ListSociosParams["estado"];
  tipoDocumento?: ListSociosParams["tipoDocumento"];
}): Prisma.SocioWhereInput {
  const where: Prisma.SocioWhereInput = {};
  if (params.estado) where.estado = params.estado;
  if (params.tipoDocumento) where.tipoDocumento = params.tipoDocumento;
  const q = params.q?.trim() ?? "";
  if (q) {
    // Tokenizar + normalizar (lowercase, sin tildes). Buscamos contra
    // searchKey, que es la concatenación normalizada de los 5 campos.
    // Esto permite que "mondragon" matchee "Mondragón" y que el orden
    // de las palabras no importe.
    const tokens = splitSearchTokens(q).map(normalizeToken);
    if (tokens.length > 0) {
      where.AND = tokens.map((token) => ({
        searchKey: { contains: token },
      }));
    }
  }
  return where;
}

const SORT_KEYS = ["padron", "documento", "nombre", "ingreso", "estado"] as const;
type SortKey = (typeof SORT_KEYS)[number];

function buildOrderBy(
  sort: SortKey,
  dir: "asc" | "desc",
): Prisma.SocioOrderByWithRelationInput[] {
  switch (sort) {
    case "padron":
      return [{ numeroPadron: dir }];
    case "documento":
      return [{ numeroDocumento: dir }];
    case "ingreso":
      return [{ fechaIngreso: dir }];
    case "estado":
      return [{ estado: dir }, { apellidoPaterno: "asc" }];
    case "nombre":
    default:
      return [
        { apellidoPaterno: dir },
        { apellidoMaterno: dir },
        { nombres: dir },
      ];
  }
}

export async function listSocios(
  params: ListSociosParams,
): Promise<ActionResult<ListSociosResult>> {
  try {
    await authorize("socios.read");
    const page = Math.max(1, params.page ?? 1);
    const sort: SortKey = SORT_KEYS.includes(params.sort as SortKey)
      ? (params.sort as SortKey)
      : "nombre";
    const dir: "asc" | "desc" = params.dir === "desc" ? "desc" : "asc";
    const pageSize = clampSize(params.pageSize);

    const where = buildWhere(params);

    const [total, rows] = await Promise.all([
      prisma.socio.count({ where }),
      prisma.socio.findMany({
        where,
        orderBy: buildOrderBy(sort, dir),
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          codigo: true,
          numeroPadron: true,
          tipoDocumento: true,
          numeroDocumento: true,
          apellidoPaterno: true,
          apellidoMaterno: true,
          nombres: true,
          estado: true,
          fechaIngreso: true,
          fotoUrl: true,
        },
      }),
    ]);

    return ok({
      items: rows.map(toSocioRow),
      total,
      page,
      pageSize,
      sort,
      dir,
    });
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("listSocios", e);
    return fail("No se pudo cargar el padrón.");
  }
}

export async function getSocioStats(): Promise<
  ActionResult<{
    total: number;
    activo: number;
    suspendido: number;
    retirado: number;
    fallecido: number;
  }>
> {
  try {
    await authorize("socios.read");
    const grouped = await prisma.socio.groupBy({
      by: ["estado"],
      _count: { _all: true },
    });
    const stats = {
      total: 0,
      activo: 0,
      suspendido: 0,
      retirado: 0,
      fallecido: 0,
    };
    for (const g of grouped) {
      const n = g._count._all;
      stats.total += n;
      stats[g.estado] = n;
    }
    return ok(stats);
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("getSocioStats", e);
    return fail("No se pudieron cargar las estadísticas.");
  }
}

export async function exportSociosXlsx(params: {
  q?: string;
  estado?: ListSociosParams["estado"];
  tipoDocumento?: ListSociosParams["tipoDocumento"];
}): Promise<ActionResult<{ base64: string; filename: string; count: number }>> {
  try {
    await authorize("socios.read");
    const where = buildWhere(params);
    const rows = await prisma.socio.findMany({
      where,
      orderBy: [
        { apellidoPaterno: "asc" },
        { apellidoMaterno: "asc" },
        { nombres: "asc" },
      ],
      select: {
        codigo: true,
        numeroPadron: true,
        tipoDocumento: true,
        numeroDocumento: true,
        apellidoPaterno: true,
        apellidoMaterno: true,
        nombres: true,
        sexo: true,
        estadoCivil: true,
        telefono: true,
        email: true,
        direccion: true,
        distrito: true,
        provincia: true,
        departamento: true,
        fechaNacimiento: true,
        fechaIngreso: true,
        estado: true,
        observaciones: true,
        // Puestos VIGENTES (hasta=null): un socio puede tener más de uno.
        asignacionesPuesto: {
          where: { hasta: null },
          select: { puesto: { select: { codigo: true } } },
        },
      },
    });

    const columns: XlsxColumn[] = [
      { header: "Código", align: "center", width: 12 },
      { header: "Nº Padrón", type: "number", width: 10 },
      { header: "Tipo Doc.", align: "center", width: 10 },
      { header: "Número Doc.", align: "center", width: 14 },
      { header: "Sin DNI", align: "center", width: 8 },
      { header: "Apellido Paterno", width: 18 },
      { header: "Apellido Materno", width: 18 },
      { header: "Nombres", width: 22 },
      { header: "Sexo", align: "center", width: 8 },
      { header: "Estado Civil", align: "center", width: 14 },
      { header: "Teléfono", align: "center", width: 13 },
      { header: "Email", width: 26 },
      { header: "Dirección", width: 30 },
      { header: "Distrito", width: 16 },
      { header: "Provincia", width: 16 },
      { header: "Departamento", width: 16 },
      { header: "Fecha Nacimiento", type: "date", width: 16 },
      { header: "Fecha Ingreso", type: "date", width: 15 },
      { header: "Estado", align: "center", width: 13 },
      { header: "N° Puestos", type: "number", width: 11 },
      { header: "Puestos asignados", width: 22 },
      { header: "Observaciones", width: 36 },
    ];

    const data: XlsxValue[][] = rows.map((r) => {
      // Códigos de puestos vigentes, ordenados (E1-A-12, E2-C-03…).
      const codigos = r.asignacionesPuesto
        .map((a) => a.puesto.codigo)
        .sort((a, b) => a.localeCompare(b, "es"));
      return [
        r.codigo,
        r.numeroPadron,
        r.tipoDocumento,
        // Documento placeholder de socio SIN DNI → en blanco (no "SIN-DNI-0001").
        esDocumentoPendiente(r.numeroDocumento) ? "" : r.numeroDocumento,
        esDocumentoPendiente(r.numeroDocumento) ? "SÍ" : "",
        r.apellidoPaterno,
        r.apellidoMaterno ?? "",
        r.nombres,
        r.sexo ?? "",
        r.estadoCivil ?? "",
        r.telefono ?? "",
        r.email ?? "",
        r.direccion ?? "",
        r.distrito ?? "",
        r.provincia ?? "",
        r.departamento ?? "",
        r.fechaNacimiento,
        r.fechaIngreso,
        ESTADO_LABEL[r.estado] ?? r.estado,
        codigos.length,
        codigos.join(", "),
        r.observaciones ?? "",
      ];
    });

    // Banda de metadatos: cuándo se generó, filtros aplicados y total.
    const generado = new Intl.DateTimeFormat("es-PE", {
      timeZone: "America/Lima",
      dateStyle: "long",
      timeStyle: "short",
    }).format(new Date());
    const filtros: string[] = [];
    if (params.q?.trim()) filtros.push(`búsqueda "${params.q.trim()}"`);
    if (params.estado) filtros.push(`estado: ${ESTADO_LABEL[params.estado] ?? params.estado}`);
    if (params.tipoDocumento) filtros.push(`documento: ${params.tipoDocumento}`);

    const buf = buildStyledXlsx({
      sheetName: "Padrón de socios",
      title: "Padrón de socios",
      subtitle: ORG.nombre,
      meta: [
        `Generado el ${generado} (hora de Lima)`,
        filtros.length ? `Filtros: ${filtros.join(" · ")}` : "Sin filtros — padrón completo",
        `Total: ${rows.length} ${rows.length === 1 ? "socio" : "socios"}`,
      ],
      columns,
      rows: data,
    });
    const stamp = hoyISOPeru();
    return ok({
      base64: buf.toString("base64"),
      filename: "padron-socios-" + stamp + ".xlsx",
      count: rows.length,
    });
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("exportSociosXlsx", e);
    return fail("No se pudo generar el archivo.");
  }
}

export async function getSocio(
  id: string,
): Promise<ActionResult<SocioDetail>> {
  try {
    await authorize("socios.read");
    const s = await prisma.socio.findUnique({
      where: { id },
      include: {
        adjuntos: { orderBy: { createdAt: "desc" } },
        estadoLog: {
          orderBy: { createdAt: "desc" },
          include: { byUser: { select: { id: true, name: true } } },
        },
        asignacionesPuesto: {
          orderBy: { desde: "desc" },
          include: {
            puesto: {
              select: {
                id: true,
                codigo: true,
                etapa: true,
                giro: true,
                dimension: true,
                estado: true,
              },
            },
          },
        },
        // Cargos directivos VIGENTES (hasta=null): para mostrar si el socio es
        // miembro del Consejo Directivo / Fiscalía / coordinador de bloque.
        directivos: { where: { hasta: null }, orderBy: { desde: "desc" } },
      },
    });
    if (!s) return fail("Socio no encontrado.");

    const deudaAgg = await prisma.cuota.aggregate({
      where: { socioId: id, estado: "pendiente" },
      _sum: { monto: true },
    });
    const deuda = toNumber(deudaAgg._sum.monto);

    return ok({
      ...toSocioRow(s),
      deuda,
      fechaNacimiento: s.fechaNacimiento?.toISOString() ?? null,
      sexo: s.sexo,
      estadoCivil: s.estadoCivil,
      telefono: s.telefono,
      email: s.email,
      direccion: s.direccion,
      distrito: s.distrito,
      provincia: s.provincia,
      departamento: s.departamento,
      observaciones: s.observaciones,
      portalEnabled: s.portalEnabled,
      userId: s.userId,
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
      estadoLog: s.estadoLog.map((l) => ({
        id: l.id,
        fromEstado: l.fromEstado,
        toEstado: l.toEstado,
        motivo: l.motivo,
        createdAt: l.createdAt.toISOString(),
        byUser: l.byUser,
      })),
      puestos: s.asignacionesPuesto.map((a) => ({
        id: a.id,
        puestoId: a.puestoId,
        codigo: a.puesto.codigo,
        etapa: a.puesto.etapa,
        giro: a.puesto.giro,
        dimension: a.puesto.dimension,
        estadoPuesto: a.puesto.estado,
        desde: a.desde.toISOString(),
        hasta: a.hasta ? a.hasta.toISOString() : null,
        motivo: a.motivo,
      })),
      directivos: s.directivos.map((d) => ({
        id: d.id,
        organo: d.organo,
        cargo: d.cargo,
        bloque: d.bloque,
        periodo: d.periodo,
        desde: d.desde.toISOString(),
      })),
    });
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("getSocio", e);
    return fail("No se pudo cargar el socio.");
  }
}

export async function createSocio(
  input: CreateSocioInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const me = await authorize("socios.write");
    const { fieldErrors, normalized } = validateSocioInput(input, true);
    if (Object.keys(fieldErrors).length > 0) {
      return fail("Revisa los campos marcados.", fieldErrors);
    }

    // Acceso al portal opcional: si viene contraseña, además del socio se crea
    // su usuario (rol Socio + portalEnabled) en la misma transacción.
    const wantsPortal =
      typeof input.portalPassword === "string" && input.portalPassword.length > 0;
    let portalHash: string | null = null;
    if (wantsPortal) {
      if (!me.permissions.has("users.write"))
        return fail("No tienes permiso para crear el acceso de usuario.");
      const pwd = input.portalPassword!;
      if (pwd.length < 6 || pwd.length > 200)
        return fail("Revisa los campos marcados.", {
          portalPassword: "La contraseña debe tener entre 6 y 200 caracteres.",
        });
      // No duplicar: el documento (o correo) no debe tener ya una cuenta.
      const docDup = await prisma.user.findFirst({
        where: {
          tipoDocumento: normalized.tipoDocumento!,
          numeroDocumento: normalized.numeroDocumento!,
        },
        select: { id: true },
      });
      if (docDup)
        return fail("Ya existe un usuario con ese documento.", {
          portalPassword: "Ese documento ya tiene una cuenta de usuario.",
        });
      if (normalized.email) {
        const emailDup = await prisma.user.findUnique({
          where: { email: normalized.email },
          select: { id: true },
        });
        if (emailDup)
          return fail("Ya existe un usuario con ese correo.", {
            portalPassword: "Ese correo ya tiene una cuenta de usuario.",
          });
      }
      portalHash = await hashPassword(pwd);
    }

    // Cuota de inscripción opcional → ingreso a caja al dar de alta.
    const inscripcion =
      input.montoInscripcion != null && Number(input.montoInscripcion) > 0
        ? Math.round(Number(input.montoInscripcion) * 100) / 100
        : 0;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const result = await prisma.$transaction(async (tx) => {
          const dup = await tx.socio.findFirst({
            where: {
              tipoDocumento: normalized.tipoDocumento!,
              numeroDocumento: normalized.numeroDocumento!,
            },
            select: { id: true },
          });
          if (dup) return { duplicate: true as const };

          const codigos = await tx.socio.findMany({
            where: { codigo: { startsWith: "SOC-" } },
            select: { codigo: true },
          });
          const codigo = nextCodigoFromList(codigos.map((s) => s.codigo));
          const searchKey = buildSocioSearchKey({
            codigo,
            numeroDocumento: normalized.numeroDocumento!,
            numeroPadron: normalized.numeroPadron ?? null,
            apellidoPaterno: normalized.apellidoPaterno!,
            apellidoMaterno: normalized.apellidoMaterno ?? null,
            nombres: normalized.nombres!,
          });
          const created = await tx.socio.create({
            data: {
              codigo,
              searchKey,
              tipoDocumento: normalized.tipoDocumento!,
              numeroDocumento: normalized.numeroDocumento!,
              numeroPadron: normalized.numeroPadron ?? null,
              apellidoPaterno: normalized.apellidoPaterno!,
              apellidoMaterno: normalized.apellidoMaterno ?? null,
              nombres: normalized.nombres!,
              fechaNacimiento: normalized.fechaNacimiento
                ? new Date(normalized.fechaNacimiento)
                : null,
              sexo: normalized.sexo ?? null,
              estadoCivil: normalized.estadoCivil ?? null,
              telefono: normalized.telefono ?? null,
              email: normalized.email ?? null,
              direccion: normalized.direccion ?? null,
              distrito: normalized.distrito ?? null,
              provincia: normalized.provincia ?? null,
              departamento: normalized.departamento ?? null,
              fechaIngreso: new Date(normalized.fechaIngreso!),
              observaciones: normalized.observaciones ?? null,
              createdById: me.id,
              updatedById: me.id,
            },
          });
          await tx.socioEstadoLog.create({
            data: {
              socioId: created.id,
              fromEstado: created.estado,
              toEstado: created.estado,
              motivo: "Alta del socio",
              byUserId: me.id,
            },
          });

          // Cuota de inscripción → ingreso a caja (fecha = fecha de ingreso).
          if (inscripcion > 0) {
            const concepto = `Inscripción de socio · ${codigo}`;
            await tx.movimientoCaja.create({
              data: {
                tipo: "ingreso",
                categoria: "inscripcion",
                monto: new Prisma.Decimal(inscripcion.toFixed(2)),
                fecha: new Date(normalized.fechaIngreso!),
                concepto,
                metodoPago: "efectivo",
                socioId: created.id,
                origen: "inscripcion",
                registradoPorId: me.id,
                searchKey: [concepto, CATEGORIA_LABEL.inscripcion]
                  .map(normalizeToken)
                  .join(" "),
              },
            });
          }

          // Acceso al portal: crea el usuario comerciante y lo vincula.
          if (portalHash) {
            const socioRole = await tx.role.findUnique({
              where: { key: "socio" },
              select: { id: true },
            });
            const fullName = [
              created.apellidoPaterno,
              created.apellidoMaterno,
              created.nombres,
            ]
              .filter(Boolean)
              .join(" ");
            let u: { id: string };
            try {
              u = await tx.user.create({
                data: {
                  name: fullName,
                  email: created.email ?? null,
                  tipoDocumento: created.tipoDocumento,
                  numeroDocumento: created.numeroDocumento,
                  passwordHash: portalHash,
                  roles: socioRole
                    ? { create: [{ roleId: socioRole.id }] }
                    : undefined,
                },
                select: { id: true },
              });
            } catch (e) {
              // P2002 aquí es un choque en la tabla User (no en Socio): traducir
              // a un mensaje específico. Sin esto, el catch externo lo confundía
              // con un duplicado de socio o devolvía un error genérico opaco.
              if (isP2002(e)) {
                const target = (e as Prisma.PrismaClientKnownRequestError).meta
                  ?.target as string[] | undefined;
                if (target?.includes("email"))
                  throw new Denied(
                    "Ya existe una cuenta de usuario con ese correo.",
                  );
                throw new Denied(
                  "Ya existe una cuenta de usuario con ese documento.",
                );
              }
              throw e;
            }
            await tx.socio.update({
              where: { id: created.id },
              data: { userId: u.id, portalEnabled: true },
            });
          }

          return { id: created.id };
        });

        if ("duplicate" in result) {
          return fail("Ya existe un socio con ese documento.", {
            numeroDocumento: "Documento en uso.",
          });
        }
        refresh();
        return ok(result);
      } catch (e) {
        if (isP2002(e)) {
          const target = (e as Prisma.PrismaClientKnownRequestError).meta
            ?.target as string[] | undefined;
          if (target?.includes("codigo")) continue;
          if (
            target?.includes("tipoDocumento") ||
            target?.includes("numeroDocumento")
          ) {
            return fail("Ya existe un socio con ese documento.", {
              numeroDocumento: "Documento en uso.",
            });
          }
          throw e;
        }
        throw e;
      }
    }
    return fail("Conflicto al generar el código del socio. Reintenta.");
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("createSocio", e);
    return fail("No se pudo crear el socio.");
  }
}

export async function updateSocio(
  id: string,
  patch: UpdateSocioPatch,
): Promise<ActionResult> {
  try {
    const me = await authorize("socios.write");
    const existing = await prisma.socio.findUnique({
      where: { id },
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
    if (!existing) return fail("Socio no encontrado.");

    const merged: Partial<CreateSocioInput> = {
      tipoDocumento: patch.tipoDocumento ?? existing.tipoDocumento,
      ...patch,
    };
    const { fieldErrors, normalized } = validateSocioInput(merged, false);
    if (Object.keys(fieldErrors).length > 0) {
      return fail("Revisa los campos marcados.", fieldErrors);
    }

    const { data, docCambia } = buildSocioUpdateData(normalized, existing);
    data.updatedBy = { connect: { id: me.id } };

    try {
      await prisma.$transaction(async (tx) => {
        await tx.socio.update({ where: { id }, data });
        // Enfoque A: el documento se denormaliza en User. Si el socio tiene
        // cuenta y cambió su documento, propagamos el cambio al usuario.
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
      if (isP2002(e)) {
        return fail("Ya existe un socio con ese documento.", {
          numeroDocumento: "Documento en uso.",
        });
      }
      throw e;
    }
    refresh();
    return ok();
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("updateSocio", e);
    return fail("No se pudo actualizar el socio.");
  }
}

export async function deleteSocio(id: string): Promise<ActionResult> {
  try {
    await authorize("socios.delete");
    const existing = await prisma.socio.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) return fail("Socio no encontrado.");

    // El borrado es físico y en cascada (cuotas, asistencias, asignaciones,
    // adjuntos, historial). No permitir destruir registros financieros: si el
    // socio tiene cuotas pagadas hay que retirarlo (cambio de estado), no
    // eliminarlo, para conservar el historial contable y de auditoría.
    const cuotasPagadas = await prisma.cuota.count({
      where: { socioId: id, estado: "pagada" },
    });
    if (cuotasPagadas > 0) {
      return fail(
        "No se puede eliminar: el socio tiene pagos registrados. Cámbialo a estado “retirado” para conservar el historial.",
      );
    }

    // Tampoco si tiene puestos en su historial: borrarlo (en cascada) borraría
    // el registro de qué puestos tuvo y a quién pertenecieron. Se retira, no se
    // elimina, para conservar la trazabilidad de propiedad.
    const asignaciones = await prisma.puestoAsignacion.count({
      where: { socioId: id },
    });
    if (asignaciones > 0) {
      return fail(
        "No se puede eliminar: el socio tiene puestos en su historial. Cámbialo a estado “retirado” para conservar la trazabilidad de propiedad.",
      );
    }

    await prisma.socio.delete({ where: { id } });
    await removeSocioDir(id);
    refresh();
    return ok();
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("deleteSocio", e);
    return fail("No se pudo eliminar el socio.");
  }
}

// Transiciones de estado permitidas. fallecido es terminal; desde retirado solo
// se puede reactivar (re-alta). Espejado en ChangeEstadoModal para la UI.
const ESTADO_TRANSICIONES: Record<EstadoSocio, EstadoSocio[]> = {
  activo: ["suspendido", "retirado", "fallecido"],
  suspendido: ["activo", "retirado", "fallecido"],
  retirado: ["activo"],
  fallecido: [],
};

export async function changeEstadoSocio(
  id: string,
  toEstado: EstadoSocio,
  motivo: string,
): Promise<ActionResult> {
  try {
    const me = await authorize("socios.change-state");
    const m = (motivo ?? "").trim();
    if (m.length < MOTIVO_MIN) {
      return fail("Motivo demasiado corto.", {
        motivo: `Mínimo ${MOTIVO_MIN} caracteres.`,
      });
    }

    await prisma.$transaction(async (tx) => {
      // Al retirar o registrar fallecimiento se liberan los puestos del socio.
      // Bloquear sus filas Puesto vigentes ANTES de leer/escribir, para
      // serializar contra assignPuesto/formalizarTransferencia/efectivizarRenuncia
      // (que también toman SELECT ... FOR UPDATE sobre Puesto). Sin esto, una
      // reasignación concurrente podía quedar pisada a "vacio" (estado
      // inconsistente: puesto vacío con asignación activa). Igual patrón que
      // efectivizarRenuncia.
      if (toEstado === "retirado" || toEstado === "fallecido") {
        await tx.$queryRaw`SELECT p.id FROM "Puesto" p
          JOIN "PuestoAsignacion" pa ON pa."puestoId" = p.id
          WHERE pa."socioId" = ${id} AND pa.hasta IS NULL
          FOR UPDATE OF p`;
      }
      const cur = await tx.socio.findUnique({
        where: { id },
        select: { estado: true },
      });
      if (!cur) throw new Denied("Socio no encontrado.");
      if (cur.estado === toEstado)
        throw new Denied("El socio ya está en ese estado.");
      // Máquina de estados: evita resucitar un fallecido (terminal) y otras
      // transiciones sin sentido.
      if (!ESTADO_TRANSICIONES[cur.estado].includes(toEstado))
        throw new Denied(
          `No se permite cambiar de “${cur.estado}” a “${toEstado}”.`,
        );

      const updates: Prisma.SocioUpdateInput = {
        estado: toEstado,
        updatedBy: { connect: { id: me.id } },
      };
      if (toEstado === "fallecido") updates.portalEnabled = false;

      await tx.socio.update({ where: { id }, data: updates });
      await tx.socioEstadoLog.create({
        data: {
          socioId: id,
          fromEstado: cur.estado,
          toEstado,
          motivo: m,
          byUserId: me.id,
        },
      });

      // Al retirar o registrar fallecimiento, liberar sus puestos vigentes:
      // cerrar las asignaciones y dejar el puesto vacío, para que la propiedad
      // no quede a nombre de quien ya no es socio activo.
      if (toEstado === "retirado" || toEstado === "fallecido") {
        const abiertas = await tx.puestoAsignacion.findMany({
          where: { socioId: id, hasta: null },
          select: { puestoId: true },
        });
        if (abiertas.length > 0) {
          await tx.puestoAsignacion.updateMany({
            where: { socioId: id, hasta: null },
            data: { hasta: new Date(), motivo: `Socio ${toEstado}: ${m}` },
          });
          await tx.puesto.updateMany({
            where: { id: { in: abiertas.map((a) => a.puestoId) } },
            data: { estado: "vacio" },
          });
        }
      }
    });

    refresh();
    return ok();
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("changeEstadoSocio", e);
    return fail("No se pudo cambiar el estado del socio.");
  }
}

export async function uploadAdjunto(
  socioId: string,
  tipo: string,
  file: File,
): Promise<ActionResult<{ id: string; url: string }>> {
  try {
    const me = await authorize("socios.write");
    const trimmedTipo = (tipo ?? "").trim() || "otro";
    // Una foto debe ser imagen; un documento admite además PDF. Backstop del
    // servidor: el cliente ya valida lo mismo antes de subir.
    const kind: UploadKind = trimmedTipo === "foto" ? "foto" : "doc";

    // Materializamos el archivo y detectamos su tipo REAL por contenido (magic
    // bytes), sin confiar en file.type (a veces vacío, p. ej. imágenes de IA).
    // El tamaño está acotado por bodySizeLimit, así que leer el buffer es seguro.
    const buffer = Buffer.from(await file.arrayBuffer());
    const sniffed = sniffMime(buffer.subarray(0, SNIFF_BYTES));
    const effectiveType = sniffed ?? file.type;

    const invalid = validateUpload(file, kind, sniffed);
    if (invalid) return fail(invalid);

    const existing = await prisma.socio.findUnique({
      where: { id: socioId },
      select: { id: true },
    });
    if (!existing) return fail("Socio no encontrado.");

    // Escribir el archivo PRIMERO y crear la fila ya con la URL final. El orden
    // anterior (crear fila con url="" → escribir → update) dejaba un adjunto
    // roto en la BD si el proceso moría entre la escritura y el update. El
    // nombre se desacopla del id de la fila con un token aleatorio.
    const ext = extFromMime(effectiveType);
    const fileName = `${randomBytes(12).toString("hex")}.${ext}`;

    let url: string;
    try {
      url = await writeAdjunto(socioId, fileName, buffer);
    } catch (e) {
      console.error("uploadAdjunto write", e);
      return fail("No se pudo guardar el archivo.");
    }

    let row: { id: string };
    try {
      row = await prisma.socioAdjunto.create({
        data: {
          socioId,
          tipo: trimmedTipo,
          url,
          mimeType: effectiveType,
          sizeBytes: file.size,
          uploadedById: me.id,
        },
        select: { id: true },
      });
    } catch (e) {
      // Si falla el insert, limpiar el archivo recién escrito (huérfano).
      await removeAdjunto(socioId, fileName).catch(() => undefined);
      throw e;
    }

    if (trimmedTipo === "foto") {
      await prisma.socio.update({
        where: { id: socioId },
        data: { fotoUrl: url, updatedBy: { connect: { id: me.id } } },
      });
    }

    refresh();
    return ok({ id: row.id, url });
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("uploadAdjunto", e);
    return fail("No se pudo subir el adjunto.");
  }
}

export async function setFoto(
  socioId: string,
  file: File,
): Promise<ActionResult<{ url: string }>> {
  const r = await uploadAdjunto(socioId, "foto", file);
  if (!r.ok) return r;
  return ok({ url: r.data!.url });
}

export async function lookupDniAction(
  dni: string,
): Promise<ActionResult<DniLookupResult>> {
  try {
    await authorize("socios.write");
    const clean = (dni ?? "").trim();
    if (!/^\d{8}$/.test(clean)) {
      return fail("El DNI debe tener exactamente 8 dígitos.");
    }
    let data: DniLookupResult | null;
    try {
      data = await lookupDniUnamad(clean);
    } catch (e) {
      console.error("lookupDniAction fetch", e);
      const err = e as { name?: string };
      if (err?.name === "AbortError") {
        return fail("La consulta al servicio de DNI tardó demasiado.");
      }
      return fail("No se pudo consultar el servicio de DNI.");
    }
    if (!data) {
      return fail("No se encontró información para este DNI.");
    }
    return ok(data);
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("lookupDniAction", e);
    return fail("No se pudo consultar el DNI.");
  }
}

export async function removeAdjuntoAction(
  adjuntoId: string,
): Promise<ActionResult> {
  try {
    const me = await authorize("socios.write");
    const row = await prisma.socioAdjunto.findUnique({
      where: { id: adjuntoId },
      select: { id: true, socioId: true, url: true, tipo: true },
    });
    if (!row) return fail("Adjunto no encontrado.");

    await prisma.socioAdjunto.delete({ where: { id: row.id } });

    const fileName = row.url.split("/").pop();
    if (fileName) await removeAdjunto(row.socioId, fileName);

    if (row.tipo === "foto") {
      await prisma.socio.update({
        where: { id: row.socioId },
        data: { fotoUrl: null, updatedBy: { connect: { id: me.id } } },
      });
    }
    refresh();
    return ok();
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("removeAdjuntoAction", e);
    return fail("No se pudo eliminar el adjunto.");
  }
}

export async function getPadronHistoricoSocio(
  socioId: string,
): Promise<ActionResult<AntiguedadSocio>> {
  try {
    await authorize("socios.read");
    return ok(await getAntiguedadSocio(socioId));
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("getPadronHistoricoSocio", e);
    return fail("No se pudo cargar el padrón histórico del socio.");
  }
}

// Solo lectura: además del agregado de antigüedad, devuelve la línea de tiempo
// COMPLETA de cada puesto vigente del socio (quién fue el titular en cada
// empadronamiento). Así el tab del socio muestra toda la historia —no solo el
// resumen "desde 2021"— sin escribir nada.
export async function getHistoricoCompletoSocio(
  socioId: string,
): Promise<ActionResult<{ antiguedad: AntiguedadSocio; linajes: LinajePuesto[] }>> {
  try {
    await authorize("socios.read");
    // getHistoricoSocio calcula antigüedad y linajes en una sola pasada (sin
    // recalcular los linajes ni releer las gestiones por puesto).
    return ok(await getHistoricoSocio(socioId));
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("getHistoricoCompletoSocio", e);
    return fail("No se pudo cargar el padrón histórico del socio.");
  }
}

export async function buscarPadronHistorico(
  q: string,
): Promise<ActionResult<RegistroBusqueda[]>> {
  try {
    await authorize("socios.read");
    return ok(await buscarRegistros(q));
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("buscarPadronHistorico", e);
    return fail("No se pudo buscar en el padrón histórico.");
  }
}
