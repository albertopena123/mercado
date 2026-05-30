// Spanish-Peru relative + absolute date formatting helpers.
// All formatters are pinned to America/Lima so server (UTC) and client agree.

const TZ = "America/Lima";

const FULL_FMT: Intl.DateTimeFormatOptions = {
  timeZone: TZ,
  weekday: "short",
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

const TIME_FMT: Intl.DateTimeFormatOptions = {
  timeZone: TZ,
  hour: "2-digit",
  minute: "2-digit",
};

const DATE_FMT: Intl.DateTimeFormatOptions = {
  timeZone: TZ,
  year: "numeric",
  month: "short",
  day: "numeric",
};

export function formatFullDate(iso: string | Date | null): string {
  if (!iso) return "Nunca";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleString("es-PE", FULL_FMT);
}

export function formatDateOnly(iso: string | Date | null): string {
  if (!iso) return "Nunca";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleDateString("es-PE", DATE_FMT);
}

/** Relative for recent, absolute for older. */
export function formatRelative(
  iso: string | Date | null,
  now: number = Date.now(),
): string {
  if (!iso) return "Nunca";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const t = d.getTime();
  const diffMs = now - t;
  const diffMin = Math.floor(diffMs / 60_000);
  const diffH = Math.floor(diffMs / 3_600_000);

  if (diffMs < 0) return d.toLocaleDateString("es-PE", DATE_FMT);
  if (diffMin < 1) return "Justo ahora";
  if (diffMin < 60) return `hace ${diffMin} min`;
  if (diffH < 12) return `hace ${diffH} h`;

  const today = inLima(now);
  const target = inLima(t);

  if (sameLimaDay(target, today))
    return `Hoy ${d.toLocaleTimeString("es-PE", TIME_FMT)}`;

  const yest = { ...today };
  yest.day -= 1;
  if (sameLimaDay(target, yest))
    return `Ayer ${d.toLocaleTimeString("es-PE", TIME_FMT)}`;

  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays < 7) return `hace ${diffDays} días`;

  return d.toLocaleDateString("es-PE", DATE_FMT);
}

// Helpers: compute year/month/day in America/Lima for stable day boundaries.
type LimaDay = { year: number; month: number; day: number };
function inLima(ts: number): LimaDay {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date(ts));
  const get = (t: string) =>
    Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day") };
}
function sameLimaDay(a: LimaDay, b: LimaDay): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}
