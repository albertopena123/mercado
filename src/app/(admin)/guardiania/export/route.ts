import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { toNumber } from "@/lib/money";
import { buildStyledXlsx, type XlsxColumn, type XlsxValue } from "@/lib/xlsx";
import { searchKeyAnd } from "@/lib/socios/normalize";
import { listDeudas } from "../actions";

export const dynamic = "force-dynamic";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function fechaRange(desde?: string | null, hasta?: string | null): Prisma.DateTimeFilter | undefined {
  const f: Prisma.DateTimeFilter = {};
  if (desde && ISO_DATE.test(desde)) f.gte = new Date(`${desde}T00:00:00.000Z`);
  if (hasta && ISO_DATE.test(hasta)) f.lte = new Date(`${hasta}T23:59:59.999Z`);
  return f.gte || f.lte ? f : undefined;
}

export async function GET(req: Request) {
  await requirePermission("guardiania.read");
  const sp = new URL(req.url).searchParams;
  const tipo = sp.get("tipo") === "deudas" ? "deudas" : "pagos";

  if (tipo === "deudas") {
    const soloMorosos = sp.get("morosos") !== "0";
    const res = await listDeudas(soloMorosos);
    if (!res.ok) return new NextResponse(res.error, { status: 400 });
    const columns: XlsxColumn[] = [
      { header: "Puesto", type: "text", width: 12 },
      { header: "Socio", type: "text", width: 34 },
      { header: "Tarifa", type: "money", width: 12 },
      { header: "Desde", type: "text", width: 10 },
      { header: "Meses esperados", type: "number", width: 14, align: "right" },
      { header: "Meses cubiertos", type: "number", width: 14, align: "right" },
      { header: "Meses debidos", type: "number", width: 14, align: "right" },
      { header: "Cobrado", type: "money", width: 14 },
      { header: "Deuda", type: "money", width: 14 },
    ];
    const rows: XlsxValue[][] = res.data!.items.map((d) => [
      d.puestoCodigo, d.socioNombre, d.tarifaMensual, d.inicioPeriodo,
      d.mesesEsperados, d.mesesCubiertos, d.mesesDebidos, d.cobradoTotal, d.deuda,
    ]);
    const buffer = buildStyledXlsx({
      sheetName: "Deudas guardianía",
      title: "Guardianía · Morosidad por puesto",
      subtitle: soloMorosos ? "Solo puestos morosos" : "Todas las cuentas",
      meta: [`Deuda estimada: S/ ${res.data!.deudaTotal.toLocaleString("es-PE")}`, `Morosos: ${res.data!.morososCount} de ${res.data!.cuentas}`],
      columns,
      rows,
    });
    return xlsxResponse(buffer, "guardiania-deudas.xlsx");
  }

  // pagos
  const where: Prisma.GuardianiaPagoWhereInput = {};
  const and = searchKeyAnd(sp.get("q"));
  if (and.length) where.AND = and;
  const periodo = sp.get("periodo");
  if (periodo && ISO_MONTH.test(periodo)) where.periodo = periodo;
  const bloque = sp.get("bloque");
  if (bloque) where.bloque = bloque;
  const fecha = fechaRange(sp.get("desde"), sp.get("hasta"));
  if (fecha) where.fecha = fecha;

  const pagos = await prisma.guardianiaPago.findMany({
    where,
    orderBy: [{ fecha: "desc" }, { nroRecibo: "desc" }],
    take: 20000,
  });
  const columns: XlsxColumn[] = [
    { header: "Fecha cobro", type: "date", width: 12 },
    { header: "N° Recibo", type: "text", width: 10 },
    { header: "Mes cubierto", type: "text", width: 12 },
    { header: "Bloque", type: "text", width: 8 },
    { header: "Puesto", type: "number", width: 8, align: "right" },
    { header: "Socio", type: "text", width: 34 },
    { header: "N° Padrón", type: "number", width: 10, align: "right" },
    { header: "Método", type: "text", width: 12 },
    { header: "Importe", type: "money", width: 12 },
  ];
  const rows: XlsxValue[][] = pagos.map((p) => [
    p.fecha, p.nroRecibo, p.periodo, p.bloque, p.numeroPuesto, p.socioNombre,
    p.numeroPadron, p.metodoPago, toNumber(p.importe),
  ]);
  const suma = pagos.reduce((s, p) => s + toNumber(p.importe), 0);
  const buffer = buildStyledXlsx({
    sheetName: "Pagos guardianía",
    title: "Guardianía · Pagos / recibos",
    subtitle: periodo ? `Mes cubierto ${periodo}` : "Histórico de ingresos por seguridad",
    meta: [`${pagos.length} pagos`, `Suma: S/ ${suma.toLocaleString("es-PE")}`],
    columns,
    rows,
  });
  return xlsxResponse(buffer, "guardiania-pagos.xlsx");
}

function xlsxResponse(buffer: Buffer, filename: string) {
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
