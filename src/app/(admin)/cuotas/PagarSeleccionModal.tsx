"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Icon } from "@/components/admin/Icon";
import { useToast } from "@/components/admin/toast";
import { useEscClose } from "@/lib/ui/useEscClose";
import { formatSoles } from "@/lib/money";
import { pagarCuotasSeleccionadas, reemitirComprobantePago } from "./actions";

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export type CuotaSeleccionada = {
  id: string;
  periodo: string;
  concepto: string;
  monto: number;
};

// Paga varias cuotas elegidas de un mismo socio en una sola operación (un
// comprobante). El autovalúo ya quedó excluido de la selección por la UI.
export function PagarSeleccionModal({
  socioId,
  socioNombre,
  cuotas,
  onClose,
  onDone,
}: {
  socioId: string;
  socioNombre: string;
  cuotas: CuotaSeleccionada[];
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const total = useMemo(
    () => Math.round(cuotas.reduce((a, c) => a + c.monto, 0) * 100) / 100,
    [cuotas],
  );
  const toast = useToast();
  const [metodo, setMetodo] = useState("efectivo");
  const [nroOperacion, setNroOperacion] = useState("");
  const [fecha, setFecha] = useState(today());
  const [submitting, setSubmitting] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [done, setDone] = useState<{
    msg: string;
    comprobanteId: string | null;
    movimientoCajaId: string | null;
  } | null>(null);

  useEscClose(true, onClose, submitting);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (submitting || cuotas.length === 0) return;
    setSubmitting(true);
    const res = await pagarCuotasSeleccionadas(
      socioId,
      cuotas.map((c) => c.id),
      { metodoPago: metodo, fecha, nroOperacion: nroOperacion.trim() || undefined },
    );
    setSubmitting(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    const d = res.data!;
    setDone({
      msg: `Pago registrado: ${d.pagadas} cuota(s) saldada(s) · ${formatSoles(
        d.montoTotal,
      )}.`,
      comprobanteId: d.comprobante?.id ?? null,
      movimientoCajaId: d.movimientoCajaId ?? null,
    });
  }

  async function retryComprobante() {
    const movId = done?.movimientoCajaId;
    if (!movId || retrying) return;
    setRetrying(true);
    const res = await reemitirComprobantePago(movId);
    setRetrying(false);
    if (res.ok && res.data) {
      const cid = res.data.id;
      setDone((d) => (d ? { ...d, comprobanteId: cid } : d));
    } else {
      toast.error(res.ok ? "No se pudo emitir el comprobante." : res.error);
    }
  }

  return (
    <div className="modal-backdrop" onClick={() => !submitting && onClose()}>
      <form
        className="modal modal--sm"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <header className="modal__head">
          <h2>Pagar cuotas seleccionadas</h2>
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
          {done ? (
            <div style={{ textAlign: "center", padding: "8px 0 4px" }}>
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: "50%",
                  background: "#dcfce7",
                  color: "#166534",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 12,
                }}
              >
                <Icon name="check" size={26} />
              </div>
              <p style={{ fontWeight: 600, marginBottom: 6 }}>{done.msg}</p>
              <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
                {done.comprobanteId
                  ? "Se generó el comprobante de pago. Puedes imprimirlo y entregarlo al socio."
                  : "El pago se registró, pero no se pudo generar el comprobante. Puedes reintentar su emisión."}
              </p>
            </div>
          ) : (
            <>
              <p className="modal__intro">
                <b>{socioNombre}</b> · {cuotas.length} cuota(s) ·{" "}
                <b>{formatSoles(total)}</b>
              </p>

              <div className="cuo-sel-list" role="list">
                {cuotas.map((c) => (
                  <div key={c.id} className="cuo-sel-list__item" role="listitem">
                    <span className="cuo-sel-list__text">
                      <b>{c.concepto}</b>
                      <span style={{ color: "var(--text-muted)" }}>
                        {" "}
                        ({c.periodo})
                      </span>
                    </span>
                    <span className="cuo-monto">{formatSoles(c.monto)}</span>
                  </div>
                ))}
              </div>

              <div className="soc-formgrid soc-formgrid--2col">
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

              {/* Siempre visible: en efectivo es el N.° del recibo físico que
                  entrega tesorería (antes se ocultaba y no había dónde anotarlo). */}
              <label className="field">
                <span className="field__label">N.° de recibo (opcional)</span>
                <input
                  value={nroOperacion}
                  onChange={(e) => setNroOperacion(e.target.value)}
                  placeholder="Recibo de tesorería / N.° de operación"
                  disabled={submitting}
                />
              </label>
            </>
          )}
        </div>

        <footer className="modal__foot">
          {done ? (
            <>
              {done.comprobanteId ? (
                <a
                  className="btn btn--ghost"
                  href={`/cuotas/comprobante/${done.comprobanteId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Icon name="download" size={16} />
                  <span>Imprimir comprobante</span>
                </a>
              ) : (
                done.movimientoCajaId && (
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={retryComprobante}
                    disabled={retrying}
                  >
                    {retrying ? "Emitiendo…" : "Reintentar comprobante"}
                  </button>
                )
              )}
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => onDone(done.msg)}
              >
                Cerrar
              </button>
            </>
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
              <button type="submit" className="btn btn--primary" disabled={submitting}>
                {submitting ? "Registrando…" : `Pagar ${formatSoles(total)}`}
              </button>
            </>
          )}
        </footer>
      </form>
    </div>
  );
}
