import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/server";
import { readComprobante } from "@/lib/caja/storage";

export const dynamic = "force-dynamic";

// Servido PRIVADO del comprobante (solo con permiso de caja).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ movId: string; file: string }> },
) {
  await requirePermission("caja.read");
  const { movId, file } = await params;

  let buffer: Buffer;
  try {
    buffer = await readComprobante(movId, file);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }

  const ext = file.split(".").pop()?.toLowerCase();
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

  return new NextResponse(new Uint8Array(buffer), {
    headers: { "Content-Type": ct, "Cache-Control": "private, max-age=300" },
  });
}
