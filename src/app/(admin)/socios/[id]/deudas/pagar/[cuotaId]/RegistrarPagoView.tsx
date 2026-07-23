"use client";

import "@/app/(admin)/socios/socios.css";
import "@/app/(admin)/cuotas/cuotas.css";
import "../../estado-cuenta.css";
import "./registrar-pago.css";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/admin/Icon";
import { useToast } from "@/components/admin/toast";
import { formatSoles } from "@/lib/money";
import { fechaCorta, hoyISOPeru } from "@/lib/fecha";
import { EstadoBadge } from "@/app/(admin)/socios/EstadoBadge";
import {
  registrarPago,
  reemitirComprobantePago,
} from "@/app/(admin)/cuotas/actions";
import type { EstadoSocio } from "@/generated/prisma/client";

const METODO_LABEL: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  yape: "Yape / Plin",
  otro: "Otro",
};

const ESTADO_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  pagada: "Pagada",
  anulada: "Anulada",
  exonerada: "Exonerada",
};

type SocioHeader = {
  id: string;
  codigo: string;
  numeroPadron: number | null;
  estado: EstadoSocio;
  documento: string;
  nombre: string;
  nombreCorto: string;
};

type Cuota = {
  id: string;
  periodo: string;
  concepto: string;
  monto: number;
  vencimiento: string | null;
  estado: string;
  esAutovaluo: boolean;
  esGuardiania: boolean;
  pagadoEn: string | null;
  metodoPago: string | null;
  nroOperacion: string | null;
  motivo: string | null;
};

type OtraPendiente = {
  id: string;
  periodo: string;
  concepto: string;
  monto: number;
  esAutovaluo: boolean;
};

export function RegistrarPagoView({
  socio,
  cuota,
  otrasPendientes,
}: {
  socio: SocioHeader;
  cuota: Cuota;
  otrasPendientes: OtraPendiente[];
}) {
  const router = useRouter();
  const toast = useToast();
  const volverUrl = `/socios/${socio.id}/deudas`;

  const [monto, setMonto] = useState(String(cuota.monto));
  const [metodo, setMetodo] = useState("efectivo");
  const [nroOperacion, setNroOperacion] = useState("");
  const [fecha, setFecha] = useState(hoyISOPeru());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [done, setDone] = useState<{
    comprobanteId: string | null;
    movimientoCajaId: string | null;
  } | null>(null);

  const esAuto = cuota.esAutovaluo;
  const esGuard = cuota.esGuardiania;
  // El N.° de recibo FÍSICO (el del talonario que emite tesorería) se registra
  // SIEMPRE, incluso en efectivo: es el respaldo en papel del cobro. Es
  // OBLIGATORIO en autovalúo (además único, antifraude) y en guardianía (donde un
  // mismo recibo sí puede cubrir varios meses). Es independiente del comprobante
  // del sistema, que lleva su propio folio correlativo + código QR.
  const nroRequerido = esAuto || esGuard;
  const faltaNroAuto = nroRequerido && !nroOperacion.trim();
  const yaPagada = cuota.estado !== "pendiente";

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (submitting || yaPagada) return;
    if (faltaNroAuto) {
      toast.error(
        esAuto
          ? "Para el autovalúo, ingresa el N.° de operación del recibo."
          : "Para guardianía, ingresa el N.° del recibo físico de tesorería.",
      );
      return;
    }
    setSubmitting(true);
    setError(null);
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
    setError(null);
    const res = await reemitirComprobantePago(done.movimientoCajaId);
    setRetrying(false);
    if (res.ok && res.data) {
      setDone({
        comprobanteId: res.data.id,
        movimientoCajaId: done.movimientoCajaId,
      });
    } else {
      setError(res.ok ? "No se pudo emitir el comprobante." : res.error);
    }
  }

  return (
    <div className="socios-page ec-page">
      <div className="ec-topbar no-print">
        <button className="btn btn--ghost" onClick={() => router.push(volverUrl)}>
          <Icon
            name="chevron-right"
            size={14}
            style={{ transform: "rotate(180deg)" }}
          />
          <span>Volver al estado de cuenta</span>
        </button>
      </div>

      <header className="socios-page__header">
        <div>
          <div className="ec-eyebrow">
            Registrar pago · Socio {socio.codigo}
            {socio.numeroPadron != null && ` · Padrón ${socio.numeroPadron}`}
          </div>
          <h1 className="socios-page__title">{socio.nombre}</h1>
          <span className="socios-page__sub ec-sub">
            <span className="ec-doc">
              <Icon name="card" size={14} /> {socio.documento}
            </span>
            <EstadoBadge estado={socio.estado} />
          </span>
        </div>
      </header>

      {done ? (
        <div className="rp-success">
          <div className="rp-success__icon">
            <Icon name="check" size={30} />
          </div>
          <h2 className="rp-success__title">Pago registrado</h2>
          <p className="rp-success__text">
            {cuota.concepto} ({cuota.periodo}) · {formatSoles(Number(monto))}
            {" — "}
            {done.comprobanteId
              ? "Se generó el comprobante. Puedes imprimirlo y entregarlo al socio."
              : "El pago se registró, pero no se pudo generar el comprobante. Puedes reintentar su emisión."}
          </p>
          {!done.comprobanteId && error && (
            <p className="rp-success__err">{error}</p>
          )}
          <div className="rp-success__actions">
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
              onClick={() => router.push(volverUrl)}
            >
              Volver al estado de cuenta
            </button>
          </div>
        </div>
      ) : (
        <div className="rp-grid">
          {/* Detalle de la cuota que se va a pagar */}
          <aside className="rp-detalle">
            <h2 className="rp-card__title">Cuota a pagar</h2>
            <div className="rp-detalle__periodo">
              <span className="soc-codigo">{cuota.periodo}</span>
              {esAuto && <span className="ec-tag ec-tag--auto">Autovalúo</span>}
            </div>
            <div className="rp-detalle__concepto">{cuota.concepto}</div>
            <div className="rp-detalle__monto">{formatSoles(cuota.monto)}</div>
            <dl className="rp-detalle__meta">
              <div>
                <dt>Vencimiento</dt>
                <dd>{cuota.vencimiento ? fechaCorta(cuota.vencimiento) : "—"}</dd>
              </div>
              <div>
                <dt>Estado</dt>
                <dd>
                  {yaPagada ? (
                    <span className={`cuo-badge cuo-badge--${cuota.estado}`}>
                      {ESTADO_LABEL[cuota.estado] ?? cuota.estado}
                    </span>
                  ) : (
                    <span className="cuo-badge cuo-badge--pendiente">
                      Pendiente
                    </span>
                  )}
                </dd>
              </div>
            </dl>

            {otrasPendientes.length > 0 && (
              <div className="rp-otras">
                <h3 className="rp-otras__title">
                  Otras deudas pendientes ({otrasPendientes.length})
                </h3>
                <ul className="rp-otras__list">
                  {otrasPendientes.map((o) => (
                    <li key={o.id}>
                      <button
                        type="button"
                        className="rp-otras__item"
                        onClick={() =>
                          router.push(
                            `/socios/${socio.id}/deudas/pagar/${o.id}`,
                          )
                        }
                        title="Registrar el pago de esta cuota"
                      >
                        <span className="rp-otras__txt">
                          <b>{o.periodo}</b>
                          <span>{o.concepto}</span>
                        </span>
                        <span className="cuo-monto">{formatSoles(o.monto)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>

          {/* Formulario de pago */}
          <form className="rp-form" onSubmit={submit}>
            <h2 className="rp-card__title">Datos del pago</h2>

            {yaPagada && (
              <div
                className="soc-error"
                role="note"
                style={{
                  background: "#fef3c7",
                  color: "#92400e",
                  borderColor: "#fde68a",
                }}
              >
                <Icon name="info" size={16} />
                <span>
                  Esta cuota ya está{" "}
                  {(ESTADO_LABEL[cuota.estado] ?? cuota.estado).toLowerCase()}
                  {cuota.pagadoEn ? ` (${fechaCorta(cuota.pagadoEn)})` : ""}
                  {cuota.nroOperacion ? ` · N.° op. ${cuota.nroOperacion}` : ""}
                  {cuota.motivo ? ` · ${cuota.motivo}` : ""}.
                </span>
              </div>
            )}

            {esAuto && !yaPagada && (
              <div
                className="soc-error"
                role="note"
                style={{
                  background: "#e0f2fe",
                  color: "#075985",
                  borderColor: "#bae6fd",
                }}
              >
                <Icon name="info" size={16} />
                <span>
                  <b>Autovalúo:</b> el N.° de operación del recibo es{" "}
                  <b>obligatorio</b> y no puede repetirse en otro año/socio.
                </span>
              </div>
            )}

            {esGuard && !yaPagada && (
              <div
                className="soc-error"
                role="note"
                style={{
                  background: "#e0f2fe",
                  color: "#075985",
                  borderColor: "#bae6fd",
                }}
              >
                <Icon name="info" size={16} />
                <span>
                  <b>Guardianía:</b> el N.° del recibo físico de tesorería es{" "}
                  <b>obligatorio</b>. Un mismo recibo sí puede cubrir varios meses.
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
                  disabled={submitting || yaPagada}
                />
              </label>
              <label className="field">
                <span className="field__label">Fecha</span>
                <input
                  type="date"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  disabled={submitting || yaPagada}
                />
              </label>
            </div>

            <label className="field">
              <span className="field__label">Método de pago</span>
              <select
                value={metodo}
                onChange={(e) => setMetodo(e.target.value)}
                disabled={submitting || yaPagada}
              >
                {Object.entries(METODO_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>

            <label className={`field rp-nro ${nroRequerido ? "rp-nro--req" : ""}`}>
              <span className="field__label">
                {esAuto
                  ? "N.° de recibo del autovalúo *"
                  : esGuard
                    ? "N.° de recibo de tesorería *"
                    : "N.° de recibo de tesorería (opcional)"}
              </span>
              <input
                value={nroOperacion}
                onChange={(e) => setNroOperacion(e.target.value)}
                placeholder={
                  esAuto
                    ? "N.° de recibo / operación del autovalúo"
                    : "N.° del recibo físico entregado al socio"
                }
                aria-invalid={faltaNroAuto}
                autoFocus={nroRequerido}
                disabled={submitting || yaPagada}
              />
              <span className="rp-nro__hint">
                {esAuto
                  ? "Escríbelo tal como figura en el recibo del autovalúo."
                  : esGuard
                    ? "Obligatorio: número del talonario físico que emite la tesorera. El sistema genera aparte su propio comprobante con folio."
                    : metodo === "efectivo"
                      ? "Número del talonario físico que emite la tesorera. El sistema genera aparte su propio comprobante con folio."
                      : "N.° del recibo físico, o el código de la transferencia, Yape/Plin o depósito."}
              </span>
            </label>

            <div className="rp-form__foot">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => router.push(volverUrl)}
                disabled={submitting}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="btn btn--primary btn--lg"
                disabled={submitting || yaPagada || faltaNroAuto}
                title={
                  faltaNroAuto
                    ? esAuto
                      ? "Ingresa el N.° de operación del recibo del autovalúo"
                      : "Ingresa el N.° del recibo físico de tesorería"
                    : undefined
                }
              >
                {submitting
                  ? "Registrando…"
                  : `Confirmar pago · ${formatSoles(Number(monto) || 0)}`}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
