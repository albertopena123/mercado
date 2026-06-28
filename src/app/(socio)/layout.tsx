import { requireSocio } from "@/lib/portal/socio";
import { getMisNotificaciones } from "@/lib/portal/data";
import { SocioShell } from "@/components/socio/SocioShell";

export default async function SocioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { socio } = await requireSocio();
  const notificaciones = await getMisNotificaciones(socio.id);
  return (
    <SocioShell
      socio={{ nombre: socio.nombre, codigo: socio.codigo }}
      notificaciones={notificaciones}
    >
      {children}
    </SocioShell>
  );
}
