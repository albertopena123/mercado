import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  anioLima,
  formatFolio,
  generarCodigoComprobante,
} from "./codigo";

function isP2002(e: unknown): boolean {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002"
  );
}

export type EmitirComprobanteArgs = {
  socioId: string | null;
  socioCodigo: string;
  socioNombre: string;
  numeroDocumento: string;
  monto: number;
  metodoPago: string | null;
  nroOperacion: string | null;
  detalle: string;
  movimientoCajaId: string | null;
  emitidoPorId: string | null;
  emitidoEn?: Date;
};

export type ComprobanteEmitido = {
  id: string;
  folio: string;
  codigo: string;
};

/**
 * Emite (registra) un comprobante de pago. Idempotente por movimientoCajaId: si
 * ya existe uno para ese ingreso de caja, lo devuelve sin crear otro. Genera el
 * folio correlativo por año (serializado con un advisory lock, igual que las
 * constancias) y un código aleatorio verificable. Reintenta ante colisiones.
 */
export async function emitirComprobantePago(
  args: EmitirComprobanteArgs,
): Promise<ComprobanteEmitido | null> {
  // Idempotencia: un comprobante por ingreso de caja.
  if (args.movimientoCajaId) {
    const existente = await prisma.comprobante.findUnique({
      where: { movimientoCajaId: args.movimientoCajaId },
      select: { id: true, folio: true, codigo: true },
    });
    if (existente) return existente;
  }

  const now = args.emitidoEn ?? new Date();
  const anio = anioLima(now);
  for (let intento = 0; intento < 6; intento++) {
    const codigo = generarCodigoComprobante(anio);
    try {
      return await prisma.$transaction(async (tx) => {
        // Serializa el correlativo del folio para emisiones concurrentes.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`comprobante-folio-${anio}`}))`;
        const desde = new Date(`${anio}-01-01T00:00:00-05:00`);
        const hasta = new Date(`${anio + 1}-01-01T00:00:00-05:00`);
        const n = await tx.comprobante.count({
          where: { emitidoEn: { gte: desde, lt: hasta } },
        });
        const folio = formatFolio(n + 1, anio);
        return tx.comprobante.create({
          data: {
            folio,
            codigo,
            socioId: args.socioId,
            socioCodigo: args.socioCodigo,
            socioNombre: args.socioNombre,
            numeroDocumento: args.numeroDocumento,
            monto: new Prisma.Decimal(args.monto.toFixed(2)),
            metodoPago: args.metodoPago,
            nroOperacion: args.nroOperacion,
            detalle: args.detalle,
            movimientoCajaId: args.movimientoCajaId,
            emitidoEn: now,
            emitidoPorId: args.emitidoPorId,
          },
          select: { id: true, folio: true, codigo: true },
        });
      });
    } catch (e) {
      // Colisión de movimientoCajaId (otro proceso ya lo emitió): devolverlo.
      if (isP2002(e) && args.movimientoCajaId) {
        const ex = await prisma.comprobante.findUnique({
          where: { movimientoCajaId: args.movimientoCajaId },
          select: { id: true, folio: true, codigo: true },
        });
        if (ex) return ex;
      }
      // Colisión de folio/código: reintenta con nuevo código y recuento.
      if (isP2002(e) && intento < 5) continue;
      throw e;
    }
  }
  return null;
}
