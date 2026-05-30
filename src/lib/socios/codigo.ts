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
