import "server-only";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/money";
import { appBaseUrl } from "@/lib/url";
import { generarQrSvg } from "@/lib/constancia/qr";
import type { ComprobanteData } from "@/components/comprobante/ComprobanteView";

/**
 * Carga un comprobante por id y arma los datos para la vista imprimible
 * (incluido el QR que apunta a su verificación pública). Si se pasa `socioId`,
 * exige que el comprobante pertenezca a ese socio (para el portal del socio).
 */
export async function cargarComprobante(
  id: string,
  opts?: { socioId?: string },
): Promise<{ data: ComprobanteData; qrSvg: string; verifyUrl: string } | null> {
  const c = await prisma.comprobante.findUnique({
    where: { id },
    select: {
      folio: true,
      codigo: true,
      socioId: true,
      socioCodigo: true,
      socioNombre: true,
      numeroDocumento: true,
      monto: true,
      metodoPago: true,
      nroOperacion: true,
      detalle: true,
      emitidoEn: true,
      anulada: true,
    },
  });
  if (!c) return null;
  if (opts?.socioId && c.socioId !== opts.socioId) return null;

  const verifyUrl = `${await appBaseUrl()}/comprobantes/verificar/${c.codigo}`;
  const qrSvg = await generarQrSvg(verifyUrl);
  return {
    data: {
      folio: c.folio,
      codigo: c.codigo,
      socioNombre: c.socioNombre,
      socioCodigo: c.socioCodigo,
      numeroDocumento: c.numeroDocumento,
      monto: toNumber(c.monto),
      metodoPago: c.metodoPago,
      nroOperacion: c.nroOperacion,
      detalle: c.detalle,
      emitidoEn: c.emitidoEn.toISOString(),
      anulada: c.anulada,
    },
    qrSvg,
    verifyUrl,
  };
}
