"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/admin/Icon";
import { listPuestosForPlano } from "./actions";
import { armarPlano, celdasSerpiente, celdasColumnaU } from "@/lib/puestos/plano";
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
  focusSocioId = null,
  onClearFocus,
}: {
  etapa: number;
  onEtapa: (n: number) => void;
  onSelect: (id: string) => void;
  canWrite: boolean;
  onGenerar: () => void;
  focusSocioId?: string | null;
  onClearFocus?: () => void;
}) {
  const [cells, setCells] = useState<PlanoCell[] | null>(null);
  const [colorBy, setColorBy] = useState<ColorBy>("estado");
  const rootRef = useRef<HTMLDivElement>(null);

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

  // Puestos del socio enfocado (al venir desde /socios). Deriva nombre y conteo
  // de las propias celdas, y al cargar lleva la primera a la vista.
  const focusCells =
    focusSocioId && cells
      ? cells.filter((c) => c.socioActual?.id === focusSocioId)
      : [];
  const focusNombre = focusCells[0]?.socioActual?.nombre ?? null;
  const focusing = !!focusSocioId;

  useEffect(() => {
    if (!focusSocioId || !cells) return;
    const el = rootRef.current?.querySelector<HTMLElement>('[data-focus="1"]');
    el?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  }, [focusSocioId, cells]);

  // El plano físico tiene el bloque A a la DERECHA (orden M…A) y numera en
  // serpentina: izquierda sube (1 abajo) y derecha baja (ver celdasSerpiente).
  const plano = cells ? armarPlano(cells, { orden: "M-A" }) : null;

  const renderPuesto = (c: PlanoCell) => {
    // El número mostrado es el número OFICIAL del puesto (el del padrón/Excel).
    const nro = c.numero;
    // El ocupante fue importado sin DNI (placeholder): se marca con anillo ámbar
    // para diferenciarlo, sin tapar el color por estado/giro.
    const sinDni = !!c.socioActual?.sinDni;
    // Puesto del socio enfocado (al venir desde /socios): se resalta.
    const isFocus = !!focusSocioId && c.socioActual?.id === focusSocioId;
    const giroBg =
      colorBy === "giro" ? (c.giro ? GIRO_COLOR[c.giro] : "#e5e7eb") : undefined;
    const cls = [
      "pst-cell",
      c.esAlquiler
        ? "pst-cell--alquiler"
        : colorBy === "estado"
          ? `pst-cell--${c.estado}`
          : "",
      sinDni ? "pst-cell--sin-dni" : "",
      isFocus ? "pst-cell--focus" : "",
    ]
      .filter(Boolean)
      .join(" ");
    return (
      <button
        key={c.id}
        type="button"
        className={cls}
        data-focus={isFocus ? "1" : undefined}
        style={
          !c.esAlquiler && giroBg
            ? { background: giroBg, color: "#fff", borderColor: giroBg }
            : undefined
        }
        title={
          c.esAlquiler
            ? `${c.codigo} · En alquiler (propiedad de la asociación)`
            : `${c.codigo} · Puesto ${nro}${
                c.giro ? " · " + GIRO_LABEL[c.giro] : ""
              } · ${c.socioActual ? c.socioActual.nombre : "Libre"}${
                sinDni ? " · SIN DNI" : ""
              }`
        }
        onClick={() => onSelect(c.id)}
      >
        {c.esAlquiler ? "ALQUILER" : nro}
      </button>
    );
  };

  return (
    <div className="pst-plano-wrap" ref={rootRef}>
      {focusing && (
        <div className="pst-focus-bar">
          <Icon name="home" size={15} />
          <span className="pst-focus-bar__txt">
            {focusCells.length > 0 ? (
              <>
                Resaltando los puestos de <strong>{focusNombre}</strong> ·{" "}
                {focusCells.length}{" "}
                {focusCells.length === 1 ? "puesto" : "puestos"} en la Etapa{" "}
                {etapa}
              </>
            ) : (
              <>Este socio no tiene puestos en la Etapa {etapa}.</>
            )}
          </span>
          {onClearFocus && (
            <button
              type="button"
              className="pst-focus-bar__clear"
              onClick={onClearFocus}
            >
              Limpiar
            </button>
          )}
        </div>
      )}
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
        <div
          className={`pst-plano-scroll ${
            focusing && focusCells.length > 0 ? "pst-plano--focusing" : ""
          }`}
        >
          <div className="pst-plano__calle">Av. Los Próceres</div>
          <div className="pst-plano">
            <span className="pst-plano__puerta">{etapa === 2 ? "P4" : "P1"}</span>
            <div className="pst-plano__bloques">
              {plano.bloques.map((b) => (
                <div className="pst-plano__bloque" key={b.bloque}>
                  {b.bandas.map((band) => {
                    // Etapa 2: la grilla 2×18 se muestra en 3 sub-bloques de
                    // 2×6, manteniendo la numeración en U continua.
                    if (etapa === 2) {
                      // Columna M: sub-bloques de 1×6 (una sola columna), #1
                      // abajo. Solo 18 puestos (no tiene la columna izquierda).
                      if (b.bloque === "M") {
                        const col = [...band.cells].reverse(); // 18→1 (arriba→abajo)
                        const subs: PlanoCell[][] = [];
                        for (let i = 0; i < col.length; i += 6)
                          subs.push(col.slice(i, i + 6));
                        return subs.map((sub, si) => (
                          <div
                            className="pst-plano__banda pst-plano__banda--uno"
                            key={`${band.banda}-${si}`}
                          >
                            {sub.map(renderPuesto)}
                          </div>
                        ));
                      }
                      const ordered = celdasColumnaU(band.cells);
                      const subs: PlanoCell[][] = [];
                      for (let i = 0; i < ordered.length; i += 12)
                        subs.push(ordered.slice(i, i + 12));
                      return subs.map((sub, si) => (
                        <div className="pst-plano__banda" key={`${band.banda}-${si}`}>
                          {sub.map(renderPuesto)}
                        </div>
                      ));
                    }
                    // Bloque M: media fila → una sola columna vertical (#1 abajo).
                    if (b.bloque === "M") {
                      const col = [...band.cells].reverse();
                      return (
                        <div
                          className="pst-plano__banda pst-plano__banda--uno"
                          key={band.banda}
                        >
                          {col.map(renderPuesto)}
                        </div>
                      );
                    }
                    // Etapa 1: serpentina por banda; el SS-HH se dibuja como un
                    // solo recuadro unido y los almacenes como celdas marcadas.
                    // Banda con SS-HH o alquiler (p.ej. A baja): layout fijo
                    // arriba→abajo → puestos (por número) · alquiler · SS-HH, en
                    // vez de serpentina, para que el SS-HH quede abajo (pegado a
                    // la calle) como en el plano físico.
                    const rank = (c: PlanoCell) =>
                      c.tipo === "sshh" ? 2 : c.esAlquiler ? 1 : 0;
                    const ordered = band.cells.some(
                      (c) => c.esAlquiler || c.tipo === "sshh",
                    )
                      ? [...band.cells].sort(
                          (a, b) => rank(a) - rank(b) || a.numero - b.numero,
                        )
                      : celdasSerpiente(band.cells);
                    const sshh = ordered.filter((c) => c.tipo === "sshh");
                    const visibles = ordered.filter((c) => c.tipo !== "sshh");
                    return (
                      <div className="pst-plano__banda" key={band.banda}>
                        {visibles.map((c) =>
                          c.tipo === "almacen" ? (
                            <div
                              key={c.id}
                              className="pst-cell pst-cell--almacen"
                              title={`${c.codigo} · Almacén`}
                            >
                              Alm
                            </div>
                          ) : (
                            renderPuesto(c)
                          ),
                        )}
                        {sshh.length > 0 && (
                          <div
                            className="pst-cell pst-cell--sshh"
                            title="Servicios higiénicos"
                          >
                            SS-HH
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div className="pst-plano__bloque-label">{b.bloque}</div>
                </div>
              ))}
            </div>
            <span className="pst-plano__puerta">{etapa === 2 ? "P3" : "P2"}</span>
          </div>
        </div>
      )}
    </div>
  );
}
