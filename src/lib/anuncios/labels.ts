import type {
  TipoAnuncio,
  VisibilidadAnuncio,
  EstadoAnuncio,
} from "@/generated/prisma/client";

export const TIPO_ANUNCIO_LABEL: Record<TipoAnuncio, string> = {
  anuncio: "Anuncio",
  comunicado: "Comunicado",
};

export const VISIBILIDAD_LABEL: Record<VisibilidadAnuncio, string> = {
  publico: "Público",
  socios: "Solo socios",
};

export const ESTADO_ANUNCIO_LABEL: Record<EstadoAnuncio, string> = {
  borrador: "Borrador",
  publicado: "Publicado",
  archivado: "Archivado",
};

export const TIPOS_ANUNCIO: TipoAnuncio[] = ["anuncio", "comunicado"];
export const VISIBILIDADES: VisibilidadAnuncio[] = ["publico", "socios"];
export const ESTADOS_ANUNCIO: EstadoAnuncio[] = [
  "borrador",
  "publicado",
  "archivado",
];
