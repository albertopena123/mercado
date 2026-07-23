"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/admin/Icon";
import { getHistoricoCompletoSocio } from "./actions";
import type { AntiguedadSocio, LinajePuesto } from "@/lib/padron/types";

// Padrón histórico del socio (SOLO LECTURA). Muestra dos cosas:
//   1. El agregado de antigüedad (el empadronamiento más antiguo entre sus
//      puestos), con el puesto que lo justifica.
//   2. La línea de tiempo COMPLETA de cada puesto vigente: quién fue el titular
//      en cada gestión (2014 → 2017 → 2019 → 2021 → actual). Así se ve toda la
//      historia y no solo el resumen — la ausencia de registro en una gestión se
//      muestra explícita, no se esconde.
export function SocioPadronTab({ socioId }: { socioId: string }) {
  const [antiguedad, setAntiguedad] = useState<AntiguedadSocio | null>(null);
  const [linajes, setLinajes] = useState<LinajePuesto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await getHistoricoCompletoSocio(socioId);
      if (cancelled) return;
      if (r.ok) {
        setAntiguedad(r.data?.antiguedad ?? null);
        setLinajes(r.data?.linajes ?? []);
      } else setError(r.error ?? "Error");
      setCargando(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [socioId]);

  if (error) return <p className="soc-error">{error}</p>;
  if (cargando) return <p style={{ color: "var(--text-muted)" }}>Cargando…</p>;
  if (!antiguedad) return null;

  if (antiguedad.porPuesto.length === 0) {
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
          {antiguedad.desdeGestion
            ? `Socio desde ${antiguedad.desdeGestion}`
            : "Sin antigüedad registrada"}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {antiguedad.puestoQueLoJustifica
            ? `Acreditado por el puesto ${antiguedad.puestoQueLoJustifica}. Abajo la historia completa de cada puesto.`
            : "No se pudo acreditar de forma automática una antigüedad continua. Revisa abajo la historia de cada puesto: los nombres constan tal como se empadronaron."}
        </div>
      </div>

      {linajes.map((linaje) => (
        <div key={linaje.puestoId}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8, fontFamily: "monospace" }}>
            {linaje.puestoCodigo}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {linaje.slots.map((s) => (
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
                    <span
                      className="badge badge--amber"
                      title="El nombre difiere respecto de la gestión anterior con registro"
                    >
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
                      <div style={{ fontSize: 12, color: "var(--warn)", marginTop: 2 }}>
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
              <div style={{ fontSize: 14 }}>{linaje.titularActual?.nombre ?? "Sin asignar"}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
