// Manejo de fechas del sistema. Perú es UTC-5 todo el año (sin horario de
// verano), así que usamos ese offset fijo donde hace falta determinismo.
//
// Hay DOS tipos de fecha y se tratan distinto:
//
// 1) Fechas de CALENDARIO (sin hora): fechaIngreso, fechaNacimiento,
//    vencimiento. Se guardan como UTC-medianoche del día elegido. Para
//    mostrarlas se formatean en UTC, así NO se corren un día por la zona
//    horaria del usuario.
//
// 2) INSTANTES (con hora real): createdAt, updatedAt, pagadoEn, fecha/hora de
//    asamblea, asignaciones. Se muestran en hora de Perú (America/Lima).

const TZ = "America/Lima";
const PERU_OFFSET_MS = 5 * 60 * 60 * 1000; // UTC-5

function asDate(v: string | Date): Date {
  return v instanceof Date ? v : new Date(v);
}

/* ───────── Fechas de calendario (UTC, no se corren) ───────── */

export function fechaCorta(iso?: string | Date | null): string {
  if (!iso) return "—";
  return asDate(iso).toLocaleDateString("es-PE", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function fechaLarga(iso?: string | Date | null): string {
  if (!iso) return "—";
  return asDate(iso).toLocaleDateString("es-PE", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/* ───────── Instantes (hora de Perú) ───────── */

export function fechaTS(iso?: string | Date | null): string {
  if (!iso) return "—";
  return asDate(iso).toLocaleDateString("es-PE", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function fechaLargaTS(iso?: string | Date | null): string {
  if (!iso) return "—";
  return asDate(iso).toLocaleDateString("es-PE", {
    timeZone: TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// dd/mm/yyyy HH:MM en hora de Perú. Para uso en cliente (la hora con a.m./p.m.
// de Intl puede no coincidir entre server y navegador → solo donde NO hay SSR).
export function fechaHora(iso?: string | Date | null): string {
  if (!iso) return "—";
  const d = asDate(iso);
  return `${fechaTS(d)} ${horaLima(d)}`;
}

/**
 * Hora 12h en Perú, determinista (sin Intl): desplazamos el instante -5h y
 * leemos en UTC. Sirve para contenido renderizado en el servidor (SSR) sin
 * causar errores de hidratación.
 */
export function horaLima(iso?: string | Date | null): string {
  if (!iso) return "—";
  const ms = asDate(iso).getTime() - PERU_OFFSET_MS;
  const peru = new Date(ms);
  let h = peru.getUTCHours();
  const m = peru.getUTCMinutes();
  const sufijo = h < 12 ? "a. m." : "p. m.";
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")} ${sufijo}`;
}

/** Hoy en Perú, formato largo (para constancias, etc.). */
export function hoyLarga(): string {
  return new Date().toLocaleDateString("es-PE", {
    timeZone: TZ,
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Combina "yyyy-mm-dd" + "HH:mm" como hora de Perú (UTC-5) y devuelve el Date
 * (instante) correcto, sin importar la zona horaria del servidor.
 */
export function peruDateTime(fecha: string, hora: string): Date {
  const h = /^\d{2}:\d{2}$/.test(hora) ? hora : "00:00";
  return new Date(`${fecha}T${h}:00-05:00`);
}
