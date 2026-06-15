// Manejo de fechas del sistema. Perú es UTC-5 todo el año (sin horario de
// verano), así que usamos ese offset fijo donde hace falta determinismo.
//
// Hay DOS tipos de fecha y se tratan distinto:
//
// 1) Fechas de CALENDARIO (sin hora): fechaIngreso, fechaNacimiento,
//    vencimiento, pagadoEn, fecha de movimiento de caja. Se guardan como
//    UTC-medianoche del día elegido. Para mostrarlas se formatean en UTC
//    (fechaCorta/fechaLarga), así NO se corren un día por la zona horaria.
//
// 2) INSTANTES (con hora real): createdAt, updatedAt, fecha/hora de asamblea,
//    asignaciones de puesto. Se muestran en hora de Perú (America/Lima).

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

/**
 * "yyyy-mm-dd" del día de HOY en Perú (UTC-5), determinista. Para inicializar
 * inputs <input type="date"> y su atributo max sin que se corran un día por la
 * zona horaria (toISOString().slice(0,10) daría el día UTC, no el de Perú).
 */
export function hoyISOPeru(): string {
  return new Date(Date.now() - PERU_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Convierte "yyyy-mm-dd" (fecha de CALENDARIO, sin hora) al Date de su
 * medianoche UTC, que es como se almacenan las fechas de calendario para que al
 * mostrarse con fechaCorta (timeZone UTC) no se corran un día. Devuelve hoy
 * (Perú) si la cadena es inválida o vacía.
 */
export function inicioDiaUTC(yyyymmdd?: string | null): Date {
  const s = (yyyymmdd ?? "").trim();
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s)
    ? new Date(`${s}T00:00:00.000Z`)
    : new Date(`${hoyISOPeru()}T00:00:00.000Z`);
  return isNaN(d.getTime()) ? new Date(`${hoyISOPeru()}T00:00:00.000Z`) : d;
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
