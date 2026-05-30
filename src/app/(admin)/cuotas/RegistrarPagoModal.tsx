"use client";

import { useState, type FormEvent } from "react";
import { Icon } from "@/components/admin/Icon";
import { useEscClose } from "@/lib/ui/useEscClose";
import { formatSoles } from "@/lib/money";
import { registrarPago } from "./actions";
import type { CuotaRow } from "./types";

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export function RegistrarPagoModal({
  cuota,
  onClose,
  onDone,
}: {
  cuota: CuotaRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [monto, setMonto] = useState(String(cuota.monto));
  const [metodo, setMetodo] = useState("efectivo");
  const [fecha, setFecha] = useState(today());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEscClose(true, onClose, submitting);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const res = await registrarPago(cuota.id, {
      monto: Number(monto),
      metodoPago: metodo,
      fecha,
    });
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onDone();
  }

  return (
    <div className="modal-backdrop" onClick={() => !submitting && onClose()}>
      <form
        className="modal modal--sm"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <header className="modal__head">
          <h2>Registrar pago</h2>
          <button type="button" className="iconbtn" onClick={() => !submitting && onClose()} disabled={submitting} aria-label="Cerrar">
            <Icon name="close" size={20} />
          </button>
        </header>

        <div className="modal__body">
          <p className="modal__intro">
            <b>{cuota.socioNombre}</b> · {cuota.concepto} ({cuota.periodo}).
            Monto de la cuota: <b>{formatSoles(cuota.monto)}</b>.
          </p>
          {error && (
            <div className="soc-error" role="alert" style={{ marginBottom: 12 }}>
              <Icon name="info" size={16} />
              <span>{error}</span>
            </div>
          )}
          <div className="soc-formgrid soc-formgrid--2col">
            <label className="field">
              <span className="field__label">Monto pagado (S/)</span>
              <input
                type="number"
                min="0"
                step="0.5"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                disabled={submitting}
              />
            </label>
            <label className="field">
              <span className="field__label">Fecha</span>
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                disabled={submitting}
              />
            </label>
          </div>
          <label className="field">
            <span className="field__label">Método de pago</span>
            <select
              value={metodo}
              onChange={(e) => setMetodo(e.target.value)}
              disabled={submitting}
            >
              <option value="efectivo">Efectivo</option>
              <option value="transferencia">Transferencia</option>
              <option value="yape">Yape / Plin</option>
              <option value="otro">Otro</option>
            </select>
          </label>
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
          <button type="submit" className="btn btn--primary" disabled={submitting}>
            {submitting ? "Registrando…" : "Confirmar pago"}
          </button>
        </footer>
      </form>
    </div>
  );
}
