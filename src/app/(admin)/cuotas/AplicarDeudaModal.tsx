"use client";

import { useState, type FormEvent } from "react";
import { Icon } from "@/components/admin/Icon";
import { useToast } from "@/components/admin/toast";
import { useEscClose } from "@/lib/ui/useEscClose";
import { formatSoles } from "@/lib/money";
import { aplicarDeudaASocios, buscarSociosParaDeuda } from "./actions";
import type { SocioPick } from "./types";

const ESTADO_LABEL: Record<string, string> = {
  activo: "Activo",
  suspendido: "Suspendido",
  retirado: "Retirado",
  fallecido: "Fallecido",
};

// Aplica una deuda puntual (concepto + periodo + monto) a un conjunto elegido de
// socios. El buscador usa la misma búsqueda tokenizada que el resto del módulo.
export function AplicarDeudaModal({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [concepto, setConcepto] = useState("");
  const [periodo, setPeriodo] = useState("");
  const [monto, setMonto] = useState("");
  const [vencimiento, setVenc] = useState("");

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SocioPick[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  // id -> socio elegido (se conserva aunque salga de los resultados de búsqueda).
  const [selected, setSelected] = useState<Map<string, SocioPick>>(new Map());

  const [fe, setFe] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);
  const toast = useToast();

  useEscClose(true, onClose, submitting);

  const montoNum = Number(monto);
  const valid =
    concepto.trim().length > 0 &&
    periodo.trim().length > 0 &&
    montoNum > 0 &&
    selected.size > 0;

  async function runSearch() {
    if (searching) return;
    setSearching(true);
    const res = await buscarSociosParaDeuda(query.trim());
    setSearching(false);
    setSearched(true);
    if (res.ok) setResults(res.data ?? []);
    else {
      setResults([]);
      toast.error(res.error);
    }
  }

  function toggle(s: SocioPick) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(s.id)) next.delete(s.id);
      else next.set(s.id, s);
      return next;
    });
  }

  function remove(id: string) {
    setSelected((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || submitting) return;
    setSubmitting(true);
    setFe({});
    const res = await aplicarDeudaASocios({
      socioIds: Array.from(selected.keys()),
      concepto: concepto.trim(),
      periodo: periodo.trim(),
      monto: montoNum,
      vencimiento: vencimiento || undefined,
    });
    setSubmitting(false);
    if (!res.ok) {
      toast.error(res.error ?? "No se pudo aplicar la deuda.");
      setFe((res.fieldErrors as Record<string, string>) ?? {});
      return;
    }
    const { creadas, omitidas, invalidos } = res.data!;
    setDoneMsg(
      `Se aplicó la deuda a ${creadas} socio(s).` +
        (omitidas > 0
          ? ` ${omitidas} ya tenían esta deuda (no se duplicó).`
          : "") +
        (invalidos > 0
          ? ` ${invalidos} no se encontraron y se omitieron.`
          : ""),
    );
  }

  const selectedList = Array.from(selected.values());

  return (
    <div className="modal-backdrop" onClick={() => !submitting && onClose()}>
      <form
        className="modal"
        style={{ maxWidth: 580, width: "100%" }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <header className="modal__head">
          <h2>Aplicar deuda a socios</h2>
          <button
            type="button"
            className="iconbtn"
            onClick={() => !submitting && onClose()}
            disabled={submitting}
            aria-label="Cerrar"
          >
            <Icon name="close" size={20} />
          </button>
        </header>

        <div className="modal__body">
          {doneMsg ? (
            <div
              className="soc-error"
              role="status"
              style={{ background: "#dcfce7", color: "#166534", borderColor: "#bbf7d0" }}
            >
              <Icon name="check" size={16} />
              <span>{doneMsg}</span>
            </div>
          ) : (
            <>
              <p className="modal__intro">
                Crea una cuota <b>pendiente</b> solo para los socios que elijas. Si
                un socio ya tiene esta misma deuda (mismo periodo y concepto), se
                omite (no se duplica).
              </p>

              <div className="soc-formgrid soc-formgrid--2col">
                <label className="field">
                  <span className="field__label">
                    Concepto<span className="field__req">*</span>
                  </span>
                  <input
                    value={concepto}
                    onChange={(e) => setConcepto(e.target.value)}
                    placeholder="Multa faena, Derrama, Cuota extraordinaria…"
                    aria-invalid={!!fe.concepto}
                    disabled={submitting}
                  />
                  {fe.concepto && <span className="field-error">{fe.concepto}</span>}
                </label>
                <label className="field">
                  <span className="field__label">
                    Monto (S/)<span className="field__req">*</span>
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={monto}
                    onChange={(e) => setMonto(e.target.value)}
                    aria-invalid={!!fe.monto}
                    disabled={submitting}
                  />
                  {fe.monto && <span className="field-error">{fe.monto}</span>}
                </label>
              </div>

              <div className="soc-formgrid soc-formgrid--2col">
                <label className="field">
                  <span className="field__label">
                    Periodo<span className="field__req">*</span>
                  </span>
                  <input
                    value={periodo}
                    onChange={(e) => setPeriodo(e.target.value)}
                    placeholder="2025, 2026-06, histórico…"
                    aria-invalid={!!fe.periodo}
                    disabled={submitting}
                  />
                  {fe.periodo && <span className="field-error">{fe.periodo}</span>}
                </label>
                <label className="field">
                  <span className="field__label">Vencimiento (opcional)</span>
                  <input
                    type="date"
                    value={vencimiento}
                    onChange={(e) => setVenc(e.target.value)}
                    disabled={submitting}
                  />
                </label>
              </div>

              <div className="field" style={{ marginTop: 4 }}>
                <span className="field__label">
                  Socios<span className="field__req">*</span>
                  {selected.size > 0 && (
                    <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>
                      {" "}
                      · {selected.size} seleccionado(s)
                    </span>
                  )}
                </span>

                {selectedList.length > 0 && (
                  <div className="cuo-chips">
                    {selectedList.map((s) => (
                      <span key={s.id} className="cuo-chip">
                        {s.nombre}
                        <button
                          type="button"
                          className="cuo-chip__x"
                          onClick={() => remove(s.id)}
                          aria-label={`Quitar ${s.nombre}`}
                          disabled={submitting}
                        >
                          <Icon name="close" size={13} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <div className="cuo-search">
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        runSearch();
                      }
                    }}
                    placeholder="Buscar socio por nombre, DNI o código…"
                    disabled={submitting}
                  />
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={runSearch}
                    disabled={searching || submitting}
                  >
                    <Icon name="search" size={16} />
                    <span>{searching ? "Buscando…" : "Buscar"}</span>
                  </button>
                </div>

                {fe.socios && <span className="field-error">{fe.socios}</span>}

                {searched && (
                  <div className="cuo-picker" role="list">
                    {results.length === 0 ? (
                      <p
                        style={{
                          color: "var(--text-muted)",
                          fontSize: 13,
                          padding: "10px 12px",
                          margin: 0,
                        }}
                      >
                        Sin resultados para esa búsqueda.
                      </p>
                    ) : (
                      results.map((s) => {
                        const checked = selected.has(s.id);
                        return (
                          <label key={s.id} className="cuo-picker__item" role="listitem">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggle(s)}
                              disabled={submitting}
                            />
                            <span className="cuo-picker__text">
                              <span className="cuo-picker__name">{s.nombre}</span>
                              <span className="cuo-picker__meta">
                                {s.codigo} · {s.documento}
                                {s.estado !== "activo" && (
                                  <span className="cuo-picker__estado">
                                    {" "}
                                    · {ESTADO_LABEL[s.estado] ?? s.estado}
                                  </span>
                                )}
                              </span>
                            </span>
                          </label>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <footer className="modal__foot">
          {doneMsg ? (
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => onDone(doneMsg)}
            >
              Listo
            </button>
          ) : (
            <>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={onClose}
                disabled={submitting}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="btn btn--primary"
                disabled={!valid || submitting}
                title={
                  !valid
                    ? "Completa concepto, periodo, monto y elige al menos un socio"
                    : undefined
                }
              >
                {submitting
                  ? "Aplicando…"
                  : `Aplicar${
                      selected.size > 0 ? ` a ${selected.size}` : ""
                    }${montoNum > 0 ? ` · ${formatSoles(montoNum)}` : ""}`}
              </button>
            </>
          )}
        </footer>
      </form>
    </div>
  );
}
