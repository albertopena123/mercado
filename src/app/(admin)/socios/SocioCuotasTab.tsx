"use client";

import "../cuotas/cuotas.css";
import { useEffect, useState } from "react";
import { Icon } from "@/components/admin/Icon";
import { formatSoles } from "@/lib/money";
import { getCuotasBySocio } from "../cuotas/actions";
import { PagoPorMontoModal } from "../cuotas/PagoPorMontoModal";
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

      {data.cuotas.length === 0 ? (
        <p style={{ color: "var(--text-muted)", fontStyle: "italic" }}>
          Este socio no tiene cuotas registradas.
        </p>
      ) : (
        <table className="socios-table" style={{ marginTop: 4 }}>
          <thead>
            <tr>
              <th><span className="soc-th" style={{ cursor: "default" }}>Periodo</span></th>
              <th><span className="soc-th" style={{ cursor: "default" }}>Monto</span></th>
              <th><span className="soc-th" style={{ cursor: "default" }}>Estado</span></th>
            </tr>
          </thead>
          <tbody>
            {data.cuotas.map((c) => (
              <tr key={c.id}>
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
          onClose={() => setPayOpen(false)}
          onDone={(msg) => {
            setPayOpen(false);
            setFlash(msg);
            load();
          }}
        />
      )}
    </div>
  );
}
