"use client";

import "./sistema.css";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/admin/Icon";
import { getEstadoServidor } from "./actions";
import type { EstadoServidor } from "@/lib/sistema/metrics";

// Cada cuánto se sondea con la pestaña visible (mismo patrón que la campana
// del portal: sin solapes y sin gastar de fondo con la pestaña oculta).
const POLL_MS = 5_000;

type Nivel = "ok" | "ambar" | "rojo" | "nd";

// Umbrales del semáforo (del spec).
function nivel(pct: number | null, ambar: number, rojo: number): Nivel {
  if (pct === null) return "nd";
  if (pct >= rojo) return "rojo";
  if (pct >= ambar) return "ambar";
  return "ok";
}

// Chip del semáforo con las clases globales de badge (tematizadas en oscuro).
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

function Tarjeta({
  titulo,
  pct,
  detalle,
  ambar,
  rojo,
  extra,
}: {
  titulo: string;
  pct: number | null;
  detalle: string;
  ambar: number;
  rojo: number;
  extra?: string;
}) {
  const n = nivel(pct, ambar, rojo);
  const chip = NIVEL_CHIP[n];
  return (
    <div className="sis-card">
      <div className="sis-card__head">
        <span className="sis-card__titulo">{titulo}</span>
        <span className={chip.clase}>{chip.label}</span>
      </div>

      <div className="sis-card__valor">{pct === null ? "—" : `${pct}%`}</div>

      <div
        className="sis-bar"
        role="progressbar"
        aria-valuenow={pct ?? undefined}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${titulo}: ${pct === null ? "sin dato" : pct + "%"}`}
      >
        <div
          className={`sis-bar__fill sis-bar__fill--${n}`}
          style={{ width: `${pct ?? 0}%` }}
        />
      </div>

      <div className="sis-card__detalle">
        {detalle}
        {extra ? <span style={{ display: "block" }}>{extra}</span> : null}
      </div>
    </div>
  );
}

export function SistemaClient({ inicial }: { inicial: EstadoServidor }) {
  const [estado, setEstado] = useState<EstadoServidor>(inicial);
  const [error, setError] = useState<string | null>(null);
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
          setEstado(r.data);
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

  return (
    <div className="socios-page">
      <header className="socios-page__header">
        <div>
          <h1 className="socios-page__title">Servidor</h1>
          <span className="socios-page__sub">
            {estado.host} · {estado.plataforma} ({estado.arquitectura}) · encendido
            hace {uptimeTexto(estado.uptimeSeg)}
          </span>
        </div>
      </header>

      {error && (
        <div className="sis-error">
          <Icon name="info" size={16} />
          <span>{error} Se reintenta automáticamente.</span>
        </div>
      )}

      <div className="sis-grid">
        <Tarjeta
          titulo="Procesador (CPU)"
          pct={estado.cpu.pct}
          ambar={80}
          rojo={95}
          detalle={`${estado.cpu.nucleos} núcleos`}
          extra={estado.cpu.modelo}
        />
        <Tarjeta
          titulo="Memoria (RAM)"
          pct={estado.ram.pct}
          ambar={85}
          rojo={95}
          detalle={`${gb(estado.ram.usadoBytes)} usados de ${gb(estado.ram.totalBytes)}`}
        />
        {d ? (
          <Tarjeta
            titulo="Disco (donde vive el sistema)"
            pct={d.pct}
            ambar={80}
            rojo={90}
            detalle={`${gb(d.usadoBytes)} usados de ${gb(d.totalBytes)}`}
            extra={`Libre: ${gb(d.totalBytes - d.usadoBytes)}`}
          />
        ) : (
          <Tarjeta
            titulo="Disco (donde vive el sistema)"
            pct={null}
            ambar={80}
            rojo={90}
            detalle="No disponible en este equipo."
          />
        )}
      </div>

      <p className="sis-meta">
        Se actualiza cada {POLL_MS / 1000} s · última lectura:{" "}
        {new Date(estado.tomadoEn).toLocaleTimeString("es-PE")}
      </p>
    </div>
  );
}
