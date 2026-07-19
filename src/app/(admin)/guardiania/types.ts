import type { GuardianiaOrigen } from "@/generated/prisma/client";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string; fieldErrors?: Partial<Record<string, string>> };

// Una línea de pago de guardianía (recibo · mes cubierto · importe).
export type PagoRow = {
  id: string;
  fecha: string; // "YYYY-MM-DD" (calendario)
  nroRecibo: string | null;
  periodo: string; // mes cubierto "YYYY-MM"
  mesEtiqueta: string | null;
  importe: number;
  socioId: string | null;
  socioNombre: string;
  numeroPadron: number | null;
  puestoId: string | null;
  bloque: string | null;
  numeroPuesto: number | null;
  parcela: string | null;
  metodoPago: string | null;
  origen: GuardianiaOrigen;
  observacion: string | null;
};

export type ListPagosParams = {
  q?: string;
  periodo?: string; // filtra por mes cubierto
  desde?: string; // rango por fecha de cobro
  hasta?: string;
  bloque?: string;
  page?: number;
  pageSize?: number;
};

export type ListPagosResult = {
  items: PagoRow[];
  total: number;
  page: number;
  pageSize: number;
  sumaFiltrada: number; // suma de importe de TODO el filtro (no solo la página)
};

// Ingreso agregado por mes (para la pestaña Ingresos).
export type IngresoMes = {
  mes: string; // "YYYY-MM"
  monto: number;
  count: number;
};

export type GuardianiaStats = {
  totalCobrado: number; // histórico completo
  cobrado12m: number; // últimos 12 meses
  nRecibos: number; // recibos distintos
  nPagos: number;
  porMesCobro: IngresoMes[]; // por fecha de cobro
  porMesCubierto: IngresoMes[]; // por mes cubierto (accrual)
};

// Fila de morosidad por puesto (padrón oficial).
export type DeudaRow = {
  cuentaId: string;
  puestoId: string;
  puestoCodigo: string;
  bloque: string;
  numero: number;
  socioId: string | null;
  socioNombre: string;
  numeroPadron: number | null;
  tarifaMensual: number;
  inicioPeriodo: string;
  mesesEsperados: number;
  mesesCubiertos: number;
  mesesDebidos: number;
  deuda: number; // mesesDebidos × tarifa
  cobradoTotal: number;
  activo: boolean;
};

export type DeudaResult = {
  items: DeudaRow[];
  deudaTotal: number;
  morososCount: number;
  cuentas: number;
};

export type RegistrarPagoInput = {
  fecha: string; // "YYYY-MM-DD"
  periodo: string; // "YYYY-MM"
  importe: number;
  nroRecibo?: string;
  puestoId?: string;
  socioId?: string;
  metodoPago?: string;
  responsable?: string;
  observacion?: string;
};

// Resumen de la generación de cargos (Cuota) por socio a partir de la deuda de
// guardianía. En modo preview `creadas` es 0 (solo se cuenta lo que se crearía).
export type CargosResumen = {
  commit: boolean;
  cuentas: number; // cuentas activas con socio consideradas
  socios: number; // socios distintos afectados
  mesesPagados: number; // cargos que quedarían/quedaron como pagada
  mesesPendientes: number; // cargos que quedarían/quedaron como pendiente
  cuotasNuevas: number; // filas que faltan (a crear)
  cuotasExistentes: number; // filas que ya existían (se omiten)
  creadas: number; // filas efectivamente insertadas (commit)
  totalPendiente: number; // S/ de las cuotas pendientes nuevas
  cuentasSinSocio: number; // cuentas activas sin socio (omitidas)
  hasta: string; // "YYYY-MM" tope del rango
};

// Puesto en el selector al registrar un pago (mínimo).
export type PuestoPick = {
  id: string;
  codigo: string;
  bloque: string;
  numero: number;
  socioId: string | null;
  socioNombre: string;
  tarifa: number | null;
};

export type PermFlags = {
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
};
