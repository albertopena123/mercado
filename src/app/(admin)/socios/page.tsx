import { requirePermission } from "@/lib/auth/server";
import { listSocios, getSocioStats } from "./actions";
import { SociosClient } from "./SociosClient";
import type { EstadoSocio, TipoDocumento } from "@/generated/prisma/client";
import type { PermFlags, SortKey, SortDir, SocioStats } from "./types";

export const metadata = { title: "Padrón de socios · Admin" };
export const dynamic = "force-dynamic";

type SearchParams = {
  q?: string;
  estado?: string;
  tipoDocumento?: string;
  page?: string;
  size?: string;
  sort?: string;
  dir?: string;
};

const ESTADOS: EstadoSocio[] = ["activo", "suspendido", "retirado", "fallecido"];
const TIPOS: TipoDocumento[] = ["DNI", "CE", "PASAPORTE", "RUC"];
const SORTS: SortKey[] = ["codigo", "documento", "nombre", "ingreso", "estado"];

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const me = await requirePermission("socios.read");
  const sp = await searchParams;

  const estado =
    sp.estado && (ESTADOS as string[]).includes(sp.estado)
      ? (sp.estado as EstadoSocio)
      : undefined;
  const tipoDocumento =
    sp.tipoDocumento && (TIPOS as string[]).includes(sp.tipoDocumento)
      ? (sp.tipoDocumento as TipoDocumento)
      : undefined;
  const page = sp.page ? Math.max(1, parseInt(sp.page, 10) || 1) : 1;
  const pageSize = sp.size ? parseInt(sp.size, 10) || 25 : 25;
  const sort: SortKey =
    sp.sort && (SORTS as string[]).includes(sp.sort)
      ? (sp.sort as SortKey)
      : "nombre";
  const dir: SortDir = sp.dir === "desc" ? "desc" : "asc";

  const [res, statsRes] = await Promise.all([
    listSocios({ q: sp.q, estado, tipoDocumento, page, pageSize, sort, dir }),
    getSocioStats(),
  ]);
  if (!res.ok) throw new Error(res.error);

  const stats: SocioStats = statsRes.ok
    ? statsRes.data!
    : { total: 0, activo: 0, suspendido: 0, retirado: 0, fallecido: 0 };

  const perms: PermFlags = {
    canRead: me.permissions.has("socios.read"),
    canWrite: me.permissions.has("socios.write"),
    canDelete: me.permissions.has("socios.delete"),
    canChangeState: me.permissions.has("socios.change-state"),
  };

  return (
    <SociosClient
      initial={res.data!}
      stats={stats}
      perms={perms}
      filters={{ q: sp.q ?? "", estado, tipoDocumento }}
    />
  );
}
