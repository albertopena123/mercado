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

// Parte una consulta de búsqueda libre en tokens, tratando CUALQUIER carácter no
// alfanumérico (espacios, comas, guiones, puntos…) como separador. Antes los
// buscadores partían solo por espacios (`/\s+/`), así que pegar "Apellido, Nombre"
// tal como aparece en la lista dejaba la coma pegada al token ("curasi,") y el
// `contains` contra searchKey —que no lleva comas— nunca matcheaba. \p{L}/\p{N}
// conserva letras acentuadas y dígitos para quienes buscan contra campos crudos.
export function splitSearchTokens(q: string | null | undefined): string[] {
  return (q ?? "").split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 0);
}

// Tokens normalizados (lowercase, sin tildes) de una consulta libre. Es el paso
// previo a construir cualquier filtro contra un `searchKey`.
export function searchTokens(q: string | null | undefined): string[] {
  return splitSearchTokens(q).map(normalizeToken);
}

// Fragmento AND para buscar un término libre contra un campo `searchKey`
// (concatenación normalizada de varios campos). CADA token debe aparecer, en
// CUALQUIER orden. Es la única forma correcta de buscar por nombre: usar un solo
// `contains` del término completo falla cuando el orden de las palabras no
// coincide con el de searchKey (p. ej. buscar "Julia Mondragón" cuando el orden
// almacenado es "mondragon … julia"). Devuelve [] si no hay tokens (no filtra).
//
// Para buscar contra el searchKey de un modelo relacionado, usa `searchTokens`
// y arma la rama tú mismo, p. ej.:
//   AND: searchTokens(q).map((t) => ({ socio: { searchKey: { contains: t } } }))
export function searchKeyAnd(
  q: string | null | undefined,
): { searchKey: { contains: string } }[] {
  return searchTokens(q).map((token) => ({ searchKey: { contains: token } }));
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
