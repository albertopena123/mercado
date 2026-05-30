import type {
  EstadoSocio,
  TipoDocumento,
  Sexo,
} from "@/generated/prisma/client";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | {
      ok: false;
      error: string;
      fieldErrors?: Partial<Record<string, string>>;
    };

export type SocioRow = {
  id: string;
  codigo: string;
  tipoDocumento: TipoDocumento;
  numeroDocumento: string;
  apellidoPaterno: string;
  apellidoMaterno: string | null;
  nombres: string;
  estado: EstadoSocio;
  fechaIngreso: string;
  fotoUrl: string | null;
};

export type SocioDetail = SocioRow & {
  deuda: number;
  fechaNacimiento: string | null;
  sexo: Sexo | null;
  estadoCivil: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  distrito: string | null;
  provincia: string | null;
  departamento: string | null;
  observaciones: string | null;
  portalEnabled: boolean;
  userId: string | null;
  createdAt: string;
  updatedAt: string;
  adjuntos: {
    id: string;
    tipo: string;
    url: string;
    mimeType: string;
    sizeBytes: number | null;
    createdAt: string;
  }[];
  estadoLog: {
    id: string;
    fromEstado: EstadoSocio;
    toEstado: EstadoSocio;
    motivo: string;
    createdAt: string;
    byUser: { id: string; name: string } | null;
  }[];
};

export type CreateSocioInput = {
  tipoDocumento: TipoDocumento;
  numeroDocumento: string;
  apellidoPaterno: string;
  apellidoMaterno?: string;
  nombres: string;
  fechaNacimiento?: string;
  sexo?: Sexo;
  estadoCivil?: string;
  telefono?: string;
  email?: string;
  direccion?: string;
  distrito?: string;
  provincia?: string;
  departamento?: string;
  fechaIngreso: string;
  observaciones?: string;
};

export type UpdateSocioPatch = Partial<CreateSocioInput>;

export type SortKey = "codigo" | "documento" | "nombre" | "ingreso" | "estado";
export type SortDir = "asc" | "desc";

export type ListSociosParams = {
  q?: string;
  estado?: EstadoSocio;
  tipoDocumento?: TipoDocumento;
  page?: number;
  pageSize?: number;
  sort?: SortKey;
  dir?: SortDir;
};

export type ListSociosResult = {
  items: SocioRow[];
  total: number;
  page: number;
  pageSize: number;
  sort: SortKey;
  dir: SortDir;
};

export type SocioStats = {
  total: number;
  activo: number;
  suspendido: number;
  retirado: number;
  fallecido: number;
};

export type PermFlags = {
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
  canChangeState: boolean;
};
