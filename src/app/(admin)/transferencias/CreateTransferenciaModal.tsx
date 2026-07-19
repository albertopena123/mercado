"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Icon } from "@/components/admin/Icon";
import { useToast } from "@/components/admin/toast";
import { useEscClose } from "@/lib/ui/useEscClose";
import { buscarSociosConPuesto, createTransferenciasLote } from "./actions";
import { AdquirienteFields, emptyAdq, type AdqValue } from "./AdquirienteFields";
import type { TransferenteOption, LineaTransferenciaInput } from "./types";

function hoyISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(
    new Date(),
  );
}

export function CreateTransferenciaModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (ids: string[]) => void;
}) {
  const toast = useToast();

  // Transferente
  const [tq, setTq] = useState("");
  const [tResults, setTResults] = useState<TransferenteOption[]>([]);
  const [tSel, setTSel] = useState<TransferenteOption | null>(null);
  const tReqRef = useRef(0);

  // Puestos seleccionados (varios) y su precio interno opcional.
  const [selected, setSelected] = useState<string[]>([]);
  const [montos, setMontos] = useState<Record<string, string>>({});

  // Comprador: mismo para todos, o uno por puesto.
  const [sameBuyer, setSameBuyer] = useState(true);
  const [adqShared, setAdqShared] = useState<AdqValue>(emptyAdq);
  const [adqPorPuesto, setAdqPorPuesto] = useState<Record<string, AdqValue>>({});

  const [fecha, setFecha] = useState(hoyISO());
  const [submitting, setSubmitting] = useState(false);

  useEscClose(true, onClose, submitting);

  // Búsqueda del transferente (debounce).
  useEffect(() => {
    if (tSel || tq.trim().length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      const reqId = ++tReqRef.current;
      const res = await buscarSociosConPuesto(tq);
      if (reqId !== tReqRef.current) return;
      setTResults(res.ok ? res.data! : []);
    }, 350);
    return () => clearTimeout(timer);
  }, [tq, tSel]);

  function pickTransferente(t: TransferenteOption) {
    setTSel(t);
    setTResults([]);
    setTq(`${t.nombre} (${t.codigo})`);
    // Preselecciona si solo tiene un puesto.
    setSelected(t.puestos.length === 1 ? [t.puestos[0].id] : []);
    setMontos({});
    setAdqPorPuesto({});
  }
  function clearTransferente() {
    setTSel(null);
    setTq("");
    setSelected([]);
    setMontos({});
    setAdqPorPuesto({});
  }

  function togglePuesto(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function adqFor(id: string): AdqValue {
    return sameBuyer ? adqShared : (adqPorPuesto[id] ?? emptyAdq);
  }
  function setAdqFor(id: string, v: AdqValue) {
    setAdqPorPuesto((prev) => ({ ...prev, [id]: v }));
  }

  const selPuestos = (tSel?.puestos ?? []).filter((p) => selected.includes(p.id));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (!tSel) {
      toast.error("Selecciona el socio transferente.");
      return;
    }
    if (selected.length === 0) {
      toast.error("Selecciona al menos un puesto a transferir.");
      return;
    }

    // Validación mínima por línea (el servidor revalida todo).
    const lineas: LineaTransferenciaInput[] = [];
    for (const p of selPuestos) {
      const a = adqFor(p.id);
      const dni = a.dni.trim();
      if (!/^\d{8}$/.test(dni) || !a.apellidoPaterno.trim() || !a.nombres.trim()) {
        toast.error(
          `Completa los datos del comprador del puesto ${p.codigo} (DNI, apellido paterno y nombres).`,
        );
        return;
      }
      const montoStr = (montos[p.id] ?? "").trim();
      lineas.push({
        puestoId: p.id,
        monto: montoStr ? Number(montoStr) : null,
        adqTipoDocumento: "DNI",
        adqNumeroDocumento: dni,
        adqApellidoPaterno: a.apellidoPaterno.trim(),
        adqApellidoMaterno: a.apellidoMaterno.trim() || undefined,
        adqNombres: a.nombres.trim(),
        adqEstadoCivil: a.estadoCivil.trim() || undefined,
        adqDireccion: a.direccion.trim() || undefined,
        adqDistrito: a.distrito.trim() || undefined,
        adqProvincia: a.provincia.trim() || undefined,
        adqDepartamento: a.departamento.trim() || undefined,
        adqTelefono: a.telefono.trim() || undefined,
      });
    }

    setSubmitting(true);
    const res = await createTransferenciasLote({
      transferenteId: tSel.id,
      fecha,
      lineas,
    });
    setSubmitting(false);

    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    const { created, failed } = res.data!;
    if (failed.length > 0) {
      const codigoDe = (pid: string) =>
        tSel.puestos.find((p) => p.id === pid)?.codigo ?? pid;
      toast.error(
        `No se crearon ${failed.length}: ${failed
          .map((f) => `${codigoDe(f.puestoId)} (${f.error})`)
          .join("; ")}`,
      );
    }
    if (created.length > 0) {
      toast.success(
        created.length === 1
          ? "Expediente creado en borrador."
          : `${created.length} expedientes creados en borrador.`,
      );
      onCreated(created.map((c) => c.id));
    }
  }

  return (
    <div className="modal-backdrop" onClick={() => !submitting && onClose()}>
      <form
        className="modal"
        style={{ maxWidth: 640 }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <header className="modal__head">
          <h2>Nueva transferencia de puesto(s)</h2>
          <button
            type="button"
            className="iconbtn"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <Icon name="close" size={20} />
          </button>
        </header>

        <div className="modal__body">
          {/* Transferente */}
          <h4 style={{ margin: "0 0 8px" }}>Transferente (socio actual)</h4>
          <label className="field" style={{ position: "relative" }}>
            <span className="field__label">
              Buscar socio<span className="field__req">*</span>
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={tq}
                onChange={(e) => setTq(e.target.value)}
                placeholder="Nombre o código del socio…"
                disabled={submitting || !!tSel}
                style={{ flex: 1 }}
              />
              {tSel && (
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={clearTransferente}
                  disabled={submitting}
                >
                  Cambiar
                </button>
              )}
            </div>
            {tResults.length > 0 && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  right: 0,
                  zIndex: 10,
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  marginTop: 4,
                  maxHeight: 220,
                  overflow: "auto",
                  boxShadow: "var(--shadow-sm)",
                }}
              >
                {tResults.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => pickTransferente(t)}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "8px 12px",
                      border: 0,
                      background: "transparent",
                      cursor: "pointer",
                      fontSize: 13.5,
                    }}
                  >
                    {t.nombre}{" "}
                    <span style={{ color: "var(--text-muted)" }}>
                      · {t.codigo} · {t.puestos.length} puesto(s)
                    </span>
                  </button>
                ))}
              </div>
            )}
          </label>

          {/* Puestos a transferir (varios) */}
          {tSel && (
            <div className="field">
              <span className="field__label">
                Puestos a transferir<span className="field__req">*</span>
              </span>
              <div className="tr-pick">
                {tSel.puestos.map((p) => {
                  const on = selected.includes(p.id);
                  return (
                    <label
                      key={p.id}
                      className={`tr-pick__row${on ? " is-on" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => togglePuesto(p.id)}
                        disabled={submitting}
                      />
                      <span className="tr-pick__txt">
                        <span className="tr-pick__code">{p.codigo}</span>
                        <span className="tr-pick__meta">
                          {p.dimensionLabel}
                          {p.giroLabel ? ` · ${p.giroLabel}` : ""}
                        </span>
                      </span>
                      {on && (
                        <span
                          className="tr-pick__price"
                          // El clic en el precio no debe alternar la casilla.
                          onClick={(e) => e.preventDefault()}
                        >
                          <span>S/</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={montos[p.id] ?? ""}
                            onChange={(e) =>
                              setMontos((m) => ({
                                ...m,
                                [p.id]: e.target.value,
                              }))
                            }
                            placeholder="Precio"
                            disabled={submitting}
                          />
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
              <p className="tr-pick__hint">
                Se crea un expediente por cada puesto seleccionado. El precio es
                opcional y de uso interno.
              </p>
            </div>
          )}

          {/* Comprador(es) */}
          {tSel && selected.length > 0 && (
            <>
              <h4 style={{ margin: "18px 0 8px" }}>Adquiriente(s)</h4>
              {selected.length > 1 && (
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 14,
                    marginBottom: 12,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={sameBuyer}
                    onChange={(e) => setSameBuyer(e.target.checked)}
                    disabled={submitting}
                  />
                  <span>Mismo comprador para todos los puestos</span>
                </label>
              )}

              {sameBuyer ? (
                <AdquirienteFields
                  value={adqShared}
                  onChange={setAdqShared}
                  disabled={submitting}
                />
              ) : (
                selPuestos.map((p) => (
                  <div key={p.id} style={{ marginBottom: 16 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "var(--text-muted)",
                        marginBottom: 6,
                      }}
                    >
                      Comprador del puesto {p.codigo}
                    </div>
                    <AdquirienteFields
                      value={adqFor(p.id)}
                      onChange={(v) => setAdqFor(p.id, v)}
                      disabled={submitting}
                    />
                  </div>
                ))
              )}
            </>
          )}

          {/* Datos del trámite */}
          {tSel && selected.length > 0 && (
            <>
              <h4 style={{ margin: "18px 0 8px" }}>Datos del trámite</h4>
              <label className="field" style={{ maxWidth: 260 }}>
                <span className="field__label">Fecha del contrato</span>
                <input
                  type="date"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  disabled={submitting}
                />
              </label>
              <p className="modal__intro" style={{ marginTop: 4 }}>
                Se crea <b>un expediente por puesto</b> en <b>borrador</b>. Desde
                cada detalle imprimes los documentos, subes la renuncia y el
                contrato <b>firmados</b>, y al <b>Formalizar</b> se mueve el
                puesto al comprador (si vende todos sus puestos, causa baja).
              </p>
            </>
          )}
        </div>

        <footer className="modal__foot">
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
            disabled={submitting || !tSel || selected.length === 0}
          >
            {submitting
              ? "Creando…"
              : selected.length > 1
                ? `Crear ${selected.length} expedientes`
                : "Crear expediente"}
          </button>
        </footer>
      </form>
    </div>
  );
}
