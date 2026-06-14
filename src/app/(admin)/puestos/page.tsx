import { requirePermission } from "@/lib/auth/server";
import { listPuestos, getPuestoStats } from "./actions";
import { PuestosClient } from "./PuestosClient";
import type { EstadoPuesto } from "@/generated/prisma/client";
import type { PermFlags, SortKey, SortDir, PuestoStats } from "./types";

export const metadata = { title: "Puestos · Admin" };
export const dynamic = "force-dynamic";

type SearchParams = {
  q?: string;
  estado?: string;
  etapa?: string;
  bloque?: string;
  page?: string;
  size?: string;
  sort?: string;
  dir?: string;
};

const ESTADOS: EstadoPuesto[] = [
  "activo",
  "vacio",
  "clausurado",
  "construccion",
];
const SORTS: SortKey[] = ["codigo", "bloque", "numero", "giro", "estado"];
const BLOQUES = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M"];

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const me = await requirePermission("puestos.read");
  const sp = await searchParams;

  const estado =
    sp.estado && (ESTADOS as string[]).includes(sp.estado)
      ? (sp.estado as EstadoPuesto)
      : undefined;
  const etapa = sp.etapa === "1" || sp.etapa === "2" ? Number(sp.etapa) : undefined;
  const bloque =
    sp.bloque && BLOQUES.includes(sp.bloque.toUpperCase())
      ? sp.bloque.toUpperCase()
      : undefined;
  const page = sp.page ? Math.max(1, parseInt(sp.page, 10) || 1) : 1;
  const pageSize = sp.size ? parseInt(sp.size, 10) || 25 : 25;
  const sort: SortKey =
    sp.sort && (SORTS as string[]).includes(sp.sort)
      ? (sp.sort as SortKey)
      : "codigo";
  const dir: SortDir = sp.dir === "desc" ? "desc" : "asc";

  const [res, statsRes] = await Promise.all([
    listPuestos({ q: sp.q, estado, etapa, bloque, page, pageSize, sort, dir }),
    getPuestoStats(),
  ]);
  if (!res.ok) throw new Error(res.error);

  const stats: PuestoStats = statsRes.ok
    ? statsRes.data!
    : { total: 0, activo: 0, vacio: 0, clausurado: 0, construccion: 0 };

  const perms: PermFlags = {
    canRead: me.permissions.has("puestos.read"),
    canWrite: me.permissions.has("puestos.write"),
    canDelete: me.permissions.has("puestos.delete"),
    canAssign: me.permissions.has("puestos.assign"),
  };

  return (
    <PuestosClient
      initial={res.data!}
      stats={stats}
      perms={perms}
      filters={{ q: sp.q ?? "", estado, etapa, bloque }}
    />
  );
}
