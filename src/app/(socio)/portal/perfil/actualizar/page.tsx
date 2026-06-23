import Link from "next/link";
import { requireSocio } from "@/lib/portal/socio";
import { getMisDatosCompletos, getMiSolicitudActiva } from "@/lib/portal/data";
import { Icon } from "@/components/admin/Icon";
import { ActualizarDatosForm } from "../ActualizarDatosForm";

export const metadata = { title: "Actualizar mis datos · Feria Mayorista Internacional Milagros" };
export const dynamic = "force-dynamic";

export default async function ActualizarDatosPage() {
  const { socio } = await requireSocio();
  const [datos, solicitud] = await Promise.all([
    getMisDatosCompletos(socio.id),
    getMiSolicitudActiva(socio.id),
  ]);

  return (
    <>
      <Link href="/portal/perfil" className="pt-back">
        <Icon name="chevron-right" size={15} style={{ transform: "rotate(180deg)" }} />
        Volver
      </Link>

      <div className="pt-hello">
        <h1>Actualizar mis datos</h1>
        <p>
          Ingresa tu DNI para autollenar tus datos, corrige lo que falte y envía.
          Un administrador revisará y aprobará los cambios.
        </p>
      </div>

      {solicitud.estado === "rechazada" && (
        <section className="pt-panel">
          <p>
            Tu última solicitud fue rechazada
            {solicitud.motivoRechazo ? `: ${solicitud.motivoRechazo}` : "."} Puedes
            corregir y volver a enviar.
          </p>
        </section>
      )}

      <section className="pt-panel">
        <ActualizarDatosForm
          datos={datos}
          tienePendiente={solicitud.estado === "pendiente"}
        />
      </section>
    </>
  );
}
