import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/server";
import { readImagen } from "@/lib/anuncios/storage";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ anuncioId: string; file: string }> },
) {
  const { anuncioId, file } = await params;

  // Solo las imágenes de anuncios PÚBLICOS y PUBLICADOS se sirven sin sesión (el
  // landing es público). Borradores/archivados o de visibilidad "socios" exigen
  // sesión: no exponer material no publicado a quien adivine la URL.
  const anuncio = await prisma.anuncio.findUnique({
    where: { id: anuncioId },
    select: { visibilidad: true, estado: true },
  });
  const esPublico =
    anuncio?.visibilidad === "publico" && anuncio?.estado === "publicado";
  if (!esPublico) {
    const user = await getCurrentUser();
    if (!user) return new NextResponse("No autorizado", { status: 403 });
  }

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
      // Público → cacheable por intermediarios; gateado → solo el navegador.
      "Cache-Control": esPublico
        ? "public, max-age=3600"
        : "private, max-age=300",
    },
  });
}
