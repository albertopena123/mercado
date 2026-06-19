import type { TipoDocumento } from "@/generated/prisma/client";

// Prefijo del documento placeholder para socios importados del padrón SIN DNI
// registrado (la columna DNI venía vacía o con basura). Se marcan así para
// regularizarlos luego y se diferencian visualmente en la lista de socios.
export const DOC_PENDIENTE_PREFIX = "SIN-DNI-";

export function esDocumentoPendiente(numeroDocumento: string): boolean {
  return numeroDocumento.startsWith(DOC_PENDIENTE_PREFIX);
}

export function validateNumeroDocumento(
  tipo: TipoDocumento,
  numero: string,
): boolean {
  const v = numero.trim();
  switch (tipo) {
    case "DNI":
      return /^\d{8}$/.test(v);
    case "RUC":
      return /^\d{11}$/.test(v);
    case "CE":
      return /^\d{9,12}$/.test(v);
    case "PASAPORTE":
      return /^[A-Za-z0-9]{6,12}$/.test(v);
  }
}

export function normalizeNumeroDocumento(
  tipo: TipoDocumento,
  numero: string,
): string {
  const trimmed = numero.trim();
  if (tipo === "PASAPORTE") return trimmed.toUpperCase();
  return trimmed;
}
