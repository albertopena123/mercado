import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";
import { EstadoCuentaView } from "./EstadoCuentaView";

export const metadata = { title: "Estado de cuenta · Admin" };
export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("cuotas.read");
  const { id } = await params;

  const socio = await prisma.socio.findUnique({
    where: { id },
    select: {
      id: true,
      codigo: true,
      numeroPadron: true,
      estado: true,
      tipoDocumento: true,
      numeroDocumento: true,
      apellidoPaterno: true,
      apellidoMaterno: true,
      nombres: true,
    },
  });
  if (!socio) notFound();

  const nombre = `${socio.apellidoPaterno} ${socio.apellidoMaterno ?? ""}, ${
    socio.nombres
  }`
    .replace(/\s{2,}/g, " ")
    .replace(" ,", ",")
    .trim();

  return (
    <EstadoCuentaView
      socio={{
        id: socio.id,
        codigo: socio.codigo,
        numeroPadron: socio.numeroPadron,
        estado: socio.estado,
        documento: `${socio.tipoDocumento} ${socio.numeroDocumento}`,
        nombre,
        nombreCorto: `${socio.apellidoPaterno} ${socio.nombres}`,
      }}
    />
  );
}
