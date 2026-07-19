import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/money";
import { RenunciaView } from "@/app/(admin)/socios/[id]/renuncia/RenunciaView";

export const metadata = { title: "Carta de renuncia · Transferencia" };
export const dynamic = "force-dynamic";

// Carta de renuncia DE ESTE TRASPASO: el puesto es el del expediente (ya
// elegido en la transferencia), no se re-selecciona. Así la carta no puede
// quedar desalineada con el puesto que realmente se transfiere. La página
// standalone /socios/[id]/renuncia mantiene su selector para el caso
// independiente (un socio que se retira sin un traspaso concreto).
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("transferencias.read");
  const { id } = await params;

  const t = await prisma.transferencia.findUnique({
    where: { id },
    include: {
      transferente: {
        select: {
          apellidoPaterno: true,
          apellidoMaterno: true,
          nombres: true,
          tipoDocumento: true,
          numeroDocumento: true,
          cuotas: { where: { estado: "pendiente" }, select: { monto: true } },
          asignacionesPuesto: {
            where: { hasta: null },
            select: { puestoId: true },
          },
        },
      },
      puesto: { select: { codigo: true, dimension: true } },
    },
  });
  if (!t) notFound();

  const tr = t.transferente;
  const nombreCompleto = `${tr.nombres} ${tr.apellidoPaterno} ${
    tr.apellidoMaterno ?? ""
  }`
    .replace(/\s+/g, " ")
    .trim();
  const deuda = tr.cuotas.reduce((acc, c) => acc + toNumber(c.monto), 0);
  const alDia = deuda <= 0.0001;

  // El puesto es el del traspaso. Es "total" (renuncia a la condición de socio)
  // si es el único puesto vigente del transferente; si conserva otros, es la
  // cesión de ESE puesto y mantiene su membresía.
  const nPuestos = tr.asignacionesPuesto.length;
  const alcanceTotal = nPuestos <= 1;
  const conservaOtros = nPuestos > 1;

  return (
    <RenunciaView
      back={{
        href: `/transferencias/${t.id}`,
        label: "Volver a la transferencia",
      }}
      data={{
        nombreCompleto,
        tipoDocumento: tr.tipoDocumento,
        numeroDocumento: tr.numeroDocumento,
        puestos: [{ codigo: t.puesto.codigo, dimension: t.puesto.dimension }],
        alDia,
        alcanceTotal,
        conservaOtros,
      }}
    />
  );
}
