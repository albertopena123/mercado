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

// Finalidades sugeridas para la constancia de socio (membresía). El campo es
// libre (datalist), pero se ofrecen opciones comunes. NINGUNA es "venta": la
// constancia de socio NO autoriza transferir ni vender un puesto.
export const MOTIVOS_CONSTANCIA_SOCIO = [
  "Trámite bancario / financiero",
  "Trámite municipal",
  "Trámite notarial",
  "Presentación ante entidad pública",
  "Gestión personal",
] as const;

// Cláusula de no-autorización que se IMPRIME en la constancia de socio. Es el
// escudo legal: advierte expresamente al lector que el documento no autoriza
// vender/transferir un puesto, para que un comprador informal no pueda alegar
// buena fe basándose en esta constancia.
export const CONSTANCIA_SOCIO_DISCLAIMER =
  "La presente constancia acredita únicamente la condición de socio a la fecha de emisión y para el fin indicado. NO autoriza ni constituye promesa de venta, transferencia o cesión de puesto alguno. Toda transferencia de puesto es NULA sin el procedimiento formal aprobado por el Consejo Directivo y la Asamblea General (Arts. 14° y 24° del Reglamento Interno de Administración). La asociación no se responsabiliza por acuerdos privados celebrados al margen de dicho procedimiento.";

export type EmitResult = {
  folio: string;
  codigo: string;
  emitidoEn: string; // ISO
  validoHasta: string | null; // ISO
  verifyUrl: string;
  qrSvg: string;
};
