import "server-only";
import { mkdir, writeFile, unlink, rm, readFile } from "node:fs/promises";
import path from "node:path";

// Adjuntos del personal (CV, contrato, DNI, foto). Privados: se sirven solo con
// permiso personal.read vía /api/uploads/empleados/<empleadoId>/<file>.
const ROOT = path.join(process.cwd(), "private-uploads", "empleados");

function safeDir(empleadoId: string): string {
  if (!/^[a-z0-9]+$/i.test(empleadoId)) throw new Error("INVALID_EMPLEADO_ID");
  return path.join(ROOT, empleadoId);
}

function safeFile(empleadoId: string, fileName: string): string {
  if (!/^[a-z0-9._-]+$/i.test(fileName)) throw new Error("INVALID_FILENAME");
  return path.join(safeDir(empleadoId), fileName);
}

export async function writeAdjunto(
  empleadoId: string,
  fileName: string,
  buffer: Buffer,
): Promise<string> {
  await mkdir(safeDir(empleadoId), { recursive: true });
  await writeFile(safeFile(empleadoId, fileName), buffer);
  return `/api/uploads/empleados/${empleadoId}/${fileName}`;
}

export async function readAdjunto(
  empleadoId: string,
  fileName: string,
): Promise<Buffer> {
  return await readFile(safeFile(empleadoId, fileName));
}

export async function removeAdjunto(
  empleadoId: string,
  fileName: string,
): Promise<void> {
  await unlink(safeFile(empleadoId, fileName)).catch(() => undefined);
}

export async function removeEmpleadoDir(empleadoId: string): Promise<void> {
  await rm(safeDir(empleadoId), { recursive: true, force: true }).catch(
    () => undefined,
  );
}

// Tipos/límites viven en src/lib/socios/limits.ts (validateUpload), reutilizado.
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
