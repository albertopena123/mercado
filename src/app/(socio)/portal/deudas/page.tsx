import Link from "next/link";
import { requireSocio } from "@/lib/portal/socio";
import { getMisCuotas } from "@/lib/portal/data";
import { formatSoles } from "@/lib/money";
import { Icon } from "@/components/admin/Icon";
import { CuotasList } from "./CuotasList";

export const metadata = { title: "Mis deudas · Feria Mayorista Internacional Milagros" };
export const dynamic = "force-dynamic";

export default async function DeudasPage() {
  const { socio } = await requireSocio();
  const { deuda, cuotas } = await getMisCuotas(socio.id);

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
      </div>

      <section className="pt-panel">
        <h2>Cuotas</h2>
        <CuotasList items={cuotas} />
      </section>
    </>
  );
}
