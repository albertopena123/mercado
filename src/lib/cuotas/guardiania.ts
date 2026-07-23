// Token que define una cuota de "guardianía" (servicio de seguridad). El módulo
// /guardiania genera los cargos con el concepto "Guardianía · <código de puesto>",
// así que el substring "guardian" los cubre (el acento de "guardianía" va después).
export const GUARDIANIA_TOKEN = "guardian";

/**
 * Una cuota es de "guardianía" cuando su concepto la nombra. A diferencia del
 * autovalúo, el N.° de recibo de guardianía NO es único: la tesorera emite un solo
 * recibo físico que puede cubrir varios meses (y varios puestos) del mismo socio,
 * tal como aparece en el histórico del Excel de seguridad. Lo que sí se exige es
 * que SIEMPRE se registre: es el respaldo en papel del cobro.
 *
 * Es independiente del comprobante que emite el sistema, que lleva su propio folio
 * correlativo y código verificable por QR.
 */
export function esGuardiania(concepto: string | null | undefined): boolean {
  return new RegExp(GUARDIANIA_TOKEN, "i").test(concepto ?? "");
}
