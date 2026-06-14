import { NextResponse } from "next/server";
import { readImagen } from "@/lib/anuncios/storage";

export const dynamic = "force-dynamic";

// Servido PÚBLICO de imágenes de anuncios (el landing es público). Solo lectura;
// la subida está protegida por permiso en la acción del módulo.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ anuncioId: string; file: string }> },
) {
  const { anuncioId, file } = await params;

  let buffer: Buffer;
  try {
    buffer = await readImagen(anuncioId, file);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }

  const ext = file.split(".").pop()?.toLowerCase();
  const ct =
    ext === "png"
      ? "image/png"
      : ext === "webp"
        ? "image/webp"
        : ext === "jpg" || ext === "jpeg"
          ? "image/jpeg"
          : "application/octet-stream";

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": ct,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
