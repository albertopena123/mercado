import type { TipoDocumento } from "@/generated/prisma/client";

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
