import type {
  UbicacionBien,
  EstadoBien,
  TipoMovBien,
} from "@/generated/prisma/client";

export const UBICACION_LABEL: Record<UbicacionBien, string> = {
  oficina: "Oficina",
  almacen: "Almacén",
};

export const ESTADO_LABEL: Record<EstadoBien, string> = {
  nuevo: "Nuevo",
  conservado: "Conservado",
  en_uso: "En uso",
  sin_usar: "Sin usar",
  desuso: "En desuso",
  mal_estado: "Mal estado",
  roto: "Roto",
  baja: "Baja",
};

export const TIPO_MOV_LABEL: Record<TipoMovBien, string> = {
  entrada: "Entrada",
  salida: "Salida",
  ajuste: "Ajuste",
};

export const ESTADOS: EstadoBien[] = [
  "nuevo",
  "conservado",
  "en_uso",
  "sin_usar",
  "desuso",
  "mal_estado",
  "roto",
  "baja",
];

export const UBICACIONES: UbicacionBien[] = ["oficina", "almacen"];

// Unidades sugeridas (la API real es texto libre, así que solo orientan).
export const UNIDADES = [
  "UND",
  "PQT",
  "CJA",
  "CJS",
  "GLN",
  "ROLLO",
  "LATA",
  "BALDE",
  "PAR",
  "JUEGO",
  "KIT",
  "M",
  "KG",
];
