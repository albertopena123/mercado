import "server-only";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/money";
import { inicioDiaUTC, hoyISOPeru } from "@/lib/fecha";
import type {
  EstadoCuota,
  EstadoAsamblea,
  EstadoAsistencia,
  TipoAsamblea,
  TipoAnuncio,
  Giro,
  DimensionPuesto,
  EstadoPuesto,
  Sexo,
  TipoDocumento,
} from "@/generated/prisma/client";
import { esDocumentoPendiente } from "@/lib/socios/document";

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

/* ───────────────────────── Comprobantes de pago ───────────────────────── */
export type MiComprobante = {
  id: string;
  folio: string;
  monto: number;
  metodoPago: string | null;
  detalle: string;
  emitidoEn: string;
  anulada: boolean;
};

export async function getMisComprobantes(
  socioId: string,
): Promise<MiComprobante[]> {
  const rows = await prisma.comprobante.findMany({
    where: { socioId },
    orderBy: { emitidoEn: "desc" },
    take: 300,
    select: {
      id: true,
      folio: true,
      monto: true,
      metodoPago: true,
      detalle: true,
      emitidoEn: true,
      anulada: true,
    },
  });
  return rows.map((c) => ({
    id: c.id,
    folio: c.folio,
    monto: toNumber(c.monto),
    metodoPago: c.metodoPago,
    detalle: c.detalle,
    emitidoEn: c.emitidoEn.toISOString(),
    anulada: c.anulada,
  }));
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
const COMUNICADOS_LIMIT = 100;

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
  // Vigente durante todo su último día en Perú (validoHasta es fecha de
  // calendario en medianoche UTC); comparar con now() lo expiraba un día antes.
  const hoy = inicioDiaUTC(hoyISOPeru());
  const rows = await prisma.anuncio.findMany({
    where: {
      estado: "publicado",
      visibilidad: { in: ["publico", "socios"] },
      OR: [{ validoHasta: null }, { validoHasta: { gte: hoy } }],
    },
    orderBy: [{ fijado: "desc" }, { publicadoEn: "desc" }],
    take: COMUNICADOS_LIMIT,
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
  codigo: string | null;
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
    take: 150,
    select: {
      estado: true,
      asamblea: {
        select: {
          id: true,
          codigoVerificacion: true,
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
    codigo: a.asamblea.codigoVerificacion,
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
  ultimoPago: string | null;
  proximoVencimiento: string | null;
  proximoVencido: boolean;
  montoProximo: number;
};

export async function getMiResumen(socioId: string): Promise<MiResumen> {
  const hoy = inicioDiaUTC(hoyISOPeru());
  const [cuotas, socio, comunicados, puestos, reuniones] = await Promise.all([
    prisma.cuota.findMany({
      where: { socioId },
      select: { monto: true, estado: true, vencimiento: true, pagadoEn: true },
    }),
    prisma.socio.findUnique({
      where: { id: socioId },
      select: { saldoAFavor: true },
    }),
    prisma.anuncio.count({
      where: {
        estado: "publicado",
        visibilidad: { in: ["publico", "socios"] },
        OR: [{ validoHasta: null }, { validoHasta: { gte: hoy } }],
      },
    }),
    prisma.puestoAsignacion.count({ where: { socioId, hasta: null } }),
    prisma.asistencia.count({ where: { socioId } }),
  ]);

  const pendientes = cuotas.filter((c) => c.estado === "pendiente");
  const deuda = pendientes.reduce((acc, c) => acc + toNumber(c.monto), 0);

  // Último pago: la cuota pagada más reciente.
  const ultimoPago =
    cuotas
      .filter((c) => c.estado === "pagada" && c.pagadoEn)
      .map((c) => c.pagadoEn as Date)
      .sort((a, b) => b.getTime() - a.getTime())[0]
      ?.toISOString() ?? null;

  // Próximo a vencer: la cuota pendiente futura (vence hoy o después) más
  // cercana. Si ninguna está vigente, caemos a la más antigua (ya vencida) y
  // la marcamos como tal para que la UI la rotule "Cuota vencida".
  const pendConVenc = pendientes
    .filter((c) => c.vencimiento)
    .sort(
      (a, b) =>
        (a.vencimiento as Date).getTime() - (b.vencimiento as Date).getTime(),
    );
  const proxFuturo =
    pendConVenc.find((c) => (c.vencimiento as Date).getTime() >= hoy.getTime())
      ?.vencimiento ?? null;
  const proxVenc = proxFuturo ?? pendConVenc[0]?.vencimiento ?? null;
  const proximoVencido = proxVenc ? proxVenc.getTime() < hoy.getTime() : false;
  const montoProximo = proxVenc
    ? pendConVenc
        .filter((c) => (c.vencimiento as Date).getTime() === proxVenc.getTime())
        .reduce((acc, c) => acc + toNumber(c.monto), 0)
    : 0;

  return {
    deuda,
    saldoAFavor: toNumber(socio?.saldoAFavor),
    comunicados: Math.min(comunicados, COMUNICADOS_LIMIT),
    puestos,
    reuniones,
    ultimoPago,
    proximoVencimiento: proxVenc ? proxVenc.toISOString() : null,
    proximoVencido,
    montoProximo,
  };
}

/* ───────────────────────── Datos personales del socio ───────────────────────── */
export type MisDatosActuales = {
  tipoDocumento: TipoDocumento;
  numeroDocumento: string;
  apellidoPaterno: string;
  apellidoMaterno: string | null;
  nombres: string;
  fechaNacimiento: string | null; // yyyy-mm-dd
  sexo: Sexo | null;
  estadoCivil: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  distrito: string | null;
  provincia: string | null;
  departamento: string | null;
  documentoPendiente: boolean; // SIN-DNI-#### → invita a regularizar
};

export async function getMisDatosCompletos(
  socioId: string,
): Promise<MisDatosActuales> {
  const s = await prisma.socio.findUniqueOrThrow({
    where: { id: socioId },
    select: {
      tipoDocumento: true,
      numeroDocumento: true,
      apellidoPaterno: true,
      apellidoMaterno: true,
      nombres: true,
      fechaNacimiento: true,
      sexo: true,
      estadoCivil: true,
      telefono: true,
      email: true,
      direccion: true,
      distrito: true,
      provincia: true,
      departamento: true,
    },
  });
  return {
    ...s,
    fechaNacimiento: s.fechaNacimiento
      ? s.fechaNacimiento.toISOString().slice(0, 10)
      : null,
    documentoPendiente: esDocumentoPendiente(s.numeroDocumento),
  };
}

export type EstadoMiSolicitud =
  | { estado: "ninguna" }
  | { estado: "pendiente"; id: string; creadoEn: string }
  | {
      estado: "rechazada";
      id: string;
      motivoRechazo: string | null;
      revisadoEn: string | null;
    };

export async function getMiSolicitudActiva(
  socioId: string,
): Promise<EstadoMiSolicitud> {
  // La pendiente manda; si no hay, mostramos la última rechazada (con motivo)
  // para que el socio sepa por qué y pueda reenviar.
  const pendiente = await prisma.solicitudActualizacionDatos.findFirst({
    where: { socioId, estado: "pendiente" },
    select: { id: true, creadoEn: true },
  });
  if (pendiente)
    return {
      estado: "pendiente",
      id: pendiente.id,
      creadoEn: pendiente.creadoEn.toISOString(),
    };
  const rechazada = await prisma.solicitudActualizacionDatos.findFirst({
    where: { socioId, estado: "rechazada" },
    orderBy: { revisadoEn: "desc" },
    select: { id: true, motivoRechazo: true, revisadoEn: true },
  });
  if (rechazada)
    return {
      estado: "rechazada",
      id: rechazada.id,
      motivoRechazo: rechazada.motivoRechazo,
      revisadoEn: rechazada.revisadoEn?.toISOString() ?? null,
    };
  return { estado: "ninguna" };
}
