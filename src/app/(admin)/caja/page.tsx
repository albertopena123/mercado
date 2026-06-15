import { requirePermission } from "@/lib/auth/server";
import { listMovimientos, getCajaStats } from "./actions";
import { CajaClient } from "./CajaClient";
import type {
  TipoMovimiento,
  CategoriaMovimiento,
} from "@/generated/prisma/client";
import { CATEGORIAS_INGRESO, CATEGORIAS_EGRESO } from "@/lib/caja/labels";
import type { PermFlags, SortKey, SortDir, CajaStats } from "./types";

export const metadata = { title: "Caja · Admin" };
export const dynamic = "force-dynamic";

type SearchParams = {
  q?: string;
  tipo?: string;
  categoria?: string;
  desde?: string;
  hasta?: string;
  page?: string;
  size?: string;
  sort?: string;
  dir?: string;
};

const SORTS: SortKey[] = ["fecha", "monto", "categoria", "tipo"];
const ALL_CATS = [...CATEGORIAS_INGRESO, ...CATEGORIAS_EGRESO];

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const me = await requirePermission("caja.read");
  const sp = await searchParams;

  const tipo: TipoMovimiento | undefined =
    sp.tipo === "ingreso" || sp.tipo === "egreso" ? sp.tipo : undefined;
  const categoria =
    sp.categoria && (ALL_CATS as string[]).includes(sp.categoria)
      ? (sp.categoria as CategoriaMovimiento)
      : undefined;
  const desde = sp.desde || undefined;
  const hasta = sp.hasta || undefined;
  const page = sp.page ? Math.max(1, parseInt(sp.page, 10) || 1) : 1;
  const pageSize = sp.size ? parseInt(sp.size, 10) || 25 : 25;
  const sort: SortKey =
    sp.sort && (SORTS as string[]).includes(sp.sort)
      ? (sp.sort as SortKey)
      : "fecha";
  const dir: SortDir = sp.dir === "asc" ? "asc" : "desc";

  const [res, statsRes] = await Promise.all([
    listMovimientos({ q: sp.q, tipo, categoria, desde, hasta, page, pageSize, sort, dir }),
    getCajaStats({ desde, hasta }),
  ]);
  if (!res.ok) throw new Error(res.error);

  const stats: CajaStats = statsRes.ok
    ? statsRes.data!
    : { ingresos: 0, egresos: 0, balance: 0, porCategoria: [] };

  const perms: PermFlags = {
    canRead: me.permissions.has("caja.read"),
    canWrite: me.permissions.has("caja.write"),
    canDelete: me.permissions.has("caja.delete"),
  };

  return (
    <CajaClient
      initial={res.data!}
      stats={stats}
      perms={perms}
      filters={{
        q: sp.q ?? "",
        tipo,
        categoria,
        desde: desde ?? "",
        hasta: hasta ?? "",
      }}
    />
  );
}
