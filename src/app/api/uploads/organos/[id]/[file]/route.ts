import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/server";
import { readFirma } from "@/lib/organos/storage";

export const dynamic = "force-dynamic";

// Servido PRIVADO de las firmas de directivos (solo con permiso organos.read).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; file: string }> },
) {
  await requirePermission("organos.read");
  const { id, file } = await params;

  let buffer: Buffer;
  try {
    buffer = await readFirma(id, file);
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
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `inline; filename="${file}"`,
    },
  });
}
