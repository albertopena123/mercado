import Link from "next/link";
import { requireSocio } from "@/lib/portal/socio";
import { getMisComprobantes } from "@/lib/portal/data";
import { Icon } from "@/components/admin/Icon";
import { ComprobantesList } from "./ComprobantesList";

export const metadata = { title: "Mis comprobantes · Feria Mayorista Internacional Milagros" };
export const dynamic = "force-dynamic";

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
        <ComprobantesList items={comprobantes} />
      </section>
    </>
  );
}
