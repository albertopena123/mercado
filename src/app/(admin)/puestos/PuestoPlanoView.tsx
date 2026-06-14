"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/admin/Icon";
import { listPuestosForPlano } from "./actions";
import { armarPlano } from "@/lib/puestos/plano";
import {
  GIRO_COLOR,
  GIRO_LABEL,
  GIROS,
  ETAPAS,
} from "@/lib/puestos/giro";
import type { PlanoCell } from "./types";
import type { EstadoPuesto } from "@/generated/prisma/client";

type ColorBy = "estado" | "giro";

const ESTADOS: { key: EstadoPuesto; label: string }[] = [
  { key: "activo", label: "Activo" },
  { key: "vacio", label: "Vacío" },
  { key: "clausurado", label: "Clausurado" },
  { key: "construccion", label: "En obra" },
];

export function PuestoPlanoView({
  etapa,
  onEtapa,
  onSelect,
  canWrite,
  onGenerar,
}: {
  etapa: number;
  onEtapa: (n: number) => void;
  onSelect: (id: string) => void;
  canWrite: boolean;
  onGenerar: () => void;
}) {
  const [cells, setCells] = useState<PlanoCell[] | null>(null);
  const [colorBy, setColorBy] = useState<ColorBy>("estado");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setCells(null);
      const r = await listPuestosForPlano(etapa);
      if (!cancelled) setCells(r.ok ? (r.data ?? []) : []);
    })();
    return () => {
      cancelled = true;
    };
  }, [etapa]);

  const plano = cells ? armarPlano(cells) : null;

  return (
    <div className="pst-plano-wrap">
      <div className="pst-plano-controls">
        <div className="pst-seg">
          {ETAPAS.map((n) => (
            <button
              key={n}
              type="button"
              className={`pst-seg__btn ${etapa === n ? "is-on" : ""}`}
              onClick={() => onEtapa(n)}
            >
              Etapa {n}
            </button>
          ))}
        </div>
        <div className="pst-seg">
          <span className="pst-plano-controls__lbl">Color:</span>
          <button
            type="button"
            className={`pst-seg__btn ${colorBy === "estado" ? "is-on" : ""}`}
            onClick={() => setColorBy("estado")}
          >
            Estado
          </button>
          <button
            type="button"
            className={`pst-seg__btn ${colorBy === "giro" ? "is-on" : ""}`}
            onClick={() => setColorBy("giro")}
          >
            Giro
          </button>
        </div>
      </div>

      <div className="pst-legend">
        {colorBy === "estado"
          ? ESTADOS.map((e) => (
              <span className="pst-legend__item" key={e.key}>
                <span className={`pst-legend__dot pst-cell--${e.key}`} />
                {e.label}
              </span>
            ))
          : GIROS.map((g) => (
              <span className="pst-legend__item" key={g}>
                <span
                  className="pst-legend__dot"
                  style={{ background: GIRO_COLOR[g] }}
                />
                {GIRO_LABEL[g]}
              </span>
            ))}
      </div>

      {!plano ? (
        <p className="pst-plano-loading">Cargando plano…</p>
      ) : plano.bloques.length === 0 ? (
        <div className="socios-empty">
          <p>La Etapa {etapa} aún no tiene puestos.</p>
          {canWrite && (
            <button className="btn--cta" onClick={onGenerar}>
              <Icon name="apps" size={16} />
              <span>Generar grilla</span>
            </button>
          )}
        </div>
      ) : (
        <div className="pst-plano-scroll">
          <div className="pst-plano__calle">Av. Los Próceres</div>
          <div className="pst-plano">
            <span className="pst-plano__puerta">P1</span>
            <div className="pst-plano__bloques">
              {plano.bloques.map((b) => (
                <div className="pst-plano__bloque" key={b.bloque}>
                  {b.bandas.map((band) => (
                    <div className="pst-plano__banda" key={band.banda}>
                      {band.cells.map((c) => {
                        const giroBg =
                          colorBy === "giro"
                            ? c.giro
                              ? GIRO_COLOR[c.giro]
                              : "#e5e7eb"
                            : undefined;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            className={`pst-cell ${
                              colorBy === "estado" ? `pst-cell--${c.estado}` : ""
                            }`}
                            style={
                              giroBg
                                ? { background: giroBg, color: "#fff", borderColor: giroBg }
                                : undefined
                            }
                            title={`${c.codigo}${
                              c.giro ? " · " + GIRO_LABEL[c.giro] : ""
                            } · ${c.socioActual ? c.socioActual.nombre : "Libre"}`}
                            onClick={() => onSelect(c.id)}
                          >
                            {c.numero}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                  <div className="pst-plano__bloque-label">{b.bloque}</div>
                </div>
              ))}
            </div>
            <span className="pst-plano__puerta">P2</span>
          </div>
        </div>
      )}
    </div>
  );
}
