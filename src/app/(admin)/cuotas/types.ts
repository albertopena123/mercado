import type { EstadoCuota } from "@/generated/prisma/client";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | {
      ok: false;
      error: string;
      fieldErrors?: Partial<Record<string, string>>;
    };

export type CuotaRow = {
  id: string;
  socioId: string;
  socioNombre: string;
  socioCodigo: string;
  periodo: string;
  concepto: string;
  monto: number;
  vencimiento: string | null;
  estado: EstadoCuota;
  pagadoEn: string | null;
  pagadoMonto: number | null;
  metodoPago: string | null;
};

export type ListCuotasParams = {
  q?: string;
  estado?: EstadoCuota;
  periodo?: string;
  page?: number;
  pageSize?: number;
};

export type ListCuotasResult = {
  items: CuotaRow[];
  total: number;
  page: number;
  pageSize: number;
};

export type CuotaStats = {
  pendienteMonto: number; // S/ por cobrar
  pendienteCount: number;
  recaudadoMonto: number; // S/ pagado histórico
  sociosConDeuda: number;
};

export type SocioCuotas = {
  deuda: number;
  saldoAFavor: number;
  canPay: boolean;
  cuotas: CuotaRow[];
};

export type ComprobanteRef = {
  id: string;
  folio: string;
  codigo: string;
};

export type PagoPorMontoResult = {
  pagadas: number;
  saldoAFavor: number;
  montoAplicado: number;
  comprobante: ComprobanteRef | null;
  movimientoCajaId: string | null;
};

export type GenerarCuotasInput = {
  periodo: string; // "2026-05"
  monto: number;
  concepto?: string;
  vencimiento?: string;
};

export type RegistrarPagoInput = {
  monto?: number;
  metodoPago?: string;
  fecha?: string;
  nroOperacion?: string;
};

export type PermFlags = {
  canRead: boolean;
  canWrite: boolean;
  canPay: boolean;
};
