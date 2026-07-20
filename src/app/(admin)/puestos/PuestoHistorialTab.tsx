"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/admin/Icon";
import { getHistoricoPuesto } from "./actions";
import type { LinajePuesto } from "@/lib/padron/types";

// Línea de tiempo del puesto a través de los cuatro empadronamientos. Los slots
// SIN registro se muestran explícitamente: que una gestión no empadronara este
// puesto es información, no un hueco que convenga esconder.
export function PuestoHistorialTab({ puestoId }: { puestoId: string }) {
  const [data, setData] = useState<LinajePuesto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await getHistoricoPuesto(puestoId);
      if (cancelled) return;
      if (r.ok) setData(r.data ?? null);
      else setError(r.error ?? "Error");
      setCargando(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [puestoId]);

  if (error) return <p className="soc-error">{error}</p>;
  if (cargando) return <p style={{ color: "var(--text-muted)" }}>Cargando…</p>;
  if (!data || data.slots.length === 0) {
    return (
      <p style={{ color: "var(--text-muted)" }}>
        No hay padrón histórico cargado para este puesto.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {data.slots.map((s) => (
        <div
          key={s.orden}
          style={{
            borderLeft: "2px solid var(--border)",
            paddingLeft: 12,
            opacity: s.registro ? 1 : 0.55,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <strong style={{ fontSize: 13 }}>{s.gestion}</strong>
            {s.cambioDeTitular && (
              <span className="badge badge--amber" title="El titular cambió respecto de la gestión anterior con registro">
                <Icon name="external" size={11} /> Cambió de titular
              </span>
            )}
          </div>

          {s.registro ? (
            <>
              <div style={{ fontSize: 14 }}>{s.registro.nombre ?? "—"}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {s.registro.numeroPadron != null && <>Padrón N.° {s.registro.numeroPadron}</>}
                {s.registro.numeroDocumento && <> · DNI {s.registro.numeroDocumento}</>}
                {s.registro.socioId && <> · <b>identidad verificada</b></>}
              </div>
              {s.registro.observacion && (
                <div style={{ fontSize: 12, color: "var(--warn, #b45309)", marginTop: 2 }}>
                  {s.registro.observacion}
                </div>
              )}
            </>
          ) : (
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Sin registro</div>
          )}
        </div>
      ))}

      <div style={{ borderLeft: "2px solid var(--accent, #2563eb)", paddingLeft: 12 }}>
        <strong style={{ fontSize: 13 }}>Titular actual</strong>
        <div style={{ fontSize: 14 }}>{data.titularActual?.nombre ?? "Sin asignar"}</div>
      </div>
    </div>
  );
}
