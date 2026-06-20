// Constantes y tipos compartidos entre el server action (actions.ts) y la vista
// cliente (ConstanciaView). Vive aparte porque un archivo "use server" solo
// puede exportar funciones async.
import type { TipoConstancia } from "@/generated/prisma/client";

export type { TipoConstancia };

// Etiqueta legible de cada tipo de constancia. (El valor del enum sigue siendo
// "socio_habil" por compatibilidad, pero conceptualmente es la de membresía.)
export const TIPO_CONSTANCIA_LABEL: Record<TipoConstancia, string> = {
  socio_habil: "Constancia de socio",
  no_adeudo: "Constancia de no adeudo",
};

// Vigencia de la constancia (ambos tipos dependen de que el socio esté al día en
// sus cuotas, que cambian mes a mes; por eso la vigencia es corta).
export const VIGENCIA_DIAS = 30;

export type EmitResult = {
  folio: string;
  codigo: string;
  emitidoEn: string; // ISO
  validoHasta: string | null; // ISO
  verifyUrl: string;
  qrSvg: string;
};
