// Normalización para búsqueda accent-insensitive sin depender de extensiones
// de Postgres. NFD descompone las letras acentuadas en (letra + diacrítico
// combinante); el regex elimina los diacríticos del rango U+0300–U+036F.
// Resultado: "Peña Mondragón" → "pena mondragon".

const DIACRITICS = /[̀-ͯ]/g;

export function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(DIACRITICS, "");
}

export function normalizeToken(s: string): string {
  return stripDiacritics(s).toLowerCase();
}

export function buildSocioSearchKey(parts: {
  codigo?: string | null;
  numeroDocumento?: string | null;
  numeroPadron?: number | null;
  apellidoPaterno?: string | null;
  apellidoMaterno?: string | null;
  nombres?: string | null;
}): string {
  return [
    parts.codigo,
    parts.numeroDocumento,
    parts.numeroPadron != null ? String(parts.numeroPadron) : null,
    parts.apellidoPaterno,
    parts.apellidoMaterno,
    parts.nombres,
  ]
    .filter((p): p is string => Boolean(p))
    .map(normalizeToken)
    .join(" ");
}
