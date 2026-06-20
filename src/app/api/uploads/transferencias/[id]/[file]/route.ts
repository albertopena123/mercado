import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/server";
import { readDocumento } from "@/lib/transferencias/storage";

export const dynamic = "force-dynamic";

// Servido PRIVADO de los escaneos de la transferencia (solo con permiso).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; file: string }> },
) {
  await requirePermission("transferencias.read");
  const { id, file } = await params;

  let buffer: Buffer;
  try {
    buffer = await readDocumento(id, file);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }

  const ext = file.split(".").pop()?.toLowerCase();
  const isImage =
    ext === "png" || ext === "webp" || ext === "jpg" || ext === "jpeg";
  const ct =
    ext === "pdf"
      ? "application/pdf"
      : ext === "png"
        ? "image/png"
        : ext === "webp"
          ? "image/webp"
          : ext === "jpg" || ext === "jpeg"
            ? "image/jpeg"
            : "application/octet-stream";

  // Defensa en profundidad: no permitir content-sniffing y evitar render inline
  // de contenido subido en el mismo origen (las imágenes sí se ven; el PDF se
  // descarga en vez de ejecutarse inline).
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": ct,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `${isImage ? "inline" : "attachment"}; filename="${file}"`,
    },
  });
}
