"use client";

import "./sistema.css";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/admin/Icon";
import { getEstadoServidor } from "./actions";
import type { EstadoServidor } from "@/lib/sistema/metrics";

// Cada cuánto se sondea con la pestaña visible (mismo patrón que la campana
// del portal: sin solapes y sin gastar de fondo con la pestaña oculta).
const POLL_MS = 5_000;
// Muestras de tendencia que se conservan en memoria (~5 min a 5 s por muestra).
const MAX_MUESTRAS = 60;

type Nivel = "ok" | "ambar" | "rojo" | "nd";

// Umbrales del semáforo (del spec).
function nivel(pct: number | null, ambar: number, rojo: number): Nivel {
  if (pct === null) return "nd";
  if (pct >= rojo) return "rojo";
  if (pct >= ambar) return "ambar";
  return "ok";
}

const NIVEL_CHIP: Record<Nivel, { clase: string; label: string }> = {
  ok: { clase: "badge badge--green", label: "Normal" },
  ambar: { clase: "badge badge--amber", label: "Atención" },
  rojo: { clase: "badge badge--red", label: "Crítico" },
  nd: { clase: "badge", label: "Sin dato" },
};

function gb(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

function uptimeTexto(seg: number): string {
  const d = Math.floor(seg / 86400);
  const h = Math.floor((seg % 86400) / 3600);
  const m = Math.floor((seg % 3600) / 60);
  if (d > 0) return `${d} día${d === 1 ? "" : "s"} ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min`;
}

/* ─────────────────────────── Medidor radial ───────────────────────────
   Dial de 240° (de -120° a +120°, 0° = arriba) en SVG puro. Las marcas de
   umbral van SOBRE el dial: se ve dónde empieza "atención" y dónde
   "crítico" sin leer ninguna leyenda. */

const GAUGE_R = 44;
const GAUGE_SWEEP = 240;

function polar(deg: number, r: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180; // 0° = arriba
  return [60 + r * Math.cos(a), 60 + r * Math.sin(a)];
}

function arcoPath(r: number): string {
  const [x1, y1] = polar(-GAUGE_SWEEP / 2, r);
  const [x2, y2] = polar(GAUGE_SWEEP / 2, r);
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 1 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

function Marca({ pct, tipo }: { pct: number; tipo: "ambar" | "rojo" }) {
  const deg = -GAUGE_SWEEP / 2 + (GAUGE_SWEEP * pct) / 100;
  const [x1, y1] = polar(deg, GAUGE_R - 8);
  const [x2, y2] = polar(deg, GAUGE_R + 8);
  return (
    <line
      className={`sis-gauge__marca sis-gauge__marca--${tipo}`}
      x1={x1} y1={y1} x2={x2} y2={y2}
    />
  );
}

function Medidor({
  pct,
  ambar,
  rojo,
  nivelActual,
}: {
  pct: number | null;
  ambar: number;
  rojo: number;
  nivelActual: Nivel;
}) {
  // pathLength=100 normaliza el arco: dasharray "pct resto" pinta el avance.
  const visible = pct ?? 0;
  return (
    <svg className="sis-gauge" viewBox="0 0 120 100" aria-hidden="true">
      <path className="sis-gauge__riel" d={arcoPath(GAUGE_R)} pathLength={100} />
      <path
        className={`sis-gauge__arco sis-gauge__arco--${nivelActual}`}
        d={arcoPath(GAUGE_R)}
        pathLength={100}
        strokeDasharray={`${visible} ${100 - visible}`}
      />
      <Marca pct={ambar} tipo="ambar" />
      <Marca pct={rojo} tipo="rojo" />
      <text className="sis-gauge__valor" x="60" y="57" textAnchor="middle">
        {pct === null ? "—" : `${Math.round(pct)}%`}
      </text>
      <text className="sis-gauge__unidad" x="60" y="72" textAnchor="middle">
        {pct === null ? "sin dato" : "en uso"}
      </text>
    </svg>
  );
}

/* ─────────────────────────── Sparkline ───────────────────────────
   Tendencia de los últimos ~5 min con área rellena, escala fija 0-100 para
   que dos picos iguales se vean iguales siempre. Solo tiene sentido para
   CPU/RAM (el disco no se mueve en minutos; ahí lo útil es cuánto queda
   LIBRE). */

function Sparkline({ datos }: { datos: number[] }) {
  if (datos.length < 2)
    return (
      <div className="sis-spark sis-spark--vacia">
        <span>recolectando tendencia…</span>
      </div>
    );
  const paso = 100 / (MAX_MUESTRAS - 1);
  // Alineada a la derecha: la última muestra siempre en el borde derecho.
  const offset = 100 - (datos.length - 1) * paso;
  const xy = datos.map(
    (v, i) =>
      [offset + i * paso, 30 - (v * 26) / 100] as const,
  );
  const linea = xy.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const area = `${offset.toFixed(2)},32 ${linea} 100,32`;
  return (
    <svg className="sis-spark" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true">
      <polygon className="sis-spark__area" points={area} />
      <polyline className="sis-spark__linea" points={linea} />
    </svg>
  );
}

/* ─────────────────────────── Tarjeta ─────────────────────────── */

function Tarjeta({
  titulo,
  pct,
  ambar,
  rojo,
  filas,
  tendencia,
  destacado,
}: {
  titulo: string;
  pct: number | null;
  ambar: number;
  rojo: number;
  // Detalle como filas etiqueta→valor (lenguaje de ficha, no párrafo).
  filas: { label: string; valor: string; title?: string }[];
  tendencia?: number[];
  // Para el disco: el dato accionable (GB libres) en grande.
  destacado?: { valor: string; etiqueta: string };
}) {
  const n = nivel(pct, ambar, rojo);
  const chip = NIVEL_CHIP[n];
  return (
    <section className={`sis-card sis-card--${n}`} aria-label={titulo}>
      <div className="sis-card__head">
        <h2 className="sis-card__titulo">{titulo}</h2>
        <span className={chip.clase}>{chip.label}</span>
      </div>

      <div
        className="sis-card__medidor"
        role="progressbar"
        aria-valuenow={pct ?? undefined}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${titulo}: ${pct === null ? "sin dato" : pct + "%"}`}
      >
        <Medidor pct={pct} ambar={ambar} rojo={rojo} nivelActual={n} />
      </div>

      {tendencia ? (
        <div className="sis-card__tendencia">
          <Sparkline datos={tendencia} />
          <span className="sis-card__tendencia-label">tendencia · últimos 5 min</span>
        </div>
      ) : destacado ? (
        <div className="sis-card__destacado">
          <span className="sis-card__destacado-valor">{destacado.valor}</span>
          <span className="sis-card__destacado-etiqueta">{destacado.etiqueta}</span>
        </div>
      ) : null}

      <dl className="sis-card__filas">
        {filas.map((f) => (
          <div key={f.label} className="sis-card__fila">
            <dt>{f.label}</dt>
            <dd title={f.title}>{f.valor}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/* ─────────────────────────── Veredicto ───────────────────────────
   La conclusión en PALABRAS, para que nadie tenga que interpretar números.
   Prioridad al peor estado; en empate gana el disco (es lo persistente y
   accionable), luego RAM, luego CPU. */

function veredicto(e: EstadoServidor): { nivel: Nivel; texto: string } {
  const d = e.disco;
  const items: { n: Nivel; texto: string; prioridad: number }[] = [
    {
      n: nivel(d?.pct ?? null, 80, 90),
      prioridad: 3,
      texto: d
        ? `el disco está al ${Math.round(d.pct)}% — quedan ${gb(d.totalBytes - d.usadoBytes)} libres`
        : "no se pudo leer el disco",
    },
    {
      n: nivel(e.ram.pct, 85, 95),
      prioridad: 2,
      texto: `la memoria está al ${Math.round(e.ram.pct)}%`,
    },
    {
      n: nivel(e.cpu.pct, 80, 95),
      prioridad: 1,
      texto: `el procesador está al ${Math.round(e.cpu.pct ?? 0)}%`,
    },
  ];
  const orden: Record<Nivel, number> = { rojo: 3, ambar: 2, nd: 1, ok: 0 };
  const peor = [...items].sort(
    (a, b) => orden[b.n] - orden[a.n] || b.prioridad - a.prioridad,
  )[0];
  if (peor.n === "ok")
    return { nivel: "ok", texto: "Todo en orden. El equipo trabaja con holgura." };
  if (peor.n === "nd") return { nivel: "nd", texto: `Sin dato: ${peor.texto}.` };
  return {
    nivel: peor.n,
    texto:
      peor.n === "rojo"
        ? `Acción necesaria: ${peor.texto}.`
        : `Atención: ${peor.texto}.`,
  };
}

/* ─────────────────────────── Página ─────────────────────────── */

export function SistemaClient({ inicial }: { inicial: EstadoServidor }) {
  const [estado, setEstado] = useState<EstadoServidor>(inicial);
  const [error, setError] = useState<string | null>(null);
  const [historial, setHistorial] = useState<{ cpu: number[]; ram: number[] }>({
    cpu: inicial.cpu.pct !== null ? [inicial.cpu.pct] : [],
    ram: [inicial.ram.pct],
  });
  const enVuelo = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function sondear() {
      if (enVuelo.current || document.hidden) return;
      enVuelo.current = true;
      try {
        const r = await getEstadoServidor();
        if (cancelled) return;
        if (r.ok && r.data) {
          const data = r.data;
          setEstado(data);
          setHistorial((h) => ({
            cpu:
              data.cpu.pct !== null
                ? [...h.cpu, data.cpu.pct].slice(-MAX_MUESTRAS)
                : h.cpu,
            ram: [...h.ram, data.ram.pct].slice(-MAX_MUESTRAS),
          }));
          setError(null);
        } else if (!r.ok) {
          setError(r.error);
        }
      } catch {
        // La invocación de la server action puede RECHAZAR (servidor caído,
        // red cortada): sin este catch la UI quedaría congelada sin aviso.
        if (!cancelled) setError("No se pudo contactar al servidor.");
      } finally {
        enVuelo.current = false;
      }
    }
    const timer = setInterval(sondear, POLL_MS);
    function onVisible() {
      if (!document.hidden) void sondear();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const d = estado.disco;
  const v = veredicto(estado);

  return (
    <div className="sis-page">
      <header className="sis-head">
        <div>
          <h1>Servidor</h1>
          <span className="sis-head__sub">
            Recursos del equipo que sostiene el sistema
          </span>
        </div>
        <div className="sis-head__datos">
          <span className="sis-head__dato">
            <Icon name="device" size={14} /> {estado.host}
          </span>
          <span className="sis-head__dato">{estado.plataforma} ({estado.arquitectura})</span>
          <span className="sis-head__dato">
            <Icon name="clock" size={14} /> encendido hace {uptimeTexto(estado.uptimeSeg)}
          </span>
        </div>
      </header>

      {/* El veredicto: la conclusión en palabras, coloreada por el peor estado. */}
      <div className={`sis-veredicto sis-veredicto--${v.nivel}`} role="status">
        <span className="sis-veredicto__punto" aria-hidden="true" />
        <span>{v.texto}</span>
      </div>

      {error && (
        <div className="sis-error">
          <Icon name="info" size={16} />
          <span>{error} Se reintenta automáticamente.</span>
        </div>
      )}

      <div className="sis-grid">
        <Tarjeta
          titulo="Procesador"
          pct={estado.cpu.pct}
          ambar={80}
          rojo={95}
          tendencia={historial.cpu}
          filas={[
            { label: "Núcleos", valor: String(estado.cpu.nucleos) },
            { label: "Modelo", valor: estado.cpu.modelo, title: estado.cpu.modelo },
          ]}
        />
        <Tarjeta
          titulo="Memoria RAM"
          pct={estado.ram.pct}
          ambar={85}
          rojo={95}
          tendencia={historial.ram}
          filas={[
            { label: "En uso", valor: gb(estado.ram.usadoBytes) },
            { label: "Total", valor: gb(estado.ram.totalBytes) },
          ]}
        />
        {d ? (
          <Tarjeta
            titulo="Disco del sistema"
            pct={d.pct}
            ambar={80}
            rojo={90}
            destacado={{ valor: gb(d.totalBytes - d.usadoBytes), etiqueta: "libres" }}
            filas={[
              { label: "En uso", valor: gb(d.usadoBytes) },
              { label: "Total", valor: gb(d.totalBytes) },
            ]}
          />
        ) : (
          <Tarjeta
            titulo="Disco del sistema"
            pct={null}
            ambar={80}
            rojo={90}
            filas={[{ label: "Estado", valor: "No disponible en este equipo" }]}
          />
        )}
      </div>

      <p className="sis-meta">
        <span
          className={`sis-meta__pulso${error ? " sis-meta__pulso--off" : ""}`}
          aria-hidden="true"
        />
        {error ? "Sin conexión" : "En vivo"} · se actualiza cada {POLL_MS / 1000} s
        · última lectura:{" "}
        {/* El formato de hora difiere entre el ICU de Node y el del navegador
            ("p. m." vs "p.m."): sin esto, React acusa hydration mismatch. El
            sondeo la refresca a los 5 s de todos modos. */}
        <span suppressHydrationWarning>
          {new Date(estado.tomadoEn).toLocaleTimeString("es-PE")}
        </span>
      </p>
    </div>
  );
}
