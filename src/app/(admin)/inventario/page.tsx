import { requirePermission } from "@/lib/auth/server";
import { listBienes, getBienStats } from "./actions";
import { InventarioClient } from "./InventarioClient";
import { UBICACIONES, ESTADOS } from "./labels";
import type { UbicacionBien, EstadoBien } from "@/generated/prisma/client";
import type { SortKey, SortDir, BienStats } from "./types";
import "./inventario.css";

export const metadata = { title: "Inventario · Admin" };
export const dynamic = "force-dynamic";

type SearchParams = {
  q?: string;
  ubicacion?: string;
  estado?: string;
  page?: string;
  size?: string;
  sort?: string;
  dir?: string;
};

const SORTS: SortKey[] = ["codigo", "nombre", "cantidad", "estado", "ubicacion"];

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const me = await requirePermission("inventario.read");
  const sp = await searchParams;

  const ubicacion =
    sp.ubicacion && (UBICACIONES as string[]).includes(sp.ubicacion)
      ? (sp.ubicacion as UbicacionBien)
      : undefined;
  const estado =
    sp.estado && (ESTADOS as string[]).includes(sp.estado)
      ? (sp.estado as EstadoBien)
      : undefined;
  const page = sp.page ? Math.max(1, parseInt(sp.page, 10) || 1) : 1;
  const pageSize = sp.size ? parseInt(sp.size, 10) || 25 : 25;
  const sort: SortKey =
    sp.sort && (SORTS as string[]).includes(sp.sort)
      ? (sp.sort as SortKey)
      : "codigo";
  const dir: SortDir = sp.dir === "desc" ? "desc" : "asc";

  const [res, statsRes] = await Promise.all([
    listBienes({ q: sp.q, ubicacion, estado, page, pageSize, sort, dir }),
    getBienStats(),
  ]);
  if (!res.ok) throw new Error(res.error);

  const stats: BienStats = statsRes.ok
    ? statsRes.data!
    : { total: 0, unidades: 0, oficina: 0, almacen: 0, alerta: 0 };

  const perms = {
    canRead: me.permissions.has("inventario.read"),
    canWrite: me.permissions.has("inventario.write"),
    canDelete: me.permissions.has("inventario.delete"),
    canMove: me.permissions.has("inventario.move"),
  };

  return (
    <InventarioClient
      initial={res.data!}
      stats={stats}
      perms={perms}
      filters={{ q: sp.q ?? "", ubicacion, estado }}
    />
  );
}
