import type {
  TipoMovimiento,
  CategoriaMovimiento,
  TipoComprobante,
} from "@/generated/prisma/client";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | {
      ok: false;
      error: string;
      fieldErrors?: Partial<Record<string, string>>;
    };

export type MovimientoRow = {
  id: string;
  tipo: TipoMovimiento;
  categoria: CategoriaMovimiento;
  monto: number;
  fecha: string;
  concepto: string;
  metodoPago: string | null;
  comprobanteTipo: TipoComprobante;
  comprobanteUrl: string | null;
  socio: { id: string; nombre: string } | null;
};

export type MovimientoDetail = MovimientoRow & {
  comprobanteNumero: string | null;
  origen: string;
  registradoPor: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateMovimientoInput = {
  tipo: TipoMovimiento;
  categoria: CategoriaMovimiento;
  monto: number;
  fecha?: string;
  concepto: string;
  metodoPago?: string;
  socioId?: string | null;
  comprobanteTipo?: TipoComprobante;
  comprobanteNumero?: string;
};

export type UpdateMovimientoPatch = Partial<CreateMovimientoInput>;

export type SortKey = "fecha" | "monto" | "categoria" | "tipo";
export type SortDir = "asc" | "desc";

export type ListMovimientosParams = {
  q?: string;
  tipo?: TipoMovimiento;
  categoria?: CategoriaMovimiento;
  desde?: string;
  hasta?: string;
  page?: number;
  pageSize?: number;
  sort?: SortKey;
  dir?: SortDir;
};

export type ListMovimientosResult = {
  items: MovimientoRow[];
  total: number;
  page: number;
  pageSize: number;
  sort: SortKey;
  dir: SortDir;
};

export type CajaStats = {
  ingresos: number;
  egresos: number;
  balance: number;
  porCategoria: {
    categoria: CategoriaMovimiento;
    tipo: TipoMovimiento;
    total: number;
  }[];
};

export type PermFlags = {
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
};
