import "server-only";
import QRCode from "qrcode";

/**
 * Genera el código QR como SVG (string). Se devuelve como markup para incrustarlo
 * en la constancia: el SVG es nítido al imprimir y no depende de JS en cliente.
 * Nivel de corrección de errores "M" (≈15%): tolera el QR impreso con manchas.
 */
export async function generarQrSvg(texto: string): Promise<string> {
  const svg = await QRCode.toString(texto, {
    type: "svg",
    margin: 0,
    errorCorrectionLevel: "M",
    color: { dark: "#0f172a", light: "#ffffff" },
  });
  // Se quita el prólogo XML para incrustarlo limpio dentro del HTML; el tamaño
  // final lo controla el CSS sobre el <svg> (viewBox escala el dibujo).
  return svg.replace(/<\?xml[^>]*\?>\s*/i, "").trim();
}
