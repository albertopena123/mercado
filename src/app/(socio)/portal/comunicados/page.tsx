import Link from "next/link";
import { requireSocio } from "@/lib/portal/socio";
import { getMisComunicados } from "@/lib/portal/data";
import { Icon } from "@/components/admin/Icon";
import { ComunicadosList } from "./ComunicadosList";

export const metadata = { title: "Comunicados · Feria Mayorista Internacional Milagros" };
export const dynamic = "force-dynamic";

export default async function ComunicadosPage() {
  await requireSocio();
  const items = await getMisComunicados();

  return (
    <>
      <Link href="/portal" className="pt-back">
        <Icon name="chevron-right" size={15} style={{ transform: "rotate(180deg)" }} />
        Volver
      </Link>

      <div className="pt-hello">
        <h1>Comunicados</h1>
        <p>Anuncios y comunicados de la Feria Mayorista Internacional Milagros.</p>
      </div>

      <ComunicadosList items={items} />
    </>
  );
}
