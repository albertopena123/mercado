import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/money";
import { ConstanciaView } from "./ConstanciaView";

export const metadata = { title: "Constancia de socio · Admin" };
export const dynamic = "force-dynamic";

const ESTADO_LABEL: Record<string, string> = {
  activo: "ACTIVO",
  suspendido: "SUSPENDIDO",
  retirado: "RETIRADO",
  fallecido: "FALLECIDO",
};

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("socios.read");
  const { id } = await params;

  const socio = await prisma.socio.findUnique({
    where: { id },
    include: {
      asignacionesPuesto: {
        where: { hasta: null },
        include: { puesto: { select: { codigo: true, giro: true } } },
      },
      cuotas: { where: { estado: "pendiente" }, select: { monto: true } },
    },
  });
  if (!socio) notFound();

  const deuda = socio.cuotas.reduce((acc, c) => acc + toNumber(c.monto), 0);
  const puestos = socio.asignacionesPuesto.map((a) => ({
    codigo: a.puesto.codigo,
    giro: a.puesto.giro,
  }));

  const nombreCompleto = `${socio.nombres} ${socio.apellidoPaterno} ${
    socio.apellidoMaterno ?? ""
  }`
    .replace(/\s+/g, " ")
    .trim();

  // Regla de negocio: la constancia de socio hábil solo se emite si el socio
  // está ACTIVO y SIN deuda. El candado vive aquí (servidor) para que no se
  // pueda saltar entrando directo por URL.
  const habil = socio.estado === "activo" && deuda <= 0;
  const motivoBloqueo =
    socio.estado !== "activo"
      ? `El socio se encuentra en estado ${
          ESTADO_LABEL[socio.estado] ?? socio.estado
        }. Solo los socios activos pueden recibir una constancia de socio hábil.`
      : deuda > 0
        ? `El socio mantiene una deuda pendiente de cuotas. Debe regularizar su pago para que se le pueda emitir la constancia.`
        : null;

  return (
    <ConstanciaView
      socioId={socio.id}
      habil={habil}
      motivoBloqueo={motivoBloqueo}
      data={{
        nombreCompleto,
        tipoDocumento: socio.tipoDocumento,
        numeroDocumento: socio.numeroDocumento,
        codigo: socio.codigo,
        estado: socio.estado,
        estadoLabel: ESTADO_LABEL[socio.estado] ?? socio.estado,
        fechaIngreso: socio.fechaIngreso.toISOString(),
        direccion: socio.direccion,
        puestos,
        deuda,
      }}
    />
  );
}
