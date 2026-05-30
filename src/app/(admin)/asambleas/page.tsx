import { requirePermission } from "@/lib/auth/server";
import { listAsambleas } from "./actions";
import { AsambleasClient } from "./AsambleasClient";
import type { EstadoAsamblea } from "@/generated/prisma/client";
import type { PermFlags } from "./types";

export const metadata = { title: "Asambleas · Admin" };
export const dynamic = "force-dynamic";

type SearchParams = {
  q?: string;
  estado?: string;
  page?: string;
  size?: string;
};

const ESTADOS: EstadoAsamblea[] = ["programada", "en_curso", "cerrada"];

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const me = await requirePermission("asambleas.read");
  const sp = await searchParams;
  const page = sp.page ? Math.max(1, parseInt(sp.page, 10) || 1) : 1;
  const pageSize = sp.size ? parseInt(sp.size, 10) || 25 : 25;
  const estado =
    sp.estado && (ESTADOS as string[]).includes(sp.estado)
      ? (sp.estado as EstadoAsamblea)
      : undefined;

  const res = await listAsambleas({ page, pageSize, q: sp.q, estado });
  if (!res.ok) throw new Error(res.error);

  const perms: PermFlags = {
    canRead: me.permissions.has("asambleas.read"),
    canWrite: me.permissions.has("asambleas.write"),
    canDelete: me.permissions.has("asambleas.delete"),
    canAttendance: me.permissions.has("asambleas.attendance"),
  };

  return (
    <AsambleasClient
      initial={res.data!}
      perms={perms}
      filters={{ q: sp.q ?? "", estado }}
    />
  );
}
