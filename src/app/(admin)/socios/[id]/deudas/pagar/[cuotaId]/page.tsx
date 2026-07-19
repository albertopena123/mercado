import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/money";
import { esAutovaluo } from "@/lib/cuotas/autovaluo";
import { RegistrarPagoView } from "./RegistrarPagoView";

export const metadata = { title: "Registrar pago · Admin" };
export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string; cuotaId: string }>;
}) {
  await requirePermission("cuotas.pay");
  const { id, cuotaId } = await params;

  const cuota = await prisma.cuota.findUnique({
    where: { id: cuotaId },
    select: {
      id: true,
      socioId: true,
      periodo: true,
      concepto: true,
      monto: true,
      vencimiento: true,
      estado: true,
      pagadoEn: true,
      metodoPago: true,
      nroOperacion: true,
      motivo: true,
      socio: {
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
      },
    },
  });
  // La cuota debe existir y pertenecer al socio de la URL (evita pagar la cuota
  // de otro socio manipulando el id en la ruta).
  if (!cuota || cuota.socioId !== id) notFound();

  // Otras cuotas pendientes del socio: contexto para la secretaria ("sus deudas").
  const otras = await prisma.cuota.findMany({
    where: { socioId: id, estado: "pendiente", id: { not: cuotaId } },
    orderBy: [{ periodo: "asc" }],
    select: { id: true, periodo: true, concepto: true, monto: true },
  });

  const s = cuota.socio;
  const nombre = `${s.apellidoPaterno} ${s.apellidoMaterno ?? ""}, ${s.nombres}`
    .replace(/\s{2,}/g, " ")
    .replace(" ,", ",")
    .trim();

  return (
    <RegistrarPagoView
      key={cuota.id}
      socio={{
        id: s.id,
        codigo: s.codigo,
        numeroPadron: s.numeroPadron,
        estado: s.estado,
        documento: `${s.tipoDocumento} ${s.numeroDocumento}`,
        nombre,
        nombreCorto: `${s.apellidoPaterno} ${s.nombres}`,
      }}
      cuota={{
        id: cuota.id,
        periodo: cuota.periodo,
        concepto: cuota.concepto,
        monto: toNumber(cuota.monto),
        vencimiento: cuota.vencimiento ? cuota.vencimiento.toISOString() : null,
        estado: cuota.estado,
        esAutovaluo: esAutovaluo(cuota.concepto),
        pagadoEn: cuota.pagadoEn ? cuota.pagadoEn.toISOString() : null,
        metodoPago: cuota.metodoPago,
        nroOperacion: cuota.nroOperacion,
        motivo: cuota.motivo,
      }}
      otrasPendientes={otras.map((o) => ({
        id: o.id,
        periodo: o.periodo,
        concepto: o.concepto,
        monto: toNumber(o.monto),
        esAutovaluo: esAutovaluo(o.concepto),
      }))}
    />
  );
}
