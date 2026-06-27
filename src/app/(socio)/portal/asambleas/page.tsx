import Link from "next/link";
import { requireSocio } from "@/lib/portal/socio";
import { getMisAsambleas } from "@/lib/portal/data";
import { Icon } from "@/components/admin/Icon";
import { AsambleasList } from "./AsambleasList";

export const metadata = { title: "Reuniones · Feria Mayorista Internacional Milagros" };
export const dynamic = "force-dynamic";

export default async function AsambleasPage() {
  const { socio } = await requireSocio();
  const asambleas = await getMisAsambleas(socio.id);

  return (
    <>
      <Link href="/portal" className="pt-back">
        <Icon name="chevron-right" size={15} style={{ transform: "rotate(180deg)" }} />
        Volver
      </Link>

      <div className="pt-hello">
        <h1>Reuniones</h1>
        <p>Tus asambleas y tu asistencia. En la reunión, escanea el QR para registrarte.</p>
      </div>

      <section className="pt-panel">
        <AsambleasList items={asambleas} />
      </section>
    </>
  );
}
