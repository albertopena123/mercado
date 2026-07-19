"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { Icon } from "@/components/admin/Icon";
import { useToast } from "@/components/admin/toast";
import { useEscClose } from "@/lib/ui/useEscClose";
import { formatSoles } from "@/lib/money";
import { esAutovaluo } from "@/lib/cuotas/autovaluo";
import { pagarPorMonto, reemitirComprobantePago } from "./actions";

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

type Pendiente = {
  id: string;
  periodo: string;
  monto: number;
  concepto: string;
};

export function PagoPorMontoModal({
  socioId,
  socioNombre,
  deuda,
  pendientes,
  onClose,
  onDone,
}: {
  socioId: string;
  socioNombre: string;
  deuda: number;
  // cuotas pendientes, de la más antigua a la más reciente
  pendientes: Pendiente[];
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [monto, setMonto] = useState(String(deuda > 0 ? deuda : 20));
  const [metodo, setMetodo] = useState("efectivo");
  const [nroOperacion, setNroOperacion] = useState("");
  // N.° de operación del recibo por cada autovalúo cubierto (cuotaId → valor).
  const [autoOps, setAutoOps] = useState<Record<string, string>>({});
  const [fecha, setFecha] = useState(today());
  const [submitting, setSubmitting] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [done, setDone] = useState<{
    msg: string;
    comprobanteId: string | null;
    movimientoCajaId: string | null;
  } | null>(null);
  const toast = useToast();
  // Clave de idempotencia: estable mientras viva esta apertura del modal. Un
  // doble-clic o un reintento tras error usan la MISMA clave, así el servidor no
  // vuelve a saldar cuotas (cobrar dos veces). Se acuña al primer envío (no en
  // render, para no romper la pureza).
  const idemKey = useRef<string | null>(null);

  useEscClose(true, onClose, submitting);

  // Preview de la cascada (cuotas más antiguas primero): cuántas cuotas cubre el
  // monto, cuánto sobra y qué autovalúos quedan cubiertos (esos exigen su N.° de
  // operación). El mismo orden que aplica el servidor. No se maneja saldo a
  // favor: si sobra dinero, el monto no coincide con cuotas completas y el pago
  // se bloquea (hay que ingresar un importe que salde cuotas enteras).
  const { cubre, sobrante, coveredAuto } = useMemo(() => {
    let pozo = Number(monto) || 0;
    let n = 0;
    const auto: Pendiente[] = [];
    for (const c of pendientes) {
      if (pozo + 1e-9 >= c.monto) {
        pozo = Math.round((pozo - c.monto) * 100) / 100;
        n++;
        if (esAutovaluo(c.concepto)) auto.push(c);
      } else break;
    }
    return { cubre: n, sobrante: pozo, coveredAuto: auto };
  }, [monto, pendientes]);

  const faltanNros = coveredAuto.some((c) => !(autoOps[c.id] ?? "").trim());
  // El monto debe saldar cuotas completas: si sobra algo, se bloquea el envío.
  const sobra = sobrante > 0.0001;
  const montoValido = (Number(monto) || 0) > 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (!montoValido) {
      toast.error("Ingresa un monto mayor a 0.");
      return;
    }
    if (sobra) {
      toast.error(
        `El monto sobra ${formatSoles(sobrante)} tras saldar ${cubre} cuota(s). Ingresa un importe que cubra cuotas completas (no se maneja saldo a favor).`,
      );
      return;
    }
    if (faltanNros) {
      toast.error(
        "Ingresa el N.° de operación del recibo de cada autovalúo incluido en el pago.",
      );
      return;
    }
    setSubmitting(true);
    if (!idemKey.current) idemKey.current = crypto.randomUUID();
    const autovaluoOps = Object.fromEntries(
      coveredAuto.map((c) => [c.id, (autoOps[c.id] ?? "").trim()]),
    );
    const res = await pagarPorMonto(socioId, {
      monto: Number(monto) || 0,
      metodoPago: metodo,
      fecha,
      nroOperacion: nroOperacion.trim() || undefined,
      autovaluoOps,
      idempotencyKey: idemKey.current,
    });
    setSubmitting(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    const d = res.data!;
    setDone({
      msg: `Pago registrado: ${d.pagadas} cuota(s) saldada(s).`,
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
                <b>{socioNombre}</b> · deuda actual <b>{formatSoles(deuda)}</b>.
                El monto se aplica a las cuotas pendientes más antiguas y debe
                cubrir cuotas completas (no se maneja saldo a favor).
              </p>

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

              {/* Autovalúo(s) incluidos en el pago: cada recibo exige su N.° de
                  operación (obligatorio, único). Suele ser uno solo. */}
              {coveredAuto.length > 0 && (
                <div
                  className="ppm-auto"
                  role="group"
                  aria-label="N.° de operación de autovalúo"
                >
                  <div className="ppm-auto__head">
                    <Icon name="info" size={15} />
                    <span>
                      Este pago incluye {coveredAuto.length} autovalúo(s).
                      Ingresa el N.° de operación de cada recibo (obligatorio, no
                      se puede repetir).
                    </span>
                  </div>
                  {coveredAuto.map((c) => (
                    <label className="field ppm-auto__field" key={c.id}>
                      <span className="field__label">
                        {c.concepto} ({c.periodo}) — {formatSoles(c.monto)} *
                      </span>
                      <input
                        value={autoOps[c.id] ?? ""}
                        onChange={(e) =>
                          setAutoOps((prev) => ({
                            ...prev,
                            [c.id]: e.target.value,
                          }))
                        }
                        placeholder="N.° de recibo / operación del autovalúo"
                        aria-invalid={!(autoOps[c.id] ?? "").trim()}
                        disabled={submitting}
                      />
                    </label>
                  ))}
                </div>
              )}

              <div
                style={{
                  background: sobra ? "#fef3c7" : "var(--bg-soft)",
                  border: `1px solid ${sobra ? "#fde68a" : "var(--border)"}`,
                  color: sobra ? "#92400e" : undefined,
                  borderRadius: 10,
                  padding: "12px 14px",
                  fontSize: 13.5,
                }}
              >
                <Icon
                  name="info"
                  size={14}
                  style={{
                    verticalAlign: "-2px",
                    marginRight: 6,
                    color: sobra ? "#92400e" : "var(--accent)",
                  }}
                />
                Cubrirá <b>{cubre}</b> de {pendientes.length} cuota(s)
                pendiente(s).
                {sobra && (
                  <>
                    {" "}
                    Sobran <b>{formatSoles(sobrante)}</b>: ajusta el monto para
                    saldar cuotas completas (no se maneja saldo a favor).
                  </>
                )}
              </div>
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
              <button
                type="submit"
                className="btn btn--primary"
                disabled={submitting || faltanNros || sobra || !montoValido}
                title={
                  sobra
                    ? "El monto debe saldar cuotas completas (no se maneja saldo a favor)"
                    : faltanNros
                      ? "Ingresa el N.° de operación de cada autovalúo incluido"
                      : undefined
                }
              >
                {submitting ? "Registrando…" : "Registrar pago"}
              </button>
            </>
          )}
        </footer>
      </form>
    </div>
  );
}
