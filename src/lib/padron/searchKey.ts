import { normalizeToken } from "@/lib/socios/normalize";

// searchKey de un registro histórico. Usa `nombreOriginal` (no `nombre`) a
// propósito: así la anotación incrustada —"(vendido 2023)", "(falta pagar
// trapaso)"— también es buscable. Sin `server-only`: lo usan el importador
// (script Node) y la app.
export function buildPadronRegistroSearchKey(parts: {
  nombreOriginal?: string | null;
  numeroDocumento?: string | null;
  numeroPadron?: number | null;
  puestoCodigo?: string | null;
}): string {
  return [
    parts.nombreOriginal,
    parts.numeroDocumento,
    parts.numeroPadron != null ? String(parts.numeroPadron) : null,
    parts.puestoCodigo,
  ]
    .filter((p): p is string => Boolean(p))
    .map(normalizeToken)
    .join(" ");
}
