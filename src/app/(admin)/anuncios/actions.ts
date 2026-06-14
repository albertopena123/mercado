"use server";

import { revalidatePath } from "next/cache";
import {
  Prisma,
  type EstadoAnuncio,
  type TipoAnuncio,
  type VisibilidadAnuncio,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/server";
import type { PermissionKey } from "@/lib/auth/permissions";
import { normalizeToken } from "@/lib/socios/normalize";
import { validateUpload, sniffMime, SNIFF_BYTES } from "@/lib/socios/limits";
import { writeImagen, extFromMime, removeAnuncioDir } from "@/lib/anuncios/storage";
import type {
  ActionResult,
  CreateAnuncioInput,
  UpdateAnuncioPatch,
  ListAnunciosParams,
  ListAnunciosResult,
  AnuncioRow,
  AnuncioDetail,
  AnuncioStats,
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
  revalidatePath("/anuncios");
  revalidatePath("/"); // el landing muestra los públicos
}
function isP2002(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

function buildSearchKey(p: { titulo: string; resumen?: string | null }): string {
  return [p.titulo, p.resumen]
    .filter((x): x is string => Boolean(x))
    .map(normalizeToken)
    .join(" ");
}

const SORT_KEYS = [
  "titulo",
  "tipo",
  "visibilidad",
  "estado",
  "publicadoEn",
  "createdAt",
] as const;
type SortKey = (typeof SORT_KEYS)[number];

function buildOrderBy(
  sort: SortKey,
  dir: "asc" | "desc",
): Prisma.AnuncioOrderByWithRelationInput[] {
  switch (sort) {
    case "titulo":
      return [{ titulo: dir }];
    case "tipo":
      return [{ tipo: dir }, { createdAt: "desc" }];
    case "visibilidad":
      return [{ visibilidad: dir }, { createdAt: "desc" }];
    case "estado":
      return [{ estado: dir }, { createdAt: "desc" }];
    case "publicadoEn":
      return [{ publicadoEn: dir }];
    case "createdAt":
    default:
      return [{ createdAt: dir }];
  }
}

function buildWhere(params: {
  q?: string;
  estado?: EstadoAnuncio;
  tipo?: TipoAnuncio;
  visibilidad?: VisibilidadAnuncio;
}): Prisma.AnuncioWhereInput {
  const where: Prisma.AnuncioWhereInput = {};
  if (params.estado) where.estado = params.estado;
  if (params.tipo) where.tipo = params.tipo;
  if (params.visibilidad) where.visibilidad = params.visibilidad;
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

function rowOf(p: {
  id: string;
  titulo: string;
  tipo: TipoAnuncio;
  visibilidad: VisibilidadAnuncio;
  estado: EstadoAnuncio;
  fijado: boolean;
  imagenUrl: string | null;
  publicadoEn: Date | null;
  validoHasta: Date | null;
  createdAt: Date;
}): AnuncioRow {
  return {
    id: p.id,
    titulo: p.titulo,
    tipo: p.tipo,
    visibilidad: p.visibilidad,
    estado: p.estado,
    fijado: p.fijado,
    imagenUrl: p.imagenUrl,
    publicadoEn: p.publicadoEn ? p.publicadoEn.toISOString() : null,
    validoHasta: p.validoHasta ? p.validoHasta.toISOString() : null,
    createdAt: p.createdAt.toISOString(),
  };
}

export async function listAnuncios(
  params: ListAnunciosParams,
): Promise<ActionResult<ListAnunciosResult>> {
  try {
    await authorize("anuncios.read");
    const page = Math.max(1, params.page ?? 1);
    const sort: SortKey = SORT_KEYS.includes(params.sort as SortKey)
      ? (params.sort as SortKey)
      : "createdAt";
    const dir: "asc" | "desc" = params.dir === "asc" ? "asc" : "desc";
    const pageSize = clampSize(params.pageSize);
    const where = buildWhere(params);

    const [total, rows] = await Promise.all([
      prisma.anuncio.count({ where }),
      prisma.anuncio.findMany({
        where,
        orderBy: buildOrderBy(sort, dir),
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          titulo: true,
          tipo: true,
          visibilidad: true,
          estado: true,
          fijado: true,
          imagenUrl: true,
          publicadoEn: true,
          validoHasta: true,
          createdAt: true,
        },
      }),
    ]);

    return ok({
      items: rows.map(rowOf),
      total,
      page,
      pageSize,
      sort,
      dir,
    });
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("listAnuncios", e);
    return fail("No se pudieron cargar los anuncios.");
  }
}

export async function getAnuncio(
  id: string,
): Promise<ActionResult<AnuncioDetail>> {
  try {
    await authorize("anuncios.read");
    const p = await prisma.anuncio.findUnique({
      where: { id },
      include: {
        createdBy: { select: { name: true } },
        updatedBy: { select: { name: true } },
      },
    });
    if (!p) return fail("Anuncio no encontrado.");
    return ok({
      ...rowOf(p),
      resumen: p.resumen,
      contenido: p.contenido,
      updatedAt: p.updatedAt.toISOString(),
      createdBy: p.createdBy?.name ?? null,
      updatedBy: p.updatedBy?.name ?? null,
    });
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("getAnuncio", e);
    return fail("No se pudo cargar el anuncio.");
  }
}

function validate(
  input: Partial<CreateAnuncioInput>,
  isCreate: boolean,
): { fieldErrors: Record<string, string>; normalized: Partial<CreateAnuncioInput> } {
  const fe: Record<string, string> = {};
  const out: Partial<CreateAnuncioInput> = {};

  if (isCreate || input.titulo !== undefined) {
    const t = String(input.titulo ?? "").trim();
    if (t.length < 3) fe.titulo = "El título es muy corto (mínimo 3).";
    else out.titulo = t;
  }
  if (isCreate || input.contenido !== undefined) {
    const c = String(input.contenido ?? "").trim();
    if (c.length < 3) fe.contenido = "El contenido no puede estar vacío.";
    else out.contenido = c;
  }
  if (input.resumen !== undefined) {
    out.resumen = String(input.resumen).trim() || undefined;
  }
  if (input.tipo !== undefined) out.tipo = input.tipo;
  if (input.visibilidad !== undefined) out.visibilidad = input.visibilidad;
  if (input.estado !== undefined) out.estado = input.estado;
  if (input.fijado !== undefined) out.fijado = Boolean(input.fijado);
  if (input.validoHasta !== undefined) {
    if (input.validoHasta === null || input.validoHasta === "")
      out.validoHasta = null;
    else {
      const d = new Date(input.validoHasta);
      if (isNaN(d.getTime())) fe.validoHasta = "Fecha inválida.";
      else out.validoHasta = d.toISOString();
    }
  }
  return { fieldErrors: fe, normalized: out };
}

export async function createAnuncio(
  input: CreateAnuncioInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const me = await authorize("anuncios.write");
    const { fieldErrors, normalized } = validate(input, true);
    if (Object.keys(fieldErrors).length > 0)
      return fail("Revisa los campos marcados.", fieldErrors);

    const titulo = normalized.titulo!;
    const contenido = normalized.contenido!;
    const resumen = normalized.resumen ?? null;
    const estado = normalized.estado ?? "borrador";

    try {
      const created = await prisma.anuncio.create({
        data: {
          titulo,
          resumen,
          contenido,
          tipo: normalized.tipo ?? "anuncio",
          visibilidad: normalized.visibilidad ?? "publico",
          estado,
          fijado: normalized.fijado ?? false,
          publicadoEn: estado === "publicado" ? new Date() : null,
          validoHasta: normalized.validoHasta
            ? new Date(normalized.validoHasta)
            : null,
          searchKey: buildSearchKey({ titulo, resumen }),
          createdById: me.id,
          updatedById: me.id,
        },
      });
      refresh();
      return ok({ id: created.id });
    } catch (e) {
      if (isP2002(e)) return fail("Ya existe un anuncio con esos datos.");
      throw e;
    }
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("createAnuncio", e);
    return fail("No se pudo crear el anuncio.");
  }
}

export async function updateAnuncio(
  id: string,
  patch: UpdateAnuncioPatch,
): Promise<ActionResult> {
  try {
    const me = await authorize("anuncios.write");
    const existing = await prisma.anuncio.findUnique({
      where: { id },
      select: {
        titulo: true,
        resumen: true,
        contenido: true,
        estado: true,
        publicadoEn: true,
      },
    });
    if (!existing) return fail("Anuncio no encontrado.");

    const { fieldErrors, normalized } = validate(patch, false);
    if (Object.keys(fieldErrors).length > 0)
      return fail("Revisa los campos marcados.", fieldErrors);

    const titulo = normalized.titulo ?? existing.titulo;
    const contenido = normalized.contenido ?? existing.contenido;
    const resumen =
      "resumen" in normalized ? normalized.resumen ?? null : existing.resumen;

    const data: Prisma.AnuncioUpdateInput = {
      titulo,
      contenido,
      resumen,
      searchKey: buildSearchKey({ titulo, resumen }),
      updatedBy: { connect: { id: me.id } },
    };
    if (normalized.tipo !== undefined) data.tipo = normalized.tipo;
    if (normalized.visibilidad !== undefined)
      data.visibilidad = normalized.visibilidad;
    if (normalized.fijado !== undefined) data.fijado = normalized.fijado;
    if ("validoHasta" in normalized)
      data.validoHasta = normalized.validoHasta
        ? new Date(normalized.validoHasta)
        : null;
    if (normalized.estado !== undefined) {
      data.estado = normalized.estado;
      if (normalized.estado === "publicado" && !existing.publicadoEn)
        data.publicadoEn = new Date();
    }

    await prisma.anuncio.update({ where: { id }, data });
    refresh();
    return ok();
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("updateAnuncio", e);
    return fail("No se pudo actualizar el anuncio.");
  }
}

export async function publishAnuncio(id: string): Promise<ActionResult> {
  try {
    const me = await authorize("anuncios.write");
    const existing = await prisma.anuncio.findUnique({
      where: { id },
      select: { publicadoEn: true },
    });
    if (!existing) return fail("Anuncio no encontrado.");
    await prisma.anuncio.update({
      where: { id },
      data: {
        estado: "publicado",
        publicadoEn: existing.publicadoEn ?? new Date(),
        updatedBy: { connect: { id: me.id } },
      },
    });
    refresh();
    return ok();
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("publishAnuncio", e);
    return fail("No se pudo publicar el anuncio.");
  }
}

export async function deleteAnuncio(id: string): Promise<ActionResult> {
  try {
    await authorize("anuncios.delete");
    await prisma.anuncio.delete({ where: { id } });
    await removeAnuncioDir(id);
    refresh();
    return ok();
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("deleteAnuncio", e);
    return fail("No se pudo eliminar el anuncio.");
  }
}

export async function getAnuncioStats(): Promise<ActionResult<AnuncioStats>> {
  try {
    await authorize("anuncios.read");
    const grouped = await prisma.anuncio.groupBy({
      by: ["estado"],
      _count: { _all: true },
    });
    const stats: AnuncioStats = {
      total: 0,
      publicado: 0,
      borrador: 0,
      archivado: 0,
    };
    for (const g of grouped) {
      stats.total += g._count._all;
      stats[g.estado] = g._count._all;
    }
    return ok(stats);
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("getAnuncioStats", e);
    return fail("No se pudieron cargar las estadísticas.");
  }
}

export async function uploadAnuncioImagen(
  anuncioId: string,
  file: File,
): Promise<ActionResult<{ url: string }>> {
  try {
    const me = await authorize("anuncios.write");
    const anuncio = await prisma.anuncio.findUnique({
      where: { id: anuncioId },
      select: { id: true },
    });
    if (!anuncio) return fail("Anuncio no encontrado.");

    const head = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
    const sniffed = sniffMime(head);
    const err = validateUpload(file, "foto", sniffed);
    if (err) return fail(err);

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = extFromMime(sniffed ?? file.type);
    const fileName = `img-${Date.now()}.${ext}`;
    const url = await writeImagen(anuncioId, fileName, buffer);

    await prisma.anuncio.update({
      where: { id: anuncioId },
      data: { imagenUrl: url, updatedById: me.id },
    });
    refresh();
    return ok({ url });
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("uploadAnuncioImagen", e);
    return fail("No se pudo subir la imagen.");
  }
}
