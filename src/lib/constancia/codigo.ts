import { randomBytes } from "node:crypto";

// Crockford base32 sin I, L, O, U: caracteres fáciles de leer y dictar por
// teléfono, sin confundir 0/O ni 1/I/L.
const ALFABETO = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function aleatorioBase32(n: number): string {
  const bytes = randomBytes(n);
  let out = "";
  for (const b of bytes) out += ALFABETO[b % 32];
  return out;
}

/**
 * Código de verificación que viaja en el QR y se valida en /verificar/<codigo>.
 * Formato: `MM-2026-XXXX-XXXX` (8 caracteres aleatorios → 32^8 ≈ 1.1·10¹²
 * combinaciones, no adivinable a fuerza bruta). El prefijo MM = Mercado Milagros.
 */
export function generarCodigoVerificacion(anio: number): string {
  const r = aleatorioBase32(8);
  return `MM-${anio}-${r.slice(0, 4)}-${r.slice(4, 8)}`;
}

/** Folio correlativo legible para registro/seguimiento: "000123-2026". */
export function formatFolio(numero: number, anio: number): string {
  return `${String(numero).padStart(6, "0")}-${anio}`;
}

/**
 * Enmascara un documento dejando ver el inicio y el final, para no exponer el
 * número completo en la página pública de verificación: "09608161" → "09••••61".
 */
export function maskDocumento(num: string): string {
  const s = (num ?? "").trim();
  if (s.length <= 4) return s ? s[0] + "•".repeat(Math.max(0, s.length - 1)) : "—";
  return `${s.slice(0, 2)}${"•".repeat(s.length - 4)}${s.slice(-2)}`;
}

/** Año calendario en hora de Perú (UTC-5), para el folio y el código. */
export function anioLima(d: Date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Lima",
      year: "numeric",
    }).format(d),
  );
}
