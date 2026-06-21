import Link from "next/link";
import { requireSocio } from "@/lib/portal/socio";
import { getMisPuestos } from "@/lib/portal/data";
import { GIRO_LABEL, DIMENSION_LABEL } from "@/lib/puestos/giro";
import { Icon } from "@/components/admin/Icon";
import { PasswordForm } from "./PasswordForm";
import type { EstadoSocio } from "@/generated/prisma/client";

export const metadata = { title: "Mi perfil · Gran Feria Mayorista Internacional" };
export const dynamic = "force-dynamic";

const ESTADO_SOCIO_LABEL: Record<EstadoSocio, string> = {
  activo: "Activo",
  suspendido: "Suspendido",
  retirado: "Retirado",
  fallecido: "Fallecido",
};

export default async function PerfilPage() {
  const { socio } = await requireSocio();
  const puestos = await getMisPuestos(socio.id);

  return (
    <>
      <Link href="/portal" className="pt-back">
        <Icon name="chevron-right" size={15} style={{ transform: "rotate(180deg)" }} />
        Volver
      </Link>

      <div className="pt-hello">
        <h1>Mi perfil</h1>
        <p>Tus datos, tus puestos y tu contraseña.</p>
      </div>

      <section className="pt-panel">
        <h2>Mis datos</h2>
        <dl className="pt-dl">
          <dt>Nombre</dt>
          <dd>{socio.nombre}</dd>
          <dt>Código</dt>
          <dd>{socio.codigo}</dd>
          <dt>Documento</dt>
          <dd>
            {socio.tipoDocumento} {socio.numeroDocumento}
          </dd>
          <dt>Estado</dt>
          <dd>{ESTADO_SOCIO_LABEL[socio.estado]}</dd>
          <dt>Teléfono</dt>
          <dd>{socio.telefono || "—"}</dd>
          <dt>Correo</dt>
          <dd>{socio.email || "—"}</dd>
        </dl>
      </section>

      <section className="pt-panel">
        <h2>Mis puestos</h2>
        {puestos.length === 0 ? (
          <p className="pt-empty">No tienes puestos asignados.</p>
        ) : (
          <div className="pt-list">
            {puestos.map((p) => (
              <div key={p.id} className="pt-row">
                <div className="pt-row__main">
                  <div className="pt-row__title">{p.codigo}</div>
                  <div className="pt-row__sub">
                    {p.giro ? GIRO_LABEL[p.giro] : "Sin giro"} ·{" "}
                    {DIMENSION_LABEL[p.dimension]}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="pt-panel">
        <h2>Seguridad</h2>
        <PasswordForm />
      </section>
    </>
  );
}
