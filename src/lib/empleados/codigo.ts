// Código correlativo de empleados: EMP-000001.
const PREFIX = "EMP-";
const PAD = 6;
const RE = /^EMP-(\d{6,})$/;

export function formatCodigoEmpleado(n: number): string {
  return PREFIX + String(n).padStart(PAD, "0");
}

export function parseCodigoEmpleado(codigo: string): number | null {
  const m = RE.exec(codigo);
  if (!m) return null;
  return parseInt(m[1], 10);
}

export function nextCodigoEmpleado(lastCodigo: string | null): string {
  if (!lastCodigo) return formatCodigoEmpleado(1);
  const n = parseCodigoEmpleado(lastCodigo);
  if (n === null) return formatCodigoEmpleado(1);
  return formatCodigoEmpleado(n + 1);
}
