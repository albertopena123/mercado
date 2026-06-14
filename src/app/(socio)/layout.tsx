import { requireSocio } from "@/lib/portal/socio";
import { SocioShell } from "@/components/socio/SocioShell";

export default async function SocioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { socio } = await requireSocio();
  return (
    <SocioShell socio={{ nombre: socio.nombre, codigo: socio.codigo }}>
      {children}
    </SocioShell>
  );
}
