import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";
import { GIRO_LABEL } from "@/lib/puestos/giro";
import { ContratoView } from "./ContratoView";

export const metadata = { title: "Contrato de transferencia · Admin" };
export const dynamic = "force-dynamic";

const AREA: Record<string, { dim: string; m2: string }> = {
  d3x5: { dim: "3 x 5 metros", m2: "15 m²" },
  d3x3: { dim: "3 x 3 metros", m2: "9 m²" },
};

// fechaIngreso es una fecha de CALENDARIO (medianoche UTC). El año debe leerse
// en UTC; con timeZone Lima (UTC-5) la medianoche se corre al día —y, si es 1 de
// enero, al AÑO— anterior. Consistente con fechaCorta/fechaLarga.
function anioDe(d: Date): number {
  return d.getUTCFullYear();
}

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
          sexo: true,
          estadoCivil: true,
          direccion: true,
          distrito: true,
          provincia: true,
          departamento: true,
          numeroPadron: true,
          fechaIngreso: true,
        },
      },
      puesto: {
        select: { numero: true, bloque: true, giro: true, dimension: true },
      },
    },
  });
  if (!t) notFound();

  const tr = t.transferente;
  const area = AREA[t.puesto.dimension] ?? { dim: t.puesto.dimension, m2: "—" };
  const nombreT = `${tr.nombres} ${tr.apellidoPaterno} ${tr.apellidoMaterno ?? ""}`
    .replace(/\s+/g, " ")
    .trim();
  const nombreA = `${t.adqNombres} ${t.adqApellidoPaterno} ${t.adqApellidoMaterno ?? ""}`
    .replace(/\s+/g, " ")
    .trim();

  return (
    <ContratoView
      data={{
        fecha: t.fecha.toISOString(),
        transferente: {
          nombre: nombreT,
          sexo: tr.sexo,
          documento: `${tr.tipoDocumento} N.° ${tr.numeroDocumento}`,
          estadoCivil: tr.estadoCivil,
          direccion: tr.direccion,
          distrito: tr.distrito,
          provincia: tr.provincia,
          departamento: tr.departamento,
          padron: tr.numeroPadron,
          anioEmpadronamiento: anioDe(tr.fechaIngreso),
        },
        adquiriente: {
          nombre: nombreA,
          documento: `${t.adqTipoDocumento} N.° ${t.adqNumeroDocumento}`,
          direccion: t.adqDireccion,
          distrito: t.adqDistrito,
          provincia: t.adqProvincia,
          departamento: t.adqDepartamento,
        },
        puesto: {
          numero: t.puesto.numero,
          bloque: t.puesto.bloque,
          rubro: t.puesto.giro ? (GIRO_LABEL[t.puesto.giro] ?? "—") : "—",
          dim: area.dim,
          m2: area.m2,
        },
      }}
    />
  );
}
