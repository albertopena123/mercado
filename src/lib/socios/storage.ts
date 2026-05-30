import "server-only";
import { mkdir, writeFile, unlink, rm, readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.join(process.cwd(), "private-uploads", "socios");

function safeSocioDir(socioId: string): string {
  if (!/^[a-z0-9]+$/i.test(socioId)) throw new Error("INVALID_SOCIO_ID");
  return path.join(ROOT, socioId);
}

function safeFile(socioId: string, fileName: string): string {
  if (!/^[a-z0-9._-]+$/i.test(fileName)) throw new Error("INVALID_FILENAME");
  return path.join(safeSocioDir(socioId), fileName);
}

export async function writeAdjunto(
  socioId: string,
  fileName: string,
  buffer: Buffer,
): Promise<string> {
  const dir = safeSocioDir(socioId);
  await mkdir(dir, { recursive: true });
  const full = safeFile(socioId, fileName);
  await writeFile(full, buffer);
  return `/api/uploads/socios/${socioId}/${fileName}`;
}

export async function readAdjunto(
  socioId: string,
  fileName: string,
): Promise<Buffer> {
  return await readFile(safeFile(socioId, fileName));
}

export async function removeAdjunto(
  socioId: string,
  fileName: string,
): Promise<void> {
  await unlink(safeFile(socioId, fileName)).catch(() => undefined);
}

export async function removeSocioDir(socioId: string): Promise<void> {
  await rm(safeSocioDir(socioId), { recursive: true, force: true }).catch(
    () => undefined,
  );
}

// Los límites y tipos permitidos viven en `limits.ts` (validateUpload), única
// fuente de verdad compartida por cliente y servidor.
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
