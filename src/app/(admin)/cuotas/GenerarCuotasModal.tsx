"use client";

import { useState, type FormEvent } from "react";
import { Icon } from "@/components/admin/Icon";
import { useEscClose } from "@/lib/ui/useEscClose";
import { generarCuotasPeriodo } from "./actions";

function currentPeriodo(): string {
  // Sin Date.now disponible en otros contextos; aquí es cliente, OK.
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function GenerarCuotasModal({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const [periodo, setPeriodo] = useState(currentPeriodo());
  const [monto, setMonto] = useState("20");
  const [concepto, setConcepto] = useState("");
  const [vencimiento, setVenc] = useState("");
  const [topError, setTopError] = useState<string | null>(null);
  const [fe, setFe] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);

  useEscClose(true, onClose, submitting);

  const valid = /^\d{4}-(0[1-9]|1[0-2])$/.test(periodo) && Number(monto) > 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || submitting) return;
    setSubmitting(true);
    setTopError(null);
    setFe({});
    const res = await generarCuotasPeriodo({
      periodo,
      monto: Number(monto),
      concepto: concepto.trim() || undefined,
      vencimiento: vencimiento || undefined,
    });
    setSubmitting(false);
    if (!res.ok) {
      setTopError(res.error ?? "No se pudieron generar las cuotas.");
      setFe((res.fieldErrors as Record<string, string>) ?? {});
      return;
    }
    const { creadas, existentes } = res.data!;
    setDoneMsg(
      `Se generaron ${creadas} cuota(s).` +
        (existentes > 0
          ? ` ${existentes} socio(s) ya tenían cuota de este periodo.`
          : ""),
    );
  }

  return (
    <div className="modal-backdrop" onClick={() => !submitting && onClose()}>
      <form
        className="modal modal--sm"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <header className="modal__head">
          <h2>Generar cuotas del periodo</h2>
          <button type="button" className="iconbtn" onClick={() => !submitting && onClose()} disabled={submitting} aria-label="Cerrar">
            <Icon name="close" size={20} />
          </button>
        </header>

        <div className="modal__body">
          {doneMsg ? (
            <div className="soc-error" role="status" style={{ background: "#dcfce7", color: "#166534", borderColor: "#bbf7d0" }}>
              <Icon name="check" size={16} />
              <span>{doneMsg}</span>
            </div>
          ) : (
            <>
              <p className="modal__intro">
                Crea una cuota <b>pendiente</b> para cada socio activo. Si un
                socio ya tiene cuota de este periodo, se omite (no se duplica).
              </p>
              {topError && (
                <div className="soc-error" role="alert" style={{ marginBottom: 16 }}>
                  <Icon name="info" size={16} />
                  <span>{topError}</span>
                </div>
              )}
              <div className="soc-formgrid soc-formgrid--2col">
                <label className="field">
                  <span className="field__label">
                    Periodo<span className="field__req">*</span>
                  </span>
                  <input
                    value={periodo}
                    onChange={(e) => setPeriodo(e.target.value)}
                    placeholder="2026-05"
                    aria-invalid={!!fe.periodo}
                    disabled={submitting}
                  />
                  {fe.periodo && <span className="field-error">{fe.periodo}</span>}
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
              <label className="field">
                <span className="field__label">Concepto</span>
                <input
                  value={concepto}
                  onChange={(e) => setConcepto(e.target.value)}
                  placeholder={`Cuota mensual ${periodo}`}
                  disabled={submitting}
                />
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
            </>
          )}
        </div>

        <footer className="modal__foot">
          {doneMsg ? (
            <button type="button" className="btn btn--primary" onClick={onDone}>
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
              >
                {submitting ? "Generando…" : "Generar cuotas"}
              </button>
            </>
          )}
        </footer>
      </form>
    </div>
  );
}
