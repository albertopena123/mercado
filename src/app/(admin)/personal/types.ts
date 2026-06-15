import type {
  TipoDocumento,
  CargoEmpleado,
  EstadoEmpleado,
} from "@/generated/prisma/client";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | {
      ok: false;
      error: string;
      fieldErrors?: Partial<Record<string, string>>;
    };

export type EmpleadoRow = {
  id: string;
  codigo: string;
  tipoDocumento: TipoDocumento;
  numeroDocumento: string;
  apellidoPaterno: string;
  apellidoMaterno: string | null;
  nombres: string;
  cargo: CargoEmpleado;
  cargoDetalle: string | null;
  estado: EstadoEmpleado;
  fechaIngreso: string;
  fotoUrl: string | null;
};

export type EmpleadoAdjuntoRow = {
  id: string;
  tipo: string;
  url: string;
  mimeType: string;
  sizeBytes: number | null;
  createdAt: string;
};

export type EmpleadoDetail = EmpleadoRow & {
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  fechaCese: string | null;
  salario: number | null;
  observaciones: string | null;
  createdAt: string;
  updatedAt: string;
  adjuntos: EmpleadoAdjuntoRow[];
};

export type CreateEmpleadoInput = {
  tipoDocumento: TipoDocumento;
  numeroDocumento: string;
  apellidoPaterno: string;
  apellidoMaterno?: string;
  nombres: string;
  cargo: CargoEmpleado;
  cargoDetalle?: string;
  telefono?: string;
  email?: string;
  direccion?: string;
  fechaIngreso: string;
  salario?: number | null;
  observaciones?: string;
};

export type UpdateEmpleadoPatch = Partial<CreateEmpleadoInput>;

export type SortKey = "codigo" | "nombre" | "cargo" | "ingreso" | "estado";
export type SortDir = "asc" | "desc";

export type ListEmpleadosParams = {
  q?: string;
  estado?: EstadoEmpleado;
  cargo?: CargoEmpleado;
  page?: number;
  pageSize?: number;
  sort?: SortKey;
  dir?: SortDir;
};

export type ListEmpleadosResult = {
  items: EmpleadoRow[];
  total: number;
  page: number;
  pageSize: number;
  sort: SortKey;
  dir: SortDir;
};

export type EmpleadoStats = {
  total: number;
  activo: number;
  suspendido: number;
  inactivo: number;
};

export type PermFlags = {
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
};
