// Métricas del equipo donde corre el sistema (app + Postgres viven en la misma
// máquina). Node puro, sin dependencias ni comandos del SO:
//   - CPU: delta de os.cpus() entre el sondeo anterior y el actual.
//   - RAM: totalmem − freemem.
//   - Disco: fs.statfs sobre el directorio de la app (multiplataforma) — es el
//     disco donde viven los uploads y la BD local, el que de verdad se llena.
// SIN `server-only` a propósito: no toca secretos y así el verificador puede
// ejecutarla directo con tsx (mismo criterio que continuidad.ts del padrón).
import os from "node:os";
import { statfs } from "node:fs/promises";

export type EstadoServidor = {
  host: string;
  plataforma: string; // p. ej. "Windows 10.0.19045" / "Linux 6.8"
  arquitectura: string;
  uptimeSeg: number;
  cpu: {
    // null SOLO en el arranque si aún no hay ventana de medición (no ocurre en
    // la práctica: el primer sondeo toma doble muestra).
    pct: number | null;
    nucleos: number;
    modelo: string;
  };
  ram: { totalBytes: number; usadoBytes: number; pct: number };
  // null si statfs falla (la UI lo muestra como "No disponible", no inventa).
  disco: { ruta: string; totalBytes: number; usadoBytes: number; pct: number } | null;
  tomadoEn: string;
};

type CpuSnapshot = { idle: number; total: number };

function snapshotCpu(): CpuSnapshot {
  let idle = 0;
  let total = 0;
  for (const c of os.cpus()) {
    idle += c.times.idle;
    total += c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq;
  }
  return { idle, total };
}

// Ventana de medición compartida por TODOS los que sondeen (varios admins
// pueden tener /sistema abierto a la vez). La ventana solo se rota cuando
// acumuló al menos VENTANA_MIN_MS: un sondeo que llegue "encima" de otro no la
// consume (eso fragmentaba la medición en micro-ventanas ruidosas y, con menos
// de un tick del reloj de por medio, daba dTotal=0 → "Sin dato" intermitente).
// Entre rotaciones, todos reciben el último % calculado — todos miran la misma
// máquina, no necesitan lecturas independientes.
const VENTANA_MIN_MS = 2_000;
let prevCpu: CpuSnapshot | null = null;
let prevCpuEn = 0; // Date.now() de cuando se tomó prevCpu
let ultimoPct: number | null = null;

function pctCpuDesde(prev: CpuSnapshot, ahora: CpuSnapshot): number | null {
  const dTotal = ahora.total - prev.total;
  const dIdle = ahora.idle - prev.idle;
  if (dTotal <= 0) return null; // sin ventana (dos lecturas en el mismo tick)
  return redondear(((dTotal - dIdle) / dTotal) * 100);
}

function redondear(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n * 10) / 10));
}

export async function leerEstadoServidor(): Promise<EstadoServidor> {
  // CPU: si no hay ventana previa (primer sondeo o módulo recompilado en dev),
  // toma una corta ahora mismo; si la hay, solo la rota cuando ya acumuló el
  // mínimo — sondeos más seguidos reciben el último valor estable.
  const msAhora = Date.now();
  if (!prevCpu) {
    const primera = snapshotCpu();
    await new Promise((r) => setTimeout(r, 250));
    const segunda = snapshotCpu();
    ultimoPct = pctCpuDesde(primera, segunda);
    prevCpu = segunda;
    prevCpuEn = msAhora;
  } else if (msAhora - prevCpuEn >= VENTANA_MIN_MS) {
    const ahora = snapshotCpu();
    const pct = pctCpuDesde(prevCpu, ahora);
    if (pct !== null) ultimoPct = pct;
    prevCpu = ahora;
    prevCpuEn = msAhora;
  }
  const cpuPct = ultimoPct;

  const total = os.totalmem();
  const libre = os.freemem();

  // Disco del directorio de la app. statfs existe en Windows y Linux (Node 18+).
  let disco: EstadoServidor["disco"] = null;
  try {
    const ruta = process.cwd();
    const s = await statfs(ruta);
    const totalBytes = s.bsize * s.blocks;
    const libreBytes = s.bsize * s.bavail;
    if (totalBytes > 0) {
      disco = {
        ruta,
        totalBytes,
        usadoBytes: totalBytes - libreBytes,
        pct: redondear(((totalBytes - libreBytes) / totalBytes) * 100),
      };
    }
  } catch {
    disco = null; // la UI lo dice explícitamente
  }

  const cpus = os.cpus();
  return {
    host: os.hostname(),
    plataforma: `${os.type()} ${os.release()}`,
    arquitectura: os.arch(),
    uptimeSeg: Math.round(os.uptime()),
    cpu: {
      pct: cpuPct,
      nucleos: cpus.length,
      modelo: cpus[0]?.model?.trim() ?? "—",
    },
    ram: {
      totalBytes: total,
      usadoBytes: total - libre,
      pct: redondear(((total - libre) / total) * 100),
    },
    disco,
    tomadoEn: new Date().toISOString(),
  };
}
