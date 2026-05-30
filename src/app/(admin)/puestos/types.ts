import type { EstadoPuesto } from "@/generated/prisma/client";

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
  giro: string | null;
  zona: string | null;
  area: number | null;
  estado: EstadoPuesto;
  fotoUrl: string | null;
  socioActual: { id: string; nombre: string } | null;
};

export type PuestoDetail = {
  id: string;
  codigo: string;
  giro: string | null;
  zona: string | null;
  area: number | null;
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
  codigo: string;
  giro?: string;
  zona?: string;
  area?: number | null;
  estado?: EstadoPuesto;
  observaciones?: string;
};

export type UpdatePuestoPatch = Partial<CreatePuestoInput>;

export type SortKey = "codigo" | "giro" | "zona" | "estado";
export type SortDir = "asc" | "desc";

export type ListPuestosParams = {
  q?: string;
  estado?: EstadoPuesto;
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

export type PermFlags = {
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
  canAssign: boolean;
};
