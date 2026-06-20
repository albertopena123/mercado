import "server-only";
import { mkdir, writeFile, rm, readFile } from "node:fs/promises";
import path from "node:path";

// Escaneos firmados (carta de renuncia, contrato) de una transferencia.
// Privados: se sirven solo con permiso transferencias.read vía
// /api/uploads/transferencias/<id>/<file>.
const ROOT = path.join(process.cwd(), "private-uploads", "transferencias");

function safeDir(id: string): string {
  if (!/^[a-z0-9]+$/i.test(id)) throw new Error("INVALID_ID");
  return path.join(ROOT, id);
}
function safeFile(id: string, fileName: string): string {
  if (!/^[a-z0-9._-]+$/i.test(fileName)) throw new Error("INVALID_FILENAME");
  return path.join(safeDir(id), fileName);
}

export async function writeDocumento(
  id: string,
  fileName: string,
  buffer: Buffer,
): Promise<string> {
  await mkdir(safeDir(id), { recursive: true });
  await writeFile(safeFile(id, fileName), buffer);
  return `/api/uploads/transferencias/${id}/${fileName}`;
}

export async function readDocumento(
  id: string,
  fileName: string,
): Promise<Buffer> {
  return await readFile(safeFile(id, fileName));
}

export async function removeDocumento(
  id: string,
  fileName: string,
): Promise<void> {
  await rm(safeFile(id, fileName), { force: true }).catch(() => undefined);
}

export async function removeTransferenciaDir(id: string): Promise<void> {
  await rm(safeDir(id), { recursive: true, force: true }).catch(
    () => undefined,
  );
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
