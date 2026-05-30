import { requirePermission } from "@/lib/auth/server";
import { listCuotas, getCuotaStats } from "./actions";
import { CuotasClient } from "./CuotasClient";
import type { EstadoCuota } from "@/generated/prisma/client";
import type { PermFlags, CuotaStats } from "./types";

export const metadata = { title: "Cuotas · Admin" };
export const dynamic = "force-dynamic";

type SearchParams = {
  q?: string;
  estado?: string;
  periodo?: string;
  page?: string;
  size?: string;
};

const ESTADOS: EstadoCuota[] = ["pendiente", "pagada", "anulada"];

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const me = await requirePermission("cuotas.read");
  const sp = await searchParams;

  const estado =
    sp.estado && (ESTADOS as string[]).includes(sp.estado)
      ? (sp.estado as EstadoCuota)
      : undefined;
  const periodo = sp.periodo?.trim() || undefined;
  const page = sp.page ? Math.max(1, parseInt(sp.page, 10) || 1) : 1;
  const pageSize = sp.size ? parseInt(sp.size, 10) || 25 : 25;

  const [res, statsRes] = await Promise.all([
    listCuotas({ q: sp.q, estado, periodo, page, pageSize }),
    getCuotaStats(),
  ]);
  if (!res.ok) throw new Error(res.error);

  const stats: CuotaStats = statsRes.ok
    ? statsRes.data!
    : {
        pendienteMonto: 0,
        pendienteCount: 0,
        recaudadoMonto: 0,
        sociosConDeuda: 0,
      };

  const perms: PermFlags = {
    canRead: me.permissions.has("cuotas.read"),
    canWrite: me.permissions.has("cuotas.write"),
    canPay: me.permissions.has("cuotas.pay"),
  };

  return (
    <CuotasClient
      initial={res.data!}
      stats={stats}
      perms={perms}
      filters={{ q: sp.q ?? "", estado, periodo: periodo ?? "" }}
    />
  );
}
