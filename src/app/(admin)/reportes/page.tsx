import { requirePermission } from "@/lib/auth/server";
import {
  loadFinanciero,
  loadCobranzas,
  loadPadron,
  loadPuestos,
  loadAsistencia,
} from "./report-data";
import { ReportesClient } from "./ReportesClient";
import { REPORT_TABS, type ReportTab, type ReportData } from "./types";

export const metadata = { title: "Reportes · Admin" };
export const dynamic = "force-dynamic";

type SearchParams = {
  tab?: string;
  desde?: string;
  hasta?: string;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requirePermission("reportes.read");
  const sp = await searchParams;

  const tab: ReportTab = (REPORT_TABS as string[]).includes(sp.tab ?? "")
    ? (sp.tab as ReportTab)
    : "financiero";
  const desde = sp.desde && ISO_DATE.test(sp.desde) ? sp.desde : undefined;
  const hasta = sp.hasta && ISO_DATE.test(sp.hasta) ? sp.hasta : undefined;
  const filters = { desde, hasta };

  let report: ReportData;
  switch (tab) {
    case "cobranzas":
      report = { tab, data: await loadCobranzas() };
      break;
    case "padron":
      report = { tab, data: await loadPadron() };
      break;
    case "puestos":
      report = { tab, data: await loadPuestos() };
      break;
    case "asistencia":
      report = { tab, data: await loadAsistencia() };
      break;
    case "financiero":
    default:
      report = { tab: "financiero", data: await loadFinanciero(filters) };
      break;
  }

  return (
    <ReportesClient
      report={report}
      filters={{ desde: desde ?? "", hasta: hasta ?? "" }}
    />
  );
}
