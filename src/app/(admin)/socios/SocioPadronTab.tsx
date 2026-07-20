"use client";

import { useEffect, useState } from "react";
import { getPadronHistoricoSocio } from "./actions";
import type { AntiguedadSocio } from "@/lib/padron/types";

// Antigüedad del socio según el padrón histórico (4 empadronamientos). El
// agregado NUNCA se muestra solo: va siempre con el puesto que lo justifica,
// porque antes de 2021 la fuente no trae documento y la identidad se infiere
// por continuidad de nombre en un puesto concreto — un dato que no se puede
// auditar de un vistazo no sirve para asignar un derecho.
export function SocioPadronTab({ socioId }: { socioId: string }) {
  const [data, setData] = useState<AntiguedadSocio | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await getPadronHistoricoSocio(socioId);
      if (cancelled) return;
      if (r.ok) setData(r.data ?? null);
      else setError(r.error ?? "Error");
      setCargando(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [socioId]);

  if (error) return <p className="soc-error">{error}</p>;
  if (cargando) return <p style={{ color: "var(--text-muted)" }}>Cargando…</p>;
  if (!data) return null;

  if (data.porPuesto.length === 0) {
    return (
      <p style={{ color: "var(--text-muted)" }}>
        El socio no tiene puestos vigentes, así que no hay antigüedad
        derivable del padrón histórico.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        style={{
          padding: "12px 14px",
          border: "1px solid var(--border)",
          borderRadius: 10,
          background: "var(--bg-soft)",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>
          {data.desdeGestion
            ? `Socio desde ${data.desdeGestion}`
            : "Sin antigüedad registrada"}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {data.puestoQueLoJustifica
            ? `Acreditado por el puesto ${data.puestoQueLoJustifica}.`
            : "No se pudo acreditar que este socio sea el titular continuo de ninguno de sus puestos en los empadronamientos anteriores. Eso no significa que el puesto carezca de historia: revisa la pestaña de historial del puesto para ver a sus titulares previos."}
        </div>
      </div>

      <div>
        <div
          style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}
        >
          Detalle por puesto
        </div>
        {data.porPuesto.map((p) => (
          <div
            key={p.puestoId}
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "6px 0",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <span style={{ fontFamily: "monospace" }}>{p.puestoCodigo}</span>
            <span
              style={{ color: p.desdeGestion ? undefined : "var(--text-muted)" }}
            >
              {p.desdeGestion ?? "Sin registro previo"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
