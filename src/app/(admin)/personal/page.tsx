import { requirePermission } from "@/lib/auth/server";
import { listEmpleados, getEmpleadoStats } from "./actions";
import { PersonalClient } from "./PersonalClient";
import type { CargoEmpleado, EstadoEmpleado } from "@/generated/prisma/client";
import type { PermFlags, SortKey, SortDir, EmpleadoStats } from "./types";

export const metadata = { title: "Personal · Admin" };
export const dynamic = "force-dynamic";

type SearchParams = {
  q?: string;
  estado?: string;
  cargo?: string;
  page?: string;
  size?: string;
  sort?: string;
  dir?: string;
};

const ESTADOS: EstadoEmpleado[] = ["activo", "suspendido", "inactivo"];
const CARGOS: CargoEmpleado[] = [
  "seguridad",
  "secretaria",
  "limpieza",
  "bano",
  "administracion",
  "mantenimiento",
  "cobranza",
  "otro",
];
const SORTS: SortKey[] = ["codigo", "nombre", "cargo", "ingreso", "estado"];

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const me = await requirePermission("personal.read");
  const sp = await searchParams;

  const estado =
    sp.estado && (ESTADOS as string[]).includes(sp.estado)
      ? (sp.estado as EstadoEmpleado)
      : undefined;
  const cargo =
    sp.cargo && (CARGOS as string[]).includes(sp.cargo)
      ? (sp.cargo as CargoEmpleado)
      : undefined;
  const page = sp.page ? Math.max(1, parseInt(sp.page, 10) || 1) : 1;
  const pageSize = sp.size ? parseInt(sp.size, 10) || 25 : 25;
  const sort: SortKey =
    sp.sort && (SORTS as string[]).includes(sp.sort)
      ? (sp.sort as SortKey)
      : "nombre";
  const dir: SortDir = sp.dir === "desc" ? "desc" : "asc";

  const [res, statsRes] = await Promise.all([
    listEmpleados({ q: sp.q, estado, cargo, page, pageSize, sort, dir }),
    getEmpleadoStats(),
  ]);
  if (!res.ok) throw new Error(res.error);

  const stats: EmpleadoStats = statsRes.ok
    ? statsRes.data!
    : { total: 0, activo: 0, suspendido: 0, inactivo: 0 };

  const perms: PermFlags = {
    canRead: me.permissions.has("personal.read"),
    canWrite: me.permissions.has("personal.write"),
    canDelete: me.permissions.has("personal.delete"),
  };

  return (
    <PersonalClient
      initial={res.data!}
      stats={stats}
      perms={perms}
      filters={{ q: sp.q ?? "", estado, cargo }}
    />
  );
}
