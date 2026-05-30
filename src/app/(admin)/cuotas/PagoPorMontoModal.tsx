"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Icon } from "@/components/admin/Icon";
import { useEscClose } from "@/lib/ui/useEscClose";
import { formatSoles } from "@/lib/money";
import { pagarPorMonto } from "./actions";

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export function PagoPorMontoModal({
  socioId,
  socioNombre,
  deuda,
  saldoAFavor,
  pendientes,
  onClose,
  onDone,
}: {
  socioId: string;
  socioNombre: string;
  deuda: number;
  saldoAFavor: number;
  // cuotas pendientes (monto), de la más antigua a la más reciente
  pendientes: { id: string; periodo: string; monto: number }[];
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [monto, setMonto] = useState(String(deuda > 0 ? deuda : 20));
  const [metodo, setMetodo] = useState("efectivo");
  const [fecha, setFecha] = useState(today());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEscClose(true, onClose, submitting);

  // Preview: cuántas cuotas cubre (saldo previo + monto), saldo resultante.
  const preview = useMemo(() => {
    let pozo = saldoAFavor + (Number(monto) || 0);
    let cubre = 0;
    for (const c of pendientes) {
      if (pozo + 1e-9 >= c.monto) {
        pozo = Math.round((pozo - c.monto) * 100) / 100;
        cubre++;
      } else break;
    }
    return { cubre, sobrante: pozo };
  }, [monto, saldoAFavor, pendientes]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const res = await pagarPorMonto(socioId, {
      monto: Number(monto) || 0,
      metodoPago: metodo,
      fecha,
    });
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    const d = res.data!;
    onDone(
      `Pago registrado: ${d.pagadas} cuota(s) saldada(s)` +
        (d.saldoAFavor > 0
          ? `. Saldo a favor: ${formatSoles(d.saldoAFavor)}.`
          : "."),
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
          <h2>Registrar pago por monto</h2>
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
          <p className="modal__intro">
            <b>{socioNombre}</b> · deuda actual <b>{formatSoles(deuda)}</b>
            {saldoAFavor > 0 && (
              <> · saldo a favor {formatSoles(saldoAFavor)}</>
            )}
            . El monto se aplica a las cuotas pendientes más antiguas; lo que
            sobre queda como saldo a favor.
          </p>

          {error && (
            <div className="soc-error" role="alert" style={{ marginBottom: 12 }}>
              <Icon name="info" size={16} />
              <span>{error}</span>
            </div>
          )}

          <div className="soc-formgrid soc-formgrid--2col">
            <label className="field">
              <span className="field__label">Monto recibido (S/)</span>
              <input
                type="number"
                min="0"
                step="0.5"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                autoFocus
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

          <div
            style={{
              background: "var(--bg-soft)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: "12px 14px",
              fontSize: 13.5,
            }}
          >
            <Icon
              name="info"
              size={14}
              style={{ verticalAlign: "-2px", marginRight: 6, color: "var(--accent)" }}
            />
            Cubrirá <b>{preview.cubre}</b> de {pendientes.length} cuota(s)
            pendiente(s)
            {preview.sobrante > 0 && (
              <>
                {" "}
                y dejará <b>{formatSoles(preview.sobrante)}</b> de saldo a favor
              </>
            )}
            .
          </div>
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
            {submitting ? "Registrando…" : "Registrar pago"}
          </button>
        </footer>
      </form>
    </div>
  );
}
