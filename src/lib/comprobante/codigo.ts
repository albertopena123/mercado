import { randomBytes } from "node:crypto";

// Reutiliza los helpers de constancia (folio, año Lima, máscara de documento):
// el formato del folio y la lógica de año son idénticos.
export { formatFolio, anioLima, maskDocumento } from "@/lib/constancia/codigo";

// Crockford base32 sin I, L, O, U (fácil de leer/dictar), igual que constancias.
const ALFABETO = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function aleatorioBase32(n: number): string {
  const bytes = randomBytes(n);
  let out = "";
  for (const b of bytes) out += ALFABETO[b % 32];
  return out;
}

/**
 * Código de verificación del comprobante de pago. Formato `CP-2026-XXXX-XXXX`
 * (8 caracteres aleatorios → no adivinable). Prefijo CP = Comprobante de Pago,
 * para distinguirlo del MM- de las constancias.
 */
export function generarCodigoComprobante(anio: number): string {
  const r = aleatorioBase32(8);
  return `CP-${anio}-${r.slice(0, 4)}-${r.slice(4, 8)}`;
}
