import type { Organo, CargoDirectivo } from "@/generated/prisma/client";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | {
      ok: false;
      error: string;
      fieldErrors?: Partial<Record<string, string>>;
    };

export const ORGANO_LABEL: Record<Organo, string> = {
  consejo_directivo: "Consejo Directivo",
  fiscalia: "Fiscalía",
  comite: "Comité",
  coordinacion_bloque: "Coordinación de bloque",
};

export const CARGO_LABEL: Record<CargoDirectivo, string> = {
  presidente: "Presidente",
  vicepresidente: "Vicepresidente",
  secretario: "Secretario",
  tesorero: "Tesorero",
  fiscal: "Fiscal",
  vocal: "Vocal",
  coordinador: "Coordinador de bloque",
  otro: "Otro",
};

// Cargos que solo pueden tener UN titular vigente por órgano. coordinador y vocal
// pueden repetirse (varios coordinadores de bloque, varios vocales).
export const CARGOS_UNICOS: CargoDirectivo[] = [
  "presidente",
  "vicepresidente",
  "secretario",
  "tesorero",
  "fiscal",
];

export type DirectivoRow = {
  id: string;
  socioId: string;
  socioNombre: string;
  socioCodigo: string;
  organo: Organo;
  cargo: CargoDirectivo;
  bloque: string | null;
  periodo: string | null;
  desde: string; // ISO
  hasta: string | null; // ISO; null = vigente
  observaciones: string | null;
};

export type SocioOption = {
  id: string;
  codigo: string;
  nombre: string;
};

export type CrearDirectivoInput = {
  socioId: string;
  organo: Organo;
  cargo: CargoDirectivo;
  bloque?: string | null;
  periodo?: string | null;
  desde?: string;
  observaciones?: string | null;
};

export type EditarDirectivoInput = {
  organo?: Organo;
  cargo?: CargoDirectivo;
  bloque?: string | null;
  periodo?: string | null;
  observaciones?: string | null;
};

export type PermFlags = {
  canRead: boolean;
  canWrite: boolean;
};
