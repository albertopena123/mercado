import "server-only";
import { mkdir, writeFile, rm, readFile } from "node:fs/promises";
import path from "node:path";

// Imágenes de anuncios. A diferencia de los adjuntos de socios (privados), estas
// se sirven PÚBLICAMENTE porque aparecen en el landing. Se guardan en disco y se
// exponen vía /api/uploads/anuncios/<anuncioId>/<file>.
const ROOT = path.join(process.cwd(), "private-uploads", "anuncios");

function safeDir(anuncioId: string): string {
  if (!/^[a-z0-9]+$/i.test(anuncioId)) throw new Error("INVALID_ANUNCIO_ID");
  return path.join(ROOT, anuncioId);
}

function safeFile(anuncioId: string, fileName: string): string {
  if (!/^[a-z0-9._-]+$/i.test(fileName)) throw new Error("INVALID_FILENAME");
  return path.join(safeDir(anuncioId), fileName);
}

export async function writeImagen(
  anuncioId: string,
  fileName: string,
  buffer: Buffer,
): Promise<string> {
  const dir = safeDir(anuncioId);
  await mkdir(dir, { recursive: true });
  await writeFile(safeFile(anuncioId, fileName), buffer);
  return `/api/uploads/anuncios/${anuncioId}/${fileName}`;
}

export async function readImagen(
  anuncioId: string,
  fileName: string,
): Promise<Buffer> {
  return await readFile(safeFile(anuncioId, fileName));
}

export async function removeAnuncioDir(anuncioId: string): Promise<void> {
  await rm(safeDir(anuncioId), { recursive: true, force: true }).catch(
    () => undefined,
  );
}

// Borra un archivo concreto (p. ej. la imagen anterior al reemplazarla).
export async function removeImagen(
  anuncioId: string,
  fileName: string,
): Promise<void> {
  await rm(safeFile(anuncioId, fileName), { force: true }).catch(
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
    default:
      throw new Error("MIME_NOT_ALLOWED");
  }
}
