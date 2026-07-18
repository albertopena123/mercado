import "server-only";
import { mkdir, writeFile, rm, readFile } from "node:fs/promises";
import path from "node:path";

// Firmas escaneadas de los directivos. Privadas: se sirven solo con permiso
// organos.read vía /api/uploads/organos/<id>/<file>.
const ROOT = path.join(process.cwd(), "private-uploads", "organos");

function safeDir(id: string): string {
  if (!/^[a-z0-9]+$/i.test(id)) throw new Error("INVALID_ID");
  return path.join(ROOT, id);
}
function safeFile(id: string, fileName: string): string {
  if (!/^[a-z0-9._-]+$/i.test(fileName)) throw new Error("INVALID_FILENAME");
  return path.join(safeDir(id), fileName);
}

export async function writeFirma(
  id: string,
  fileName: string,
  buffer: Buffer,
): Promise<string> {
  await mkdir(safeDir(id), { recursive: true });
  await writeFile(safeFile(id, fileName), buffer);
  return `/api/uploads/organos/${id}/${fileName}`;
}

export async function readFirma(id: string, fileName: string): Promise<Buffer> {
  return await readFile(safeFile(id, fileName));
}

export async function removeFirma(id: string, fileName: string): Promise<void> {
  await rm(safeFile(id, fileName), { force: true }).catch(() => undefined);
}

// Solo imágenes: la firma nunca es un PDF.
export function extFromMime(mime: string): string {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      throw new Error("MIME_NOT_ALLOWED");
  }
}
