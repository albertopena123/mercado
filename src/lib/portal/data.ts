import "server-only";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/money";
import type {
  EstadoCuota,
  EstadoAsamblea,
  EstadoAsistencia,
  TipoAsamblea,
  TipoAnuncio,
  Giro,
  DimensionPuesto,
  EstadoPuesto,
} from "@/generated/prisma/client";

/* ───────────────────────── Cuotas / deuda ───────────────────────── */
export type MiCuota = {
  id: string;
  periodo: string;
  concepto: string;
  monto: number;
  estado: EstadoCuota;
  vencimiento: string | null;
  pagadoEn: string | null;
};
export type MisCuotas = {
  deuda: number;
  saldoAFavor: number;
  cuotas: MiCuota[];
};

export async function getMisCuotas(socioId: string): Promise<MisCuotas> {
  const [cuotas, socio] = await Promise.all([
    prisma.cuota.findMany({
      where: { socioId },
      orderBy: [{ periodo: "desc" }],
      select: {
        id: true,
        periodo: true,
        concepto: true,
        monto: true,
        estado: true,
        vencimiento: true,
        pagadoEn: true,
      },
    }),
    prisma.socio.findUnique({
      where: { id: socioId },
      select: { saldoAFavor: true },
    }),
  ]);
  const deuda = cuotas
    .filter((c) => c.estado === "pendiente")
    .reduce((acc, c) => acc + toNumber(c.monto), 0);
  return {
    deuda,
    saldoAFavor: toNumber(socio?.saldoAFavor),
    cuotas: cuotas.map((c) => ({
      id: c.id,
      periodo: c.periodo,
      concepto: c.concepto,
      monto: toNumber(c.monto),
      estado: c.estado,
      vencimiento: c.vencimiento ? c.vencimiento.toISOString() : null,
      pagadoEn: c.pagadoEn ? c.pagadoEn.toISOString() : null,
    })),
  };
}

/* ───────────────────────── Puestos ───────────────────────── */
export type MiPuesto = {
  id: string;
  codigo: string;
  giro: Giro | null;
  dimension: DimensionPuesto;
  estado: EstadoPuesto;
  desde: string;
};

export async function getMisPuestos(socioId: string): Promise<MiPuesto[]> {
  const asigs = await prisma.puestoAsignacion.findMany({
    where: { socioId, hasta: null },
    orderBy: { desde: "desc" },
    select: {
      desde: true,
      puesto: {
        select: {
          id: true,
          codigo: true,
          giro: true,
          dimension: true,
          estado: true,
        },
      },
    },
  });
  return asigs.map((a) => ({
    id: a.puesto.id,
    codigo: a.puesto.codigo,
    giro: a.puesto.giro,
    dimension: a.puesto.dimension,
    estado: a.puesto.estado,
    desde: a.desde.toISOString(),
  }));
}

/* ───────────────────────── Comunicados ───────────────────────── */
export type MiComunicado = {
  id: string;
  titulo: string;
  resumen: string | null;
  contenido: string;
  tipo: TipoAnuncio;
  imagenUrl: string | null;
  publicadoEn: string | null;
};

export async function getMisComunicados(): Promise<MiComunicado[]> {
  const now = new Date();
  const rows = await prisma.anuncio.findMany({
    where: {
      estado: "publicado",
      visibilidad: { in: ["publico", "socios"] },
      OR: [{ validoHasta: null }, { validoHasta: { gt: now } }],
    },
    orderBy: [{ fijado: "desc" }, { publicadoEn: "desc" }],
    take: 50,
    select: {
      id: true,
      titulo: true,
      resumen: true,
      contenido: true,
      tipo: true,
      imagenUrl: true,
      publicadoEn: true,
    },
  });
  return rows.map((a) => ({
    id: a.id,
    titulo: a.titulo,
    resumen: a.resumen,
    contenido: a.contenido,
    tipo: a.tipo,
    imagenUrl: a.imagenUrl,
    publicadoEn: a.publicadoEn ? a.publicadoEn.toISOString() : null,
  }));
}

/* ───────────────────────── Asambleas / reuniones ───────────────────────── */
export type MiAsamblea = {
  asambleaId: string;
  titulo: string;
  tipo: TipoAsamblea;
  fecha: string;
  lugar: string | null;
  estadoAsamblea: EstadoAsamblea;
  miEstado: EstadoAsistencia;
};

export async function getMisAsambleas(socioId: string): Promise<MiAsamblea[]> {
  const asis = await prisma.asistencia.findMany({
    where: { socioId },
    orderBy: { asamblea: { fecha: "desc" } },
    take: 50,
    select: {
      estado: true,
      asamblea: {
        select: {
          id: true,
          titulo: true,
          tipo: true,
          fecha: true,
          lugar: true,
          estado: true,
        },
      },
    },
  });
  return asis.map((a) => ({
    asambleaId: a.asamblea.id,
    titulo: a.asamblea.titulo,
    tipo: a.asamblea.tipo,
    fecha: a.asamblea.fecha.toISOString(),
    lugar: a.asamblea.lugar,
    estadoAsamblea: a.asamblea.estado,
    miEstado: a.estado,
  }));
}

/* ───────────────────────── Resumen del dashboard ───────────────────────── */
export type MiResumen = {
  deuda: number;
  saldoAFavor: number;
  comunicados: number;
  puestos: number;
  reuniones: number;
};

export async function getMiResumen(socioId: string): Promise<MiResumen> {
  const now = new Date();
  const [pendientes, socio, comunicados, puestos, reuniones] = await Promise.all([
    prisma.cuota.findMany({
      where: { socioId, estado: "pendiente" },
      select: { monto: true },
    }),
    prisma.socio.findUnique({
      where: { id: socioId },
      select: { saldoAFavor: true },
    }),
    prisma.anuncio.count({
      where: {
        estado: "publicado",
        visibilidad: { in: ["publico", "socios"] },
        OR: [{ validoHasta: null }, { validoHasta: { gt: now } }],
      },
    }),
    prisma.puestoAsignacion.count({ where: { socioId, hasta: null } }),
    prisma.asistencia.count({ where: { socioId } }),
  ]);
  return {
    deuda: pendientes.reduce((acc, c) => acc + toNumber(c.monto), 0),
    saldoAFavor: toNumber(socio?.saldoAFavor),
    comunicados,
    puestos,
    reuniones,
  };
}
