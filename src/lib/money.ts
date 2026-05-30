// Formato de moneda peruana (Soles). Centralizado para consistencia.
const FMT = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
  minimumFractionDigits: 2,
});

export function formatSoles(value: number): string {
  return FMT.format(value);
}

/** Convierte un Prisma.Decimal | number | null a number seguro. */
export function toNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  // Prisma.Decimal y strings exponen toString()
  const n = Number(String(value));
  return isNaN(n) ? 0 : n;
}
