import "server-only";
import { mkdir, writeFile, rm, readFile } from "node:fs/promises";
import path from "node:path";

// Comprobantes (boleta/factura/recibo) de movimientos de caja. Privados: se
// sirven solo con permiso caja.read vía /api/uploads/caja/<movId>/<file>.
const ROOT = path.join(process.cwd(), "private-uploads", "caja");

function safeDir(movId: string): string {
  if (!/^[a-z0-9]+$/i.test(movId)) throw new Error("INVALID_MOV_ID");
  return path.join(ROOT, movId);
}
function safeFile(movId: string, fileName: string): string {
  if (!/^[a-z0-9._-]+$/i.test(fileName)) throw new Error("INVALID_FILENAME");
  return path.join(safeDir(movId), fileName);
}

export async function writeComprobante(
  movId: string,
  fileName: string,
  buffer: Buffer,
): Promise<string> {
  await mkdir(safeDir(movId), { recursive: true });
  await writeFile(safeFile(movId, fileName), buffer);
  return `/api/uploads/caja/${movId}/${fileName}`;
}

export async function readComprobante(
  movId: string,
  fileName: string,
): Promise<Buffer> {
  return await readFile(safeFile(movId, fileName));
}

export async function removeMovimientoDir(movId: string): Promise<void> {
  await rm(safeDir(movId), { recursive: true, force: true }).catch(
    () => undefined,
  );
}

// Borra un comprobante concreto (p. ej. el anterior al reemplazarlo).
export async function removeComprobante(
  movId: string,
  fileName: string,
): Promise<void> {
  await rm(safeFile(movId, fileName), { force: true }).catch(() => undefined);
}

export function extFromMime(mime: string): string {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "application/pdf":
      return "pdf";
    default:
      throw new Error("MIME_NOT_ALLOWED");
  }
}
