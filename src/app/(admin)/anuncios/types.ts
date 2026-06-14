import type {
  TipoAnuncio,
  VisibilidadAnuncio,
  EstadoAnuncio,
} from "@/generated/prisma/client";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | {
      ok: false;
      error: string;
      fieldErrors?: Partial<Record<string, string>>;
    };

export type AnuncioRow = {
  id: string;
  titulo: string;
  tipo: TipoAnuncio;
  visibilidad: VisibilidadAnuncio;
  estado: EstadoAnuncio;
  fijado: boolean;
  imagenUrl: string | null;
  publicadoEn: string | null;
  validoHasta: string | null;
  createdAt: string;
};

export type AnuncioDetail = AnuncioRow & {
  resumen: string | null;
  contenido: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
};

export type CreateAnuncioInput = {
  titulo: string;
  resumen?: string;
  contenido: string;
  tipo?: TipoAnuncio;
  visibilidad?: VisibilidadAnuncio;
  estado?: EstadoAnuncio;
  fijado?: boolean;
  validoHasta?: string | null;
};

export type UpdateAnuncioPatch = Partial<CreateAnuncioInput>;

export type SortKey =
  | "titulo"
  | "tipo"
  | "visibilidad"
  | "estado"
  | "publicadoEn"
  | "createdAt";
export type SortDir = "asc" | "desc";

export type ListAnunciosParams = {
  q?: string;
  estado?: EstadoAnuncio;
  tipo?: TipoAnuncio;
  visibilidad?: VisibilidadAnuncio;
  page?: number;
  pageSize?: number;
  sort?: SortKey;
  dir?: SortDir;
};

export type ListAnunciosResult = {
  items: AnuncioRow[];
  total: number;
  page: number;
  pageSize: number;
  sort: SortKey;
  dir: SortDir;
};

export type AnuncioStats = {
  total: number;
  publicado: number;
  borrador: number;
  archivado: number;
};

export type PermFlags = {
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
};
