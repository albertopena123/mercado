import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/money";
import { ProformaView } from "./ProformaView";

export const metadata = { title: "Proforma de deuda · Admin" };
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
      cuotas: {
        where: { estado: { in: ["pendiente", "exonerada"] } },
        orderBy: [{ periodo: "asc" }],
        select: {
          id: true,
          periodo: true,
          concepto: true,
          monto: true,
          vencimiento: true,
          estado: true,
          motivo: true,
        },
      },
    },
  });
  if (!socio) notFound();

  const nombre = `${socio.apellidoPaterno} ${socio.apellidoMaterno ?? ""}, ${
    socio.nombres
  }`
    .replace(/\s{2,}/g, " ")
    .replace(" ,", ",")
    .trim();

  const pendientes = socio.cuotas
    .filter((c) => c.estado === "pendiente")
    .map((c) => ({
      id: c.id,
      periodo: c.periodo,
      concepto: c.concepto,
      monto: toNumber(c.monto),
      vencimiento: c.vencimiento ? c.vencimiento.toISOString() : null,
    }));

  const exoneradas = socio.cuotas
    .filter((c) => c.estado === "exonerada")
    .map((c) => ({
      id: c.id,
      periodo: c.periodo,
      concepto: c.concepto,
      monto: toNumber(c.monto),
      motivo: c.motivo,
    }));

  return (
    <ProformaView
      socioId={id}
      socio={{
        codigo: socio.codigo,
        numeroPadron: socio.numeroPadron,
        estado: socio.estado,
        documento: `${socio.tipoDocumento} ${socio.numeroDocumento}`,
        nombre,
      }}
      pendientes={pendientes}
      exoneradas={exoneradas}
    />
  );
}
