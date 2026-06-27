import type {
  TipoMovimiento,
  CategoriaMovimiento,
  EstadoSocio,
  EstadoPuesto,
  EstadoAsamblea,
} from "@/generated/prisma/client";

// Resultado uniforme de las server actions (mismo contrato que el resto del
// panel: { ok, data } | { ok:false, error }).
export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export type ReportTab =
  | "financiero"
  | "cobranzas"
  | "padron"
  | "puestos"
  | "asistencia";

export const REPORT_TABS: ReportTab[] = [
  "financiero",
  "cobranzas",
  "padron",
  "puestos",
  "asistencia",
];

// Pestañas que admiten filtro por rango de fechas (las de estado actual no).
export const TABS_CON_FECHA: ReportTab[] = ["financiero"];

export type DateFilters = { desde?: string; hasta?: string };

/* ─────────────── Financiero (Caja) ─────────────── */

export type FinancieroReport = {
  ingresos: number;
  egresos: number;
  balance: number;
  totalMovimientos: number;
  porCategoria: {
    categoria: CategoriaMovimiento;
    tipo: TipoMovimiento;
    total: number;
  }[];
  porMes: {
    mes: string; // "2026-06"
    ingresos: number;
    egresos: number;
    balance: number;
  }[];
};

/* ─────────────── Cobranzas (Cuotas / deuda) ─────────────── */

export type DeudorRow = {
  socioId: string;
  codigo: string;
  nombre: string;
  documento: string;
  cuotas: number;
  total: number;
};

export type CobranzasReport = {
  deudaPendiente: number;
  pendienteCount: number;
  sociosConDeuda: number;
  recaudado: number;
  recaudadoCount: number;
  porConcepto: { concepto: string; count: number; total: number }[];
  topDeudores: DeudorRow[];
  totalDeudores: number; // cuántos hay en total (la tabla muestra top N)
};

/* ─────────────── Padrón (Socios) ─────────────── */

export type DuplicadoSocio = {
  id: string;
  codigo: string;
  nombre: string;
  documento: string; // "—" si es SIN-DNI
  sinDni: boolean;
  estado: EstadoSocio;
  puestos: number;
};

export type DuplicadoGrupo = {
  key: string;
  nombre: string; // etiqueta legible del grupo
  socios: DuplicadoSocio[];
};

export type PadronReport = {
  total: number;
  porEstado: { estado: EstadoSocio; count: number }[];
  conDni: number;
  sinDni: number;
  porSexo: { sexo: string; count: number }[];
  altasPorAnio: { anio: string; count: number }[];
  duplicados: DuplicadoGrupo[];
};

/* ─────────────── Puestos (Ocupación) ─────────────── */

export type PuestosReport = {
  total: number;
  ocupados: number;
  vacios: number;
  porEstado: { estado: EstadoPuesto; count: number }[];
  porEtapa: { etapa: number; total: number; ocupados: number }[];
  porBloque: {
    etapa: number;
    bloque: string;
    total: number;
    ocupados: number;
    vacios: number;
  }[];
  porGiro: { giro: string; count: number }[];
  vaciosList: {
    codigo: string;
    etapa: number;
    bloque: string;
    giro: string | null;
  }[];
  totalVacios: number; // la lista muestra top N
};

/* ─────────────── Asistencia (Asambleas) ─────────────── */

export type AsambleaAsistencia = {
  id: string;
  titulo: string;
  fecha: string;
  estado: EstadoAsamblea;
  presente: number;
  ausente: number;
  tardanza: number;
  justificado: number;
  totalRegistrados: number;
  quorumMinimo: number | null;
  pctAsistencia: number | null; // null si la asamblea aún no está cerrada
};

export type AusenteRow = {
  socioId: string;
  codigo: string;
  nombre: string;
  ausencias: number;
};

export type AsistenciaReport = {
  asambleas: AsambleaAsistencia[];
  topAusentes: AusenteRow[];
};

/* ─────────────── Unión que viaja a la UI ─────────────── */

export type ReportData =
  | { tab: "financiero"; data: FinancieroReport }
  | { tab: "cobranzas"; data: CobranzasReport }
  | { tab: "padron"; data: PadronReport }
  | { tab: "puestos"; data: PuestosReport }
  | { tab: "asistencia"; data: AsistenciaReport };
