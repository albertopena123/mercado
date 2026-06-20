const PREFIX = "SOC-";
const PAD = 6;
const RE = /^SOC-(\d{6,})$/;

export function formatCodigo(n: number): string {
  return PREFIX + String(n).padStart(PAD, "0");
}

export function parseCodigo(codigo: string): number | null {
  const m = RE.exec(codigo);
  if (!m) return null;
  return parseInt(m[1], 10);
}

export function nextCodigo(lastCodigo: string | null): string {
  if (!lastCodigo) return formatCodigo(1);
  const n = parseCodigo(lastCodigo);
  if (n === null) return formatCodigo(1);
  return formatCodigo(n + 1);
}

/**
 * Próximo código a partir de una LISTA de códigos existentes, tomando el máximo
 * por valor NUMÉRICO (no lexicográfico). Necesario porque una consulta
 * `orderBy: { codigo: "desc" }` ordena como texto y, al pasar de 6 dígitos
 * (SOC-1000000), "SOC-999999" quedaría por encima y se regeneraría un código
 * duplicado. El llamador debe pasar los códigos candidatos (todos, o un rango
 * alto suficiente). Inmune al desbordamiento de 6 dígitos.
 */
export function nextCodigoFromList(
  codigos: (string | null | undefined)[],
): string {
  let max = 0;
  for (const c of codigos) {
    if (!c) continue;
    const n = parseCodigo(c);
    if (n !== null && n > max) max = n;
  }
  return formatCodigo(max + 1);
}
