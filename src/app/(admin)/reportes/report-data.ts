import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/money";
import { normalizeToken } from "@/lib/socios/normalize";
import { esDocumentoPendiente } from "@/lib/socios/document";
import { buildXlsx } from "@/lib/xlsx";
import { fechaTS, hoyISOPeru } from "@/lib/fecha";
import type {
  DateFilters,
  ReportTab,
  FinancieroReport,
  CobranzasReport,
  PadronReport,
  PuestosReport,
  AsistenciaReport,
  DuplicadoGrupo,
  DuplicadoSocio,
  DeudorRow,
} from "./types";

// Capa de DATOS de los reportes (sin "use server"): la consumen tanto la página
// (Server Component) como el route handler de exportación. No se importa nunca
// desde un Client Component (import "server-only" lo garantiza).

const TOP_N = 50;

function socioNombre(s: {
  apellidoPaterno: string;
  apellidoMaterno: string | null;
  nombres: string;
}): string {
  return `${s.apellidoPaterno} ${s.apellidoMaterno ?? ""}, ${s.nombres}`
    .replace(/\s+,/, ",")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function docVisible(numeroDocumento: string): string {
  return esDocumentoPendiente(numeroDocumento) ? "—" : numeroDocumento;
}

// Rango de fechas (UTC, igual que se guarda `fecha` de caja).
function fechaRange(desde?: string, hasta?: string): Prisma.DateTimeFilter | undefined {
  const f: Prisma.DateTimeFilter = {};
  if (desde) {
    const d = new Date(`${desde}T00:00:00.000Z`);
    if (!isNaN(d.getTime())) f.gte = d;
  }
  if (hasta) {
    const h = new Date(`${hasta}T23:59:59.999Z`);
    if (!isNaN(h.getTime())) f.lte = h;
  }
  return f.gte || f.lte ? f : undefined;
}

/* ════════════════════════ Financiero (Caja) ════════════════════════ */

export async function loadFinanciero(filters: DateFilters): Promise<FinancieroReport> {
  const where: Prisma.MovimientoCajaWhereInput = {};
  const fecha = fechaRange(filters.desde, filters.hasta);
  if (fecha) where.fecha = fecha;

  const movs = await prisma.movimientoCaja.findMany({
    where,
    select: { fecha: true, tipo: true, categoria: true, monto: true },
  });

  let ingresos = 0;
  let egresos = 0;
  const catMap = new Map<
    string,
    { categoria: FinancieroReport["porCategoria"][number]["categoria"]; tipo: "ingreso" | "egreso"; total: number }
  >();
  const mesMap = new Map<string, { ingresos: number; egresos: number }>();

  for (const m of movs) {
    const monto = toNumber(m.monto);
    if (m.tipo === "ingreso") ingresos += monto;
    else egresos += monto;

    const ck = `${m.tipo}:${m.categoria}`;
    const cur = catMap.get(ck) ?? { categoria: m.categoria, tipo: m.tipo, total: 0 };
    cur.total += monto;
    catMap.set(ck, cur);

    const mes = m.fecha.toISOString().slice(0, 7);
    const mm = mesMap.get(mes) ?? { ingresos: 0, egresos: 0 };
    if (m.tipo === "ingreso") mm.ingresos += monto;
    else mm.egresos += monto;
    mesMap.set(mes, mm);
  }

  const round = (n: number) => Math.round(n * 100) / 100;

  const porCategoria = [...catMap.values()]
    .map((c) => ({ ...c, total: round(c.total) }))
    .sort((a, b) => b.total - a.total);

  const porMes = [...mesMap.entries()]
    .map(([mes, v]) => ({
      mes,
      ingresos: round(v.ingresos),
      egresos: round(v.egresos),
      balance: round(v.ingresos - v.egresos),
    }))
    .sort((a, b) => a.mes.localeCompare(b.mes));

  return {
    ingresos: round(ingresos),
    egresos: round(egresos),
    balance: round(ingresos - egresos),
    totalMovimientos: movs.length,
    porCategoria,
    porMes,
  };
}

/* ════════════════════════ Cobranzas (Cuotas) ════════════════════════ */

async function deudoresOrdenados(take?: number): Promise<DeudorRow[]> {
  const grupos = await prisma.cuota.groupBy({
    by: ["socioId"],
    where: { estado: "pendiente" },
    _sum: { monto: true },
    _count: { _all: true },
    orderBy: { _sum: { monto: "desc" } },
    take,
  });
  if (grupos.length === 0) return [];
  const socios = await prisma.socio.findMany({
    where: { id: { in: grupos.map((g) => g.socioId) } },
    select: {
      id: true,
      codigo: true,
      apellidoPaterno: true,
      apellidoMaterno: true,
      nombres: true,
      numeroDocumento: true,
    },
  });
  const byId = new Map(socios.map((s) => [s.id, s]));
  return grupos
    .map((g) => {
      const s = byId.get(g.socioId);
      return {
        socioId: g.socioId,
        codigo: s?.codigo ?? "—",
        nombre: s ? socioNombre(s) : "(socio no encontrado)",
        documento: s ? docVisible(s.numeroDocumento) : "—",
        cuotas: g._count._all,
        total: toNumber(g._sum.monto),
      };
    })
    .sort((a, b) => b.total - a.total);
}

export async function loadCobranzas(): Promise<CobranzasReport> {
  const [agg, distintos, pagadas, porConceptoRaw, topDeudores] = await Promise.all([
    prisma.cuota.aggregate({
      where: { estado: "pendiente" },
      _sum: { monto: true },
      _count: { _all: true },
    }),
    prisma.cuota.findMany({
      where: { estado: "pendiente" },
      distinct: ["socioId"],
      select: { socioId: true },
    }),
    prisma.cuota.findMany({
      where: { estado: "pagada" },
      select: { monto: true, pagadoMonto: true },
    }),
    prisma.cuota.groupBy({
      by: ["concepto"],
      where: { estado: "pendiente" },
      _sum: { monto: true },
      _count: { _all: true },
      orderBy: { _sum: { monto: "desc" } },
    }),
    deudoresOrdenados(TOP_N),
  ]);

  let recaudado = 0;
  for (const c of pagadas) recaudado += toNumber(c.pagadoMonto ?? c.monto);

  return {
    deudaPendiente: toNumber(agg._sum.monto),
    pendienteCount: agg._count._all,
    sociosConDeuda: distintos.length,
    recaudado: Math.round(recaudado * 100) / 100,
    recaudadoCount: pagadas.length,
    porConcepto: porConceptoRaw.map((g) => ({
      concepto: g.concepto,
      count: g._count._all,
      total: toNumber(g._sum.monto),
    })),
    topDeudores,
    totalDeudores: distintos.length,
  };
}

/* ════════════════════════ Padrón (Socios) ════════════════════════ */

const ESTADO_SOCIO_ORDEN = ["activo", "suspendido", "retirado", "fallecido"] as const;

export async function loadPadron(): Promise<PadronReport> {
  const socios = await prisma.socio.findMany({
    select: {
      id: true,
      codigo: true,
      estado: true,
      sexo: true,
      fechaIngreso: true,
      apellidoPaterno: true,
      apellidoMaterno: true,
      nombres: true,
      numeroDocumento: true,
      _count: { select: { asignacionesPuesto: true } },
    },
  });

  const estadoMap = new Map<string, number>();
  const sexoMap = new Map<string, number>();
  const anioMap = new Map<string, number>();
  let sinDni = 0;
  const dupMap = new Map<string, typeof socios>();

  for (const s of socios) {
    estadoMap.set(s.estado, (estadoMap.get(s.estado) ?? 0) + 1);

    const sx = s.sexo ?? "ND";
    sexoMap.set(sx, (sexoMap.get(sx) ?? 0) + 1);

    const anio = String(s.fechaIngreso.getUTCFullYear());
    anioMap.set(anio, (anioMap.get(anio) ?? 0) + 1);

    if (esDocumentoPendiente(s.numeroDocumento)) sinDni++;

    const primerNombre = s.nombres.trim().split(/\s+/)[0] ?? "";
    const key = [
      normalizeToken(s.apellidoPaterno),
      normalizeToken(s.apellidoMaterno ?? ""),
      normalizeToken(primerNombre),
    ].join("|");
    const arr = dupMap.get(key) ?? [];
    arr.push(s);
    dupMap.set(key, arr);
  }

  const sexoLabel = (k: string) =>
    k === "M" ? "Masculino" : k === "F" ? "Femenino" : "Sin especificar";

  const porEstado = ESTADO_SOCIO_ORDEN.filter((e) => estadoMap.has(e)).map((e) => ({
    estado: e,
    count: estadoMap.get(e)!,
  }));

  const porSexo = [...sexoMap.entries()]
    .map(([sexo, count]) => ({ sexo: sexoLabel(sexo), count }))
    .sort((a, b) => b.count - a.count);

  const altasPorAnio = [...anioMap.entries()]
    .map(([anio, count]) => ({ anio, count }))
    .sort((a, b) => a.anio.localeCompare(b.anio));

  const duplicados: DuplicadoGrupo[] = [...dupMap.values()]
    .filter((arr) => arr.length > 1)
    .map((arr) => {
      const first = arr[0];
      const socs: DuplicadoSocio[] = arr
        .map((s) => ({
          id: s.id,
          codigo: s.codigo,
          nombre: socioNombre(s),
          documento: docVisible(s.numeroDocumento),
          sinDni: esDocumentoPendiente(s.numeroDocumento),
          estado: s.estado,
          puestos: s._count.asignacionesPuesto,
        }))
        .sort((a, b) => a.codigo.localeCompare(b.codigo));
      return {
        key: `${first.apellidoPaterno}|${first.apellidoMaterno ?? ""}|${first.nombres}`,
        nombre: `${first.apellidoPaterno} ${first.apellidoMaterno ?? ""}`
          .replace(/\s{2,}/g, " ")
          .trim(),
        socios: socs,
      };
    })
    .sort((a, b) => b.socios.length - a.socios.length || a.nombre.localeCompare(b.nombre));

  return {
    total: socios.length,
    porEstado,
    conDni: socios.length - sinDni,
    sinDni,
    porSexo,
    altasPorAnio,
    duplicados,
  };
}

/* ════════════════════════ Puestos (Ocupación) ════════════════════════ */

const ESTADO_PUESTO_ORDEN = ["activo", "vacio", "clausurado", "construccion"] as const;

export async function loadPuestos(): Promise<PuestosReport> {
  const puestos = await prisma.puesto.findMany({
    select: { codigo: true, etapa: true, bloque: true, giro: true, estado: true },
    orderBy: [{ etapa: "asc" }, { bloque: "asc" }, { fila: "asc" }, { numero: "asc" }],
  });

  const estadoMap = new Map<string, number>();
  const etapaMap = new Map<number, { total: number; ocupados: number }>();
  const bloqueMap = new Map<
    string,
    { etapa: number; bloque: string; total: number; ocupados: number; vacios: number }
  >();
  const giroMap = new Map<string, number>();
  let ocupados = 0;
  let vacios = 0;
  const vaciosAll: PuestosReport["vaciosList"] = [];

  for (const p of puestos) {
    estadoMap.set(p.estado, (estadoMap.get(p.estado) ?? 0) + 1);
    const esOcupado = p.estado === "activo";
    const esVacio = p.estado === "vacio";
    if (esOcupado) ocupados++;
    if (esVacio) vacios++;

    const et = etapaMap.get(p.etapa) ?? { total: 0, ocupados: 0 };
    et.total++;
    if (esOcupado) et.ocupados++;
    etapaMap.set(p.etapa, et);

    const bk = `${p.etapa}-${p.bloque}`;
    const bl = bloqueMap.get(bk) ?? {
      etapa: p.etapa,
      bloque: p.bloque,
      total: 0,
      ocupados: 0,
      vacios: 0,
    };
    bl.total++;
    if (esOcupado) bl.ocupados++;
    if (esVacio) bl.vacios++;
    bloqueMap.set(bk, bl);

    const g = p.giro ?? "ND";
    giroMap.set(g, (giroMap.get(g) ?? 0) + 1);

    if (esVacio)
      vaciosAll.push({ codigo: p.codigo, etapa: p.etapa, bloque: p.bloque, giro: p.giro });
  }

  const porEstado = ESTADO_PUESTO_ORDEN.filter((e) => estadoMap.has(e)).map((e) => ({
    estado: e,
    count: estadoMap.get(e)!,
  }));

  const porEtapa = [...etapaMap.entries()]
    .map(([etapa, v]) => ({ etapa, total: v.total, ocupados: v.ocupados }))
    .sort((a, b) => a.etapa - b.etapa);

  const porBloque = [...bloqueMap.values()].sort(
    (a, b) => a.etapa - b.etapa || a.bloque.localeCompare(b.bloque),
  );

  const porGiro = [...giroMap.entries()]
    .map(([giro, count]) => ({ giro: giro === "ND" ? "Sin giro" : giro, count }))
    .sort((a, b) => b.count - a.count);

  return {
    total: puestos.length,
    ocupados,
    vacios,
    porEstado,
    porEtapa,
    porBloque,
    porGiro,
    vaciosList: vaciosAll.slice(0, TOP_N),
    totalVacios: vaciosAll.length,
  };
}

/* ════════════════════════ Asistencia (Asambleas) ════════════════════════ */

export async function loadAsistencia(): Promise<AsistenciaReport> {
  const [asambleas, grouped, ausentesRaw] = await Promise.all([
    prisma.asamblea.findMany({
      orderBy: { fecha: "desc" },
      select: { id: true, titulo: true, fecha: true, quorumMinimo: true, estado: true },
    }),
    prisma.asistencia.groupBy({
      by: ["asambleaId", "estado"],
      _count: { _all: true },
    }),
    // Solo cuentan las inasistencias de asambleas YA CERRADAS: al crear una
    // asamblea se siembran filas 'ausente' para todos los socios activos, así
    // que las 'programadas'/'en_curso' inflarían el ranking de ausentes.
    prisma.asistencia.groupBy({
      by: ["socioId"],
      where: { estado: "ausente", asamblea: { estado: "cerrada" } },
      _count: { _all: true },
    }),
  ]);

  const conteo = new Map<
    string,
    { presente: number; ausente: number; tardanza: number; justificado: number }
  >();
  for (const g of grouped) {
    const c =
      conteo.get(g.asambleaId) ?? { presente: 0, ausente: 0, tardanza: 0, justificado: 0 };
    c[g.estado] = g._count._all;
    conteo.set(g.asambleaId, c);
  }

  const asambleasOut = asambleas.map((a) => {
    const c = conteo.get(a.id) ?? { presente: 0, ausente: 0, tardanza: 0, justificado: 0 };
    const totalRegistrados = c.presente + c.ausente + c.tardanza + c.justificado;
    // Solo es un % real cuando la asamblea ya se cerró; para programadas/en
    // curso los conteos son nómina sembrada (ausente=todos), no asistencia real.
    const pct =
      a.estado !== "cerrada"
        ? null
        : totalRegistrados > 0
          ? Math.round(((c.presente + c.tardanza) / totalRegistrados) * 100)
          : 0;
    return {
      id: a.id,
      titulo: a.titulo,
      fecha: a.fecha.toISOString(),
      estado: a.estado,
      presente: c.presente,
      ausente: c.ausente,
      tardanza: c.tardanza,
      justificado: c.justificado,
      totalRegistrados,
      quorumMinimo: a.quorumMinimo,
      pctAsistencia: pct,
    };
  });

  const topRaw = [...ausentesRaw]
    .sort((a, b) => b._count._all - a._count._all)
    .slice(0, TOP_N);
  let topAusentes: AsistenciaReport["topAusentes"] = [];
  if (topRaw.length > 0) {
    const socios = await prisma.socio.findMany({
      where: { id: { in: topRaw.map((t) => t.socioId) } },
      select: {
        id: true,
        codigo: true,
        apellidoPaterno: true,
        apellidoMaterno: true,
        nombres: true,
      },
    });
    const byId = new Map(socios.map((s) => [s.id, s]));
    topAusentes = topRaw.map((t) => {
      const s = byId.get(t.socioId);
      return {
        socioId: t.socioId,
        codigo: s?.codigo ?? "—",
        nombre: s ? socioNombre(s) : "(socio no encontrado)",
        ausencias: t._count._all,
      };
    });
  }

  return { asambleas: asambleasOut, topAusentes };
}

/* ════════════════════════ Construcción del .xlsx ════════════════════════ */

type Cell = string | number | null | undefined;

function fmtMes(mes: string): string {
  const [y, m] = mes.split("-");
  const meses = [
    "Ene", "Feb", "Mar", "Abr", "May", "Jun",
    "Jul", "Ago", "Set", "Oct", "Nov", "Dic",
  ];
  const idx = parseInt(m, 10) - 1;
  return idx >= 0 && idx < 12 ? `${meses[idx]} ${y}` : mes;
}

const ESTADO_SOCIO_LABEL: Record<string, string> = {
  activo: "Activo",
  suspendido: "Suspendido",
  retirado: "Retirado",
  fallecido: "Fallecido",
};
const ESTADO_PUESTO_LABEL: Record<string, string> = {
  activo: "Ocupado",
  vacio: "Vacío",
  clausurado: "Clausurado",
  construccion: "En construcción",
};

const TAB_FILENAME: Record<ReportTab, string> = {
  financiero: "reporte-financiero",
  cobranzas: "reporte-cobranzas",
  padron: "reporte-padron-duplicados",
  puestos: "reporte-puestos",
  asistencia: "reporte-asistencia",
};

async function buildSheet(
  tab: ReportTab,
  filters: DateFilters,
): Promise<{ sheet: string; headers: string[]; rows: Cell[][]; widths?: number[] }> {
  switch (tab) {
    case "financiero": {
      const r = await loadFinanciero(filters);
      return {
        sheet: "Financiero por mes",
        headers: ["Mes", "Ingresos (S/)", "Egresos (S/)", "Balance (S/)"],
        rows: r.porMes.map((m) => [fmtMes(m.mes), m.ingresos, m.egresos, m.balance]),
        widths: [16, 16, 16, 16],
      };
    }
    case "cobranzas": {
      const deudores = await deudoresOrdenados(); // completo, sin tope
      return {
        sheet: "Deudores",
        headers: ["Código", "Socio", "Documento", "N° cuotas pendientes", "Deuda (S/)"],
        rows: deudores.map((d) => [d.codigo, d.nombre, d.documento, d.cuotas, d.total]),
        widths: [12, 34, 14, 18, 14],
      };
    }
    case "padron": {
      const r = await loadPadron();
      const rows: Cell[][] = [];
      for (const g of r.duplicados) {
        for (const s of g.socios) {
          rows.push([
            g.nombre,
            s.codigo,
            s.nombre,
            s.sinDni ? "SIN DNI" : s.documento,
            ESTADO_SOCIO_LABEL[s.estado] ?? s.estado,
            s.puestos,
          ]);
        }
      }
      return {
        sheet: "Posibles duplicados",
        headers: ["Grupo", "Código", "Socio", "Documento", "Estado", "Puestos"],
        rows,
        widths: [24, 12, 34, 14, 14, 10],
      };
    }
    case "puestos": {
      const puestos = await prisma.puesto.findMany({
        select: {
          codigo: true,
          etapa: true,
          bloque: true,
          giro: true,
          estado: true,
          tipo: true,
        },
        orderBy: [{ etapa: "asc" }, { bloque: "asc" }, { fila: "asc" }, { numero: "asc" }],
      });
      return {
        sheet: "Puestos",
        headers: ["Código", "Etapa", "Bloque", "Estado", "Giro", "Tipo"],
        rows: puestos.map((p) => [
          p.codigo,
          p.etapa,
          p.bloque,
          ESTADO_PUESTO_LABEL[p.estado] ?? p.estado,
          p.giro ?? "Sin giro",
          p.tipo,
        ]),
        widths: [12, 8, 8, 16, 16, 10],
      };
    }
    case "asistencia": {
      const r = await loadAsistencia();
      return {
        sheet: "Asistencia por asamblea",
        headers: [
          "Asamblea",
          "Fecha",
          "Presentes",
          "Tardanza",
          "Ausentes",
          "Justificados",
          "Registrados",
          "% Asistencia",
          "Quórum mín.",
        ],
        rows: r.asambleas.map((a) => [
          a.titulo,
          fechaTS(a.fecha),
          a.presente,
          a.tardanza,
          a.ausente,
          a.justificado,
          a.totalRegistrados,
          a.pctAsistencia ?? "",
          a.quorumMinimo ?? "",
        ]),
        widths: [34, 12, 11, 11, 11, 13, 12, 13, 12],
      };
    }
  }
}

export async function buildReportSheet(
  tab: ReportTab,
  filters: DateFilters,
): Promise<{ filename: string; buffer: Buffer; count: number }> {
  const { sheet, headers, rows, widths } = await buildSheet(tab, filters);
  const buffer = buildXlsx(sheet, headers, rows, widths);
  const stamp = hoyISOPeru();
  return { filename: `${TAB_FILENAME[tab]}-${stamp}.xlsx`, buffer, count: rows.length };
}
