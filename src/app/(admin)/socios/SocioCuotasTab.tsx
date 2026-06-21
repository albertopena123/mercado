"use client";

import "../cuotas/cuotas.css";
import { useEffect, useState } from "react";
import { Icon } from "@/components/admin/Icon";
import { formatSoles } from "@/lib/money";
import { getCuotasBySocio } from "../cuotas/actions";
import { PagoPorMontoModal } from "../cuotas/PagoPorMontoModal";
import { PagarSeleccionModal } from "../cuotas/PagarSeleccionModal";
import { esAutovaluo } from "@/lib/cuotas/autovaluo";
import type { SocioCuotas } from "../cuotas/types";

const ESTADO_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  pagada: "Pagada",
  anulada: "Anulada",
};

export function SocioCuotasTab({
  socioId,
  socioNombre,
}: {
  socioId: string;
  socioNombre: string;
}) {
  const [data, setData] = useState<SocioCuotas | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [paySelOpen, setPaySelOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [flash, setFlash] = useState<string | null>(null);

  async function load() {
    const r = await getCuotasBySocio(socioId);
    if (r.ok) setData(r.data!);
    else setError(r.error);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await getCuotasBySocio(socioId);
      if (cancelled) return;
      if (r.ok) setData(r.data!);
      else setError(r.error);
    })();
    return () => {
      cancelled = true;
    };
  }, [socioId]);

  if (error) return <p className="soc-error">{error}</p>;
  if (!data) return <p style={{ color: "var(--text-muted)" }}>Cargando…</p>;

  const alDia = data.deuda <= 0;
  const pendientes = data.cuotas
    .filter((c) => c.estado === "pendiente")
    .map((c) => ({ id: c.id, periodo: c.periodo, monto: c.monto }))
    .sort((a, b) => a.periodo.localeCompare(b.periodo));
  // El autovalúo no se paga "por monto" (necesita su N.° de recibo individual).
  const tieneAutovaluo = data.cuotas.some(
    (c) => c.estado === "pendiente" && esAutovaluo(c.concepto),
  );

  // Selección múltiple: pagar varias cuotas elegidas en un solo comprobante.
  // El autovalúo se excluye (se paga individualmente con su N.° de recibo). Se
  // exige pendiente: si una cuota seleccionada se salda por otro flujo (p. ej.
  // "Pagar por monto"), al recargar deja de estar pendiente y sale sola de la
  // barra/total sin depender de limpiar el Set.
  const selRows = data.cuotas.filter(
    (c) => selected.has(c.id) && c.estado === "pendiente" && !esAutovaluo(c.concepto),
  );
  const selTotal =
    Math.round(selRows.reduce((a, c) => a + c.monto, 0) * 100) / 100;
  const toggleSel = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div>
      {flash && (
        <div
          className="soc-error"
          role="status"
          style={{
            background: "#dcfce7",
            color: "#166534",
            borderColor: "#bbf7d0",
            marginBottom: 12,
          }}
        >
          <Icon name="check" size={16} />
          <span>{flash}</span>
        </div>
      )}

      <div className={`deuda-banner ${alDia ? "deuda-banner--ok" : "deuda-banner--debe"}`}>
        <div>
          <div className="deuda-banner__label">
            {alDia ? "Al día" : "Deuda pendiente"}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {alDia
              ? "El socio no tiene cuotas pendientes."
              : `${pendientes.length} cuota(s) sin pagar.`}
            {data.saldoAFavor > 0 && (
              <> · Saldo a favor: {formatSoles(data.saldoAFavor)}</>
            )}
          </div>
        </div>
        <div className="deuda-banner__value">{formatSoles(data.deuda)}</div>
      </div>

      {data.canPay && (pendientes.length > 0 || data.saldoAFavor > 0) && (
        <div style={{ marginBottom: 16 }}>
          <button className="btn btn--primary" onClick={() => setPayOpen(true)}>
            <Icon name="chart" size={16} />
            <span>Registrar pago por monto</span>
          </button>
        </div>
      )}

      {selRows.length > 0 && (
        <div className="cuo-selbar" role="region" aria-label="Pago de cuotas seleccionadas">
          <div className="cuo-selbar__info">
            <b>{selRows.length}</b> cuota(s) · Total <b>{formatSoles(selTotal)}</b>
          </div>
          <div className="cuo-selbar__actions">
            <button className="btn btn--ghost" onClick={() => setSelected(new Set())}>
              Quitar selección
            </button>
            <button className="btn btn--primary" onClick={() => setPaySelOpen(true)}>
              Pagar seleccionadas
            </button>
          </div>
        </div>
      )}

      {data.cuotas.length === 0 ? (
        <p style={{ color: "var(--text-muted)", fontStyle: "italic" }}>
          Este socio no tiene cuotas registradas.
        </p>
      ) : (
        <table className="socios-table" style={{ marginTop: 4 }}>
          <thead>
            <tr>
              {data.canPay && (
                <th style={{ width: 36 }}>
                  <span className="soc-th" style={{ cursor: "default" }} aria-label="Seleccionar" />
                </th>
              )}
              <th><span className="soc-th" style={{ cursor: "default" }}>Periodo</span></th>
              <th><span className="soc-th" style={{ cursor: "default" }}>Monto</span></th>
              <th><span className="soc-th" style={{ cursor: "default" }}>Estado</span></th>
            </tr>
          </thead>
          <tbody>
            {data.cuotas.map((c) => (
              <tr key={c.id} className={selected.has(c.id) ? "is-selected" : undefined}>
                {data.canPay && (
                  <td style={{ width: 36, textAlign: "center" }}>
                    {c.estado === "pendiente" && !esAutovaluo(c.concepto) ? (
                      <input
                        type="checkbox"
                        checked={selected.has(c.id)}
                        onChange={() => toggleSel(c.id)}
                        aria-label={`Seleccionar cuota ${c.periodo}`}
                      />
                    ) : c.estado === "pendiente" && esAutovaluo(c.concepto) ? (
                      <span
                        title="El autovalúo se paga individualmente (su N.° de recibo)"
                        style={{ color: "var(--text-muted)", display: "inline-flex" }}
                      >
                        <Icon name="lock" size={14} />
                      </span>
                    ) : null}
                  </td>
                )}
                <td>
                  <span className="soc-codigo">{c.periodo}</span>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {c.concepto}
                  </div>
                </td>
                <td>
                  <span className="cuo-monto">{formatSoles(c.monto)}</span>
                </td>
                <td>
                  <span className={`cuo-badge cuo-badge--${c.estado}`}>
                    {ESTADO_LABEL[c.estado]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {payOpen && (
        <PagoPorMontoModal
          socioId={socioId}
          socioNombre={socioNombre}
          deuda={data.deuda}
          saldoAFavor={data.saldoAFavor}
          pendientes={pendientes}
          tieneAutovaluo={tieneAutovaluo}
          onClose={() => setPayOpen(false)}
          onDone={(msg) => {
            setPayOpen(false);
            setSelected(new Set());
            setFlash(msg);
            load();
          }}
        />
      )}

      {paySelOpen && (
        <PagarSeleccionModal
          socioId={socioId}
          socioNombre={socioNombre}
          cuotas={selRows.map((c) => ({
            id: c.id,
            periodo: c.periodo,
            concepto: c.concepto,
            monto: c.monto,
          }))}
          onClose={() => setPaySelOpen(false)}
          onDone={(msg) => {
            setPaySelOpen(false);
            setSelected(new Set());
            setFlash(msg);
            load();
          }}
        />
      )}
    </div>
  );
}
