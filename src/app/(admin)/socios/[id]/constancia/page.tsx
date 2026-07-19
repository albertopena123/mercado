import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/money";
import { ConstanciaView } from "./ConstanciaView";
import { contarInasistenciasInjustificadas } from "./asistencia";
import { resolveFirmasConsejo } from "@/lib/organos/firmas";

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
        include: {
          puesto: { select: { codigo: true, giro: true, dimension: true } },
        },
      },
      cuotas: { where: { estado: "pendiente" }, select: { monto: true } },
    },
  });
  if (!socio) notFound();

  const deuda = socio.cuotas.reduce((acc, c) => acc + toNumber(c.monto), 0);
  const inasistencias = await contarInasistenciasInjustificadas(socio.id);
  const firmas = await resolveFirmasConsejo();

  // Historial de constancias emitidas al socio (para consultar/anular). La
  // anulación revoca el documento: su QR pasará a mostrar "ANULADA".
  const emitidas = await prisma.constancia.findMany({
    where: { socioId: socio.id },
    orderBy: { emitidoEn: "desc" },
    take: 20,
    select: {
      id: true,
      tipo: true,
      folio: true,
      codigo: true,
      motivo: true,
      emitidoEn: true,
      validoHasta: true,
      anulada: true,
      motivoAnulacion: true,
    },
  });
  const historial = emitidas.map((c) => ({
    id: c.id,
    tipo: c.tipo,
    folio: c.folio,
    codigo: c.codigo,
    motivo: c.motivo,
    emitidoEn: c.emitidoEn.toISOString(),
    validoHasta: c.validoHasta ? c.validoHasta.toISOString() : null,
    anulada: c.anulada,
    motivoAnulacion: c.motivoAnulacion,
  }));
  const puestos = socio.asignacionesPuesto.map((a) => ({
    codigo: a.puesto.codigo,
    giro: a.puesto.giro,
    dimension: a.puesto.dimension,
  }));

  const nombreCompleto = `${socio.nombres} ${socio.apellidoPaterno} ${
    socio.apellidoMaterno ?? ""
  }`
    .replace(/\s+/g, " ")
    .trim();

  // La constancia se emite a socios ACTIVOS. La de "no adeudo" exige además
  // estar sin deuda — ese candado adicional vive en la vista y en el server
  // action (por tipo). La de "socio" (membresía) se emite aunque haya deuda.
  const activo = socio.estado === "activo";
  const motivoBloqueo = activo
    ? null
    : `El socio se encuentra en estado ${
        ESTADO_LABEL[socio.estado] ?? socio.estado
      }. Solo los socios activos pueden recibir una constancia.`;

  return (
    <ConstanciaView
      socioId={socio.id}
      activo={activo}
      motivoBloqueo={motivoBloqueo}
      inasistencias={inasistencias}
      firmas={firmas}
      historial={historial}
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
