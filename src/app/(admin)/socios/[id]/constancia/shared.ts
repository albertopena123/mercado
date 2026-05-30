// Constantes y tipos compartidos entre el server action (actions.ts) y la vista
// cliente (ConstanciaView). Vive aparte porque un archivo "use server" solo
// puede exportar funciones async.

// Vigencia de la constancia de socio hábil. La condición de "hábil" depende de
// las cuotas, que cambian mes a mes; por eso la vigencia es corta.
export const VIGENCIA_DIAS = 30;

export type EmitResult = {
  folio: string;
  codigo: string;
  emitidoEn: string; // ISO
  validoHasta: string | null; // ISO
  verifyUrl: string;
  qrSvg: string;
};
