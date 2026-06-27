import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/server";
import { buildReportSheet } from "../report-data";
import { REPORT_TABS, type ReportTab } from "../types";

export const dynamic = "force-dynamic";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Descarga del reporte como .xlsx. Un Route Handler GET que devuelve el archivo
// con Content-Disposition: attachment es la forma nativa y robusta de descargar
// en el navegador (sin base64/Blob ni server actions): el navegador lo guarda
// directamente como Excel.
export async function GET(req: Request) {
  await requirePermission("reportes.read");

  const sp = new URL(req.url).searchParams;
  const tabRaw = sp.get("tab") ?? "financiero";
  const tab: ReportTab = (REPORT_TABS as string[]).includes(tabRaw)
    ? (tabRaw as ReportTab)
    : "financiero";

  const desdeRaw = sp.get("desde");
  const hastaRaw = sp.get("hasta");
  const filters = {
    desde: desdeRaw && ISO_DATE.test(desdeRaw) ? desdeRaw : undefined,
    hasta: hastaRaw && ISO_DATE.test(hastaRaw) ? hastaRaw : undefined,
  };

  const { filename, buffer } = await buildReportSheet(tab, filters);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
