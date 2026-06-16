import type {
  UbicacionBien,
  EstadoBien,
  TipoMovBien,
} from "@/generated/prisma/client";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | {
      ok: false;
      error: string;
      fieldErrors?: Partial<Record<string, string>>;
    };

export type BienRow = {
  id: string;
  codigo: string;
  nombre: string;
  ubicacion: UbicacionBien;
  unidad: string;
  marcaModelo: string | null;
  cantidad: number;
  estado: EstadoBien;
  observaciones: string | null;
};

export type MovRow = {
  id: string;
  tipo: TipoMovBien;
  cantidad: number;
  cantidadAnterior: number;
  cantidadNueva: number;
  motivo: string | null;
  byUser: string | null;
  createdAt: string;
};

export type BienDetail = BienRow & {
  observaciones: string | null;
  createdAt: string;
  updatedAt: string;
  movimientos: MovRow[];
};

export type CreateBienInput = {
  nombre: string;
  ubicacion: UbicacionBien;
  unidad?: string;
  marcaModelo?: string | null;
  cantidad?: number;
  estado?: EstadoBien;
  observaciones?: string;
};

export type UpdateBienPatch = Partial<CreateBienInput>;

export type MovimientoInput = {
  bienId: string;
  tipo: TipoMovBien;
  cantidad: number;
  motivo?: string;
};

export type SortKey = "codigo" | "nombre" | "cantidad" | "estado" | "ubicacion";
export type SortDir = "asc" | "desc";

export type ListBienesParams = {
  q?: string;
  ubicacion?: UbicacionBien;
  estado?: EstadoBien;
  page?: number;
  pageSize?: number;
  sort?: SortKey;
  dir?: SortDir;
};

export type ListBienesResult = {
  items: BienRow[];
  total: number;
  page: number;
  pageSize: number;
  sort: SortKey;
  dir: SortDir;
};

export type BienStats = {
  total: number; // nº de bienes (filas)
  unidades: number; // suma de cantidades
  oficina: number;
  almacen: number;
  alerta: number; // bienes en mal estado / rotos / dados de baja
};

export type PermFlags = {
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
  canMove: boolean;
};
