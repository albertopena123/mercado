import { requirePermission } from "@/lib/auth/server";
import { listPagos, getGuardianiaStats, listDeudas } from "./actions";
import { GuardianiaClient } from "./GuardianiaClient";
import type {
  PermFlags,
  GuardianiaStats,
  ListPagosResult,
  DeudaResult,
} from "./types";

export const metadata = { title: "Guardianía · Admin" };
export const dynamic = "force-dynamic";

type SearchParams = {
  tab?: string;
  q?: string;
  periodo?: string;
  desde?: string;
  hasta?: string;
  bloque?: string;
  morosos?: string;
  page?: string;
  size?: string;
};

const TABS = ["ingresos", "recibos", "deudas"] as const;
type Tab = (typeof TABS)[number];

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const me = await requirePermission("guardiania.read");
  const sp = await searchParams;

  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? "")
    ? (sp.tab as Tab)
    : "ingresos";
  const page = sp.page ? Math.max(1, parseInt(sp.page, 10) || 1) : 1;
  const pageSize = sp.size ? parseInt(sp.size, 10) || 25 : 25;
  const soloMorosos = sp.morosos !== "0"; // por defecto solo morosos

  const [pagosRes, statsRes, deudasRes] = await Promise.all([
    listPagos({
      q: sp.q,
      periodo: sp.periodo,
      desde: sp.desde,
      hasta: sp.hasta,
      bloque: sp.bloque,
      page,
      pageSize,
    }),
    getGuardianiaStats(),
    listDeudas(soloMorosos),
  ]);
  if (!pagosRes.ok) throw new Error(pagosRes.error);

  const stats: GuardianiaStats = statsRes.ok
    ? statsRes.data!
    : {
        totalCobrado: 0,
        cobrado12m: 0,
        nRecibos: 0,
        nPagos: 0,
        porMesCobro: [],
        porMesCubierto: [],
      };
  const deudas: DeudaResult = deudasRes.ok
    ? deudasRes.data!
    : { items: [], deudaTotal: 0, morososCount: 0, cuentas: 0 };

  const perms: PermFlags = {
    canRead: me.permissions.has("guardiania.read"),
    canWrite: me.permissions.has("guardiania.write"),
    canDelete: me.permissions.has("guardiania.delete"),
  };

  return (
    <GuardianiaClient
      tab={tab}
      pagos={pagosRes.data as ListPagosResult}
      stats={stats}
      deudas={deudas}
      perms={perms}
      filters={{
        q: sp.q ?? "",
        periodo: sp.periodo ?? "",
        desde: sp.desde ?? "",
        hasta: sp.hasta ?? "",
        bloque: sp.bloque ?? "",
        morosos: soloMorosos,
      }}
    />
  );
}
