"use client";

import { useState, type FormEvent } from "react";
import { Icon } from "@/components/admin/Icon";
import { useToast } from "@/components/admin/toast";
import { useEscClose } from "@/lib/ui/useEscClose";
import { formatSoles } from "@/lib/money";
import { esAutovaluo } from "@/lib/cuotas/autovaluo";
import { registrarPago, reemitirComprobantePago } from "./actions";
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
  const toast = useToast();
  const [monto, setMonto] = useState(String(cuota.monto));
  const [metodo, setMetodo] = useState("efectivo");
  const [nroOperacion, setNroOperacion] = useState("");
  const [fecha, setFecha] = useState(today());
  const [submitting, setSubmitting] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [done, setDone] = useState<{
    comprobanteId: string | null;
    movimientoCajaId: string | null;
  } | null>(null);

  // El autovalúo exige el N.° de operación del recibo (siempre, aunque el método
  // sea efectivo) y el servidor valida que no se reuse en otro año/socio.
  const esAuto = esAutovaluo(cuota.concepto);
  const faltaNroAuto = esAuto && !nroOperacion.trim();

  useEscClose(true, onClose, submitting);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (faltaNroAuto) {
      toast.error("Para el autovalúo, ingresa el N.° de operación del recibo.");
      return;
    }
    setSubmitting(true);
    const res = await registrarPago(cuota.id, {
      monto: Number(monto),
      metodoPago: metodo,
      fecha,
      nroOperacion: nroOperacion.trim() || undefined,
    });
    setSubmitting(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setDone({
      comprobanteId: res.data?.comprobante?.id ?? null,
      movimientoCajaId: res.data?.movimientoCajaId ?? null,
    });
  }

  async function retryComprobante() {
    if (!done?.movimientoCajaId || retrying) return;
    setRetrying(true);
    const res = await reemitirComprobantePago(done.movimientoCajaId);
    setRetrying(false);
    if (res.ok && res.data) {
      setDone({
        comprobanteId: res.data.id,
        movimientoCajaId: done.movimientoCajaId,
      });
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
          <h2>Registrar pago</h2>
          <button type="button" className="iconbtn" onClick={() => !submitting && onClose()} disabled={submitting} aria-label="Cerrar">
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
              <p style={{ fontWeight: 600, marginBottom: 6 }}>Pago registrado</p>
              <p
                style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}
              >
                {done.comprobanteId
                  ? "Se generó el comprobante de pago. Puedes imprimirlo y entregarlo al socio."
                  : "El pago se registró, pero no se pudo generar el comprobante. Puedes reintentar su emisión."}
              </p>
            </div>
          ) : (
            <>
              <p className="modal__intro">
                <b>{cuota.socioNombre}</b> · {cuota.concepto} ({cuota.periodo}).
                Monto de la cuota: <b>{formatSoles(cuota.monto)}</b>.
              </p>
              {esAuto && (
                <div
                  className="soc-error"
                  role="note"
                  style={{
                    marginBottom: 12,
                    background: "#e0f2fe",
                    color: "#075985",
                    borderColor: "#bae6fd",
                  }}
                >
                  <Icon name="info" size={16} />
                  <span>
                    Autovalúo: el N.° de operación del recibo es obligatorio y no
                    puede repetirse en otro año/socio.
                  </span>
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
              {(esAuto || metodo !== "efectivo") && (
                <label className="field">
                  <span className="field__label">
                    {esAuto
                      ? "N.° de operación del recibo (autovalúo) *"
                      : "N.° de operación (opcional)"}
                  </span>
                  <input
                    value={nroOperacion}
                    onChange={(e) => setNroOperacion(e.target.value)}
                    placeholder={
                      esAuto
                        ? "N.° de recibo / operación del autovalúo"
                        : "N.° de transferencia / Yape / depósito"
                    }
                    aria-invalid={faltaNroAuto}
                    disabled={submitting}
                  />
                </label>
              )}
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
                onClick={onDone}
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
              <button
                type="submit"
                className="btn btn--primary"
                disabled={submitting || faltaNroAuto}
                title={
                  faltaNroAuto
                    ? "Ingresa el N.° de operación del recibo del autovalúo"
                    : undefined
                }
              >
                {submitting ? "Registrando…" : "Confirmar pago"}
              </button>
            </>
          )}
        </footer>
      </form>
    </div>
  );
}
