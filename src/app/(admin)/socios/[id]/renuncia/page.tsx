import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/money";
import { RenunciaManager } from "./RenunciaManager";
import type { RenunciaData } from "./types";

export const metadata = { title: "Renuncia del socio · Admin" };
export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await requirePermission("socios.read");
  const { id } = await params;
  const canWrite = me.permissions.has("socios.write");
  const canChangeState = me.permissions.has("socios.change-state");

  const socio = await prisma.socio.findUnique({
    where: { id },
    include: {
      asignacionesPuesto: {
        where: { hasta: null },
        include: {
          puesto: { select: { id: true, codigo: true, dimension: true } },
        },
      },
      cuotas: { where: { estado: "pendiente" }, select: { monto: true } },
      renuncias: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { puesto: { select: { codigo: true, dimension: true } } },
      },
    },
  });
  if (!socio) notFound();

  // La carta solo afirma estar "al día en pagos" si realmente NO hay deuda.
  const deuda = socio.cuotas.reduce((acc, c) => acc + toNumber(c.monto), 0);
  const alDia = deuda <= 0.0001;

  const nombreCompleto = `${socio.nombres} ${socio.apellidoPaterno} ${
    socio.apellidoMaterno ?? ""
  }`
    .replace(/\s+/g, " ")
    .trim();
  const puestosOpciones = socio.asignacionesPuesto.map((a) => ({
    id: a.puesto.id,
    codigo: a.puesto.codigo,
    dimension: a.puesto.dimension,
  }));

  const r = socio.renuncias[0] ?? null;
  const renuncia: RenunciaData | null = r
    ? {
        id: r.id,
        estado: r.estado,
        puestoId: r.puestoId,
        puestoCodigo: r.puesto?.codigo ?? null,
        puestoDimension: r.puesto?.dimension ?? null,
        motivo: r.motivo,
        fechaSolicitud: r.fechaSolicitud.toISOString(),
        actaCdNumero: r.actaCdNumero,
        actaCdFecha: r.actaCdFecha ? r.actaCdFecha.toISOString() : null,
        actaAgNumero: r.actaAgNumero,
        actaAgFecha: r.actaAgFecha ? r.actaAgFecha.toISOString() : null,
        efectivaEn: r.efectivaEn ? r.efectivaEn.toISOString() : null,
        motivoRechazo: r.motivoRechazo,
        observaciones: r.observaciones,
      }
    : null;

  return (
    <RenunciaManager
      socioId={socio.id}
      estadoSocio={socio.estado}
      renuncia={renuncia}
      canWrite={canWrite}
      canChangeState={canChangeState}
      puestosOpciones={puestosOpciones}
      carta={{
        nombreCompleto,
        tipoDocumento: socio.tipoDocumento,
        numeroDocumento: socio.numeroDocumento,
        alDia,
      }}
    />
  );
}
