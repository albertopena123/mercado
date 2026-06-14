import { requirePermission } from "@/lib/auth/server";
import { listAnuncios, getAnuncioStats } from "./actions";
import { AnunciosClient } from "./AnunciosClient";
import type {
  EstadoAnuncio,
  TipoAnuncio,
  VisibilidadAnuncio,
} from "@/generated/prisma/client";
import {
  ESTADOS_ANUNCIO,
  TIPOS_ANUNCIO,
  VISIBILIDADES,
} from "@/lib/anuncios/labels";
import type { PermFlags, SortKey, SortDir, AnuncioStats } from "./types";

export const metadata = { title: "Anuncios · Admin" };
export const dynamic = "force-dynamic";

type SearchParams = {
  q?: string;
  estado?: string;
  tipo?: string;
  visibilidad?: string;
  page?: string;
  size?: string;
  sort?: string;
  dir?: string;
};

const SORTS: SortKey[] = [
  "titulo",
  "tipo",
  "visibilidad",
  "estado",
  "publicadoEn",
  "createdAt",
];

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const me = await requirePermission("anuncios.read");
  const sp = await searchParams;

  const estado =
    sp.estado && (ESTADOS_ANUNCIO as string[]).includes(sp.estado)
      ? (sp.estado as EstadoAnuncio)
      : undefined;
  const tipo =
    sp.tipo && (TIPOS_ANUNCIO as string[]).includes(sp.tipo)
      ? (sp.tipo as TipoAnuncio)
      : undefined;
  const visibilidad =
    sp.visibilidad && (VISIBILIDADES as string[]).includes(sp.visibilidad)
      ? (sp.visibilidad as VisibilidadAnuncio)
      : undefined;
  const page = sp.page ? Math.max(1, parseInt(sp.page, 10) || 1) : 1;
  const pageSize = sp.size ? parseInt(sp.size, 10) || 25 : 25;
  const sort: SortKey =
    sp.sort && (SORTS as string[]).includes(sp.sort)
      ? (sp.sort as SortKey)
      : "createdAt";
  const dir: SortDir = sp.dir === "asc" ? "asc" : "desc";

  const [res, statsRes] = await Promise.all([
    listAnuncios({ q: sp.q, estado, tipo, visibilidad, page, pageSize, sort, dir }),
    getAnuncioStats(),
  ]);
  if (!res.ok) throw new Error(res.error);

  const stats: AnuncioStats = statsRes.ok
    ? statsRes.data!
    : { total: 0, publicado: 0, borrador: 0, archivado: 0 };

  const perms: PermFlags = {
    canRead: me.permissions.has("anuncios.read"),
    canWrite: me.permissions.has("anuncios.write"),
    canDelete: me.permissions.has("anuncios.delete"),
  };

  return (
    <AnunciosClient
      initial={res.data!}
      stats={stats}
      perms={perms}
      filters={{ q: sp.q ?? "", estado, tipo, visibilidad }}
    />
  );
}
