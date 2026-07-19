"use client";

import "../cuotas/cuotas.css";
import { useEffect, useState } from "react";
import { Icon } from "@/components/admin/Icon";
import { formatSoles } from "@/lib/money";
import { getCuotasBySocio } from "../cuotas/actions";
import type { SocioCuotas } from "../cuotas/types";

// Resumen de deuda del socio dentro del drawer. Es solo un vistazo: para
// registrar pagos (por cuota, con su N.° de operación) se va al "Estado de
// cuenta", una vista dedicada con más espacio. Aquí NO hay acciones de pago
// para no confundir a quien atiende.
export function SocioCuotasTab({ socioId }: { socioId: string }) {
  const [data, setData] = useState<SocioCuotas | null>(null);
  const [error, setError] = useState<string | null>(null);

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
  const pendientes = data.cuotas.filter((c) => c.estado === "pendiente").length;

  return (
    <div>
      <div
        className={`deuda-banner ${alDia ? "deuda-banner--ok" : "deuda-banner--debe"}`}
      >
        <div>
          <div className="deuda-banner__label">
            {alDia ? "Al día" : "Deuda pendiente"}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {alDia
              ? "El socio no tiene cuotas pendientes."
              : `${pendientes} cuota(s) sin pagar.`}
          </div>
        </div>
        <div className="deuda-banner__value">{formatSoles(data.deuda)}</div>
      </div>

      <div style={{ marginTop: 16 }}>
        <a
          className="btn btn--primary"
          href={`/socios/${socioId}/deudas`}
          style={{ width: "100%", justifyContent: "center" }}
        >
          <Icon name="external" size={16} />
          <span>
            {data.canPay
              ? "Ver estado de cuenta y registrar pagos"
              : "Ver estado de cuenta"}
          </span>
        </a>
        {data.canPay && (
          <p
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              marginTop: 8,
              textAlign: "center",
            }}
          >
            Desde el estado de cuenta registras el pago de cada cuota e ingresas
            el N.° de operación del recibo.
          </p>
        )}
      </div>
    </div>
  );
}
