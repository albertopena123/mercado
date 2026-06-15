import Link from "next/link";
import { requireSocio } from "@/lib/portal/socio";
import { getMisCuotas } from "@/lib/portal/data";
import { formatSoles } from "@/lib/money";
import { fechaCorta } from "@/lib/fecha";
import { Icon } from "@/components/admin/Icon";
import type { EstadoCuota } from "@/generated/prisma/client";

export const metadata = { title: "Mis deudas · Mercado Milagros" };
export const dynamic = "force-dynamic";

const ESTADO_CUOTA_LABEL: Record<EstadoCuota, string> = {
  pendiente: "Pendiente",
  pagada: "Pagada",
  anulada: "Anulada",
};

const MESES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Set", "Oct", "Nov", "Dic",
];
function fmtPeriodo(p: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(p);
  if (!m) return p;
  const mes = MESES[parseInt(m[2], 10) - 1] ?? m[2];
  return `${mes} ${m[1]}`;
}

export default async function DeudasPage() {
  const { socio } = await requireSocio();
  const { deuda, saldoAFavor, cuotas } = await getMisCuotas(socio.id);

  return (
    <>
      <Link href="/portal" className="pt-back">
        <Icon name="chevron-right" size={15} style={{ transform: "rotate(180deg)" }} />
        Volver
      </Link>

      <div className="pt-hello">
        <h1>Mis deudas</h1>
        <p>Tu estado de cuenta. Los pagos se registran en la oficina del mercado.</p>
      </div>

      <div className={`pt-banner ${deuda > 0 ? "pt-banner--debt" : "pt-banner--ok"}`}>
        <span>{deuda > 0 ? "Debes" : "Estás al día"}</span>
        {deuda > 0 && <span className="pt-banner__amount">{formatSoles(deuda)}</span>}
        {saldoAFavor > 0 && (
          <span style={{ marginLeft: "auto", fontWeight: 600 }}>
            Saldo a favor: {formatSoles(saldoAFavor)}
          </span>
        )}
      </div>

      <section className="pt-panel">
        <h2>Cuotas</h2>
        {cuotas.length === 0 ? (
          <p className="pt-empty">No tienes cuotas registradas.</p>
        ) : (
          <div className="pt-list">
            {cuotas.map((c) => (
              <div key={c.id} className="pt-row">
                <div className="pt-row__main">
                  <div className="pt-row__title">
                    {c.concepto || "Cuota"} · {fmtPeriodo(c.periodo)}
                  </div>
                  <div className="pt-row__sub">
                    {c.estado === "pagada" && c.pagadoEn
                      ? `Pagada el ${fechaCorta(c.pagadoEn)}`
                      : c.vencimiento
                        ? `Vence ${fechaCorta(c.vencimiento)}`
                        : "—"}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="pt-row__amount">{formatSoles(c.monto)}</div>
                  <span className={`pt-badge pt-badge--${c.estado}`}>
                    {ESTADO_CUOTA_LABEL[c.estado]}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
