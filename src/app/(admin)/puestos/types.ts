import type {
  EstadoPuesto,
  BandaPuesto,
  DimensionPuesto,
  TipoEspacio,
  Giro,
} from "@/generated/prisma/client";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | {
      ok: false;
      error: string;
      fieldErrors?: Partial<Record<string, string>>;
    };

export type PuestoRow = {
  id: string;
  codigo: string;
  etapa: number;
  bloque: string;
  numero: number;
  banda: BandaPuesto;
  dimension: DimensionPuesto;
  giro: Giro | null;
  estado: EstadoPuesto;
  fotoUrl: string | null;
  socioActual: { id: string; nombre: string } | null;
};

export type PuestoDetail = {
  id: string;
  codigo: string;
  etapa: number;
  bloque: string;
  numero: number;
  puestoNro: number;
  tipo: TipoEspacio;
  banda: BandaPuesto;
  dimension: DimensionPuesto;
  giro: Giro | null;
  estado: EstadoPuesto;
  fotoUrl: string | null;
  observaciones: string | null;
  createdAt: string;
  updatedAt: string;
  asignaciones: {
    id: string;
    socioId: string;
    socioNombre: string;
    socioCodigo: string;
    desde: string;
    hasta: string | null;
    motivo: string | null;
    byUser: string | null;
  }[];
};

export type CreatePuestoInput = {
  etapa: number;
  bloque: string;
  numero: number;
  banda?: BandaPuesto;
  dimension?: DimensionPuesto;
  giro?: Giro | null;
  estado?: EstadoPuesto;
  observaciones?: string;
};

export type UpdatePuestoPatch = Partial<CreatePuestoInput>;

export type SortKey = "codigo" | "bloque" | "numero" | "giro" | "estado";
export type SortDir = "asc" | "desc";

export type ListPuestosParams = {
  q?: string;
  estado?: EstadoPuesto;
  etapa?: number;
  bloque?: string;
  page?: number;
  pageSize?: number;
  sort?: SortKey;
  dir?: SortDir;
};

export type ListPuestosResult = {
  items: PuestoRow[];
  total: number;
  page: number;
  pageSize: number;
  sort: SortKey;
  dir: SortDir;
};

export type PuestoStats = {
  total: number;
  activo: number;
  vacio: number;
  clausurado: number;
  construccion: number;
};

// Celda para la vista de plano (sin paginación).
export type PlanoCell = {
  id: string;
  bloque: string;
  numero: number;
  banda: BandaPuesto;
  dimension: DimensionPuesto;
  tipo: TipoEspacio;
  estado: EstadoPuesto;
  giro: Giro | null;
  codigo: string;
  // Puesto en alquiler (propiedad de la asociación): se rotula "ALQUILER" en el
  // plano en vez de su número. Se deriva de las observaciones.
  esAlquiler: boolean;
  socioActual: { id: string; nombre: string } | null;
};

export type GenerarGrillaInput = {
  etapa: number;
  bloques: string[];
};

export type PermFlags = {
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
  canAssign: boolean;
};
