import Link from "next/link";
import { requireSocio } from "@/lib/portal/socio";
import { getMisComprobantes } from "@/lib/portal/data";
import { formatSoles } from "@/lib/money";
import { fechaTS } from "@/lib/fecha";
import { Icon } from "@/components/admin/Icon";

export const metadata = { title: "Mis comprobantes · Gran Feria Mayorista Internacional" };
export const dynamic = "force-dynamic";

const METODO_LABEL: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  yape: "Yape / Plin",
  "yape/plin": "Yape / Plin",
  deposito: "Depósito",
  otro: "Otro",
};

export default async function ComprobantesPage() {
  const { socio } = await requireSocio();
  const comprobantes = await getMisComprobantes(socio.id);

  return (
    <>
      <Link href="/portal" className="pt-back">
        <Icon
          name="chevron-right"
          size={15}
          style={{ transform: "rotate(180deg)" }}
        />
        Volver
      </Link>

      <div className="pt-hello">
        <h1>Mis comprobantes</h1>
        <p>
          Tus recibos de pago. Toca uno para verlo, imprimirlo o guardarlo en
          PDF.
        </p>
      </div>

      <section className="pt-panel">
        <h2>Recibos</h2>
        {comprobantes.length === 0 ? (
          <p className="pt-empty">Aún no tienes comprobantes de pago.</p>
        ) : (
          <div className="pt-list">
            {comprobantes.map((c) => (
              <Link
                key={c.id}
                href={`/portal/comprobantes/${c.id}`}
                className="pt-row"
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <div className="pt-row__main">
                  <div className="pt-row__title">
                    Recibo N.° {c.folio}
                    {c.anulada ? " · anulado" : ""}
                  </div>
                  <div className="pt-row__sub">
                    {fechaTS(c.emitidoEn)} ·{" "}
                    {METODO_LABEL[(c.metodoPago || "").toLowerCase()] ??
                      c.metodoPago ??
                      "—"}
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    textAlign: "right",
                  }}
                >
                  <span className="pt-row__amount">{formatSoles(c.monto)}</span>
                  <Icon name="chevron-right" size={16} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
