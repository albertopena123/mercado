import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";
import { generarQrSvg } from "@/lib/constancia/qr";
import { generarCodigoVerificacion, anioLima } from "@/lib/constancia/codigo";
import { fechaLargaTS } from "@/lib/fecha";
import { QrPrintButton } from "./QrPrintButton";

export const metadata = { title: "QR de asistencia · Asamblea" };
export const dynamic = "force-dynamic";

export default async function AsambleaQrPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("asambleas.read");
  const { id } = await params;

  const asamblea = await prisma.asamblea.findUnique({
    where: { id },
    select: { id: true, titulo: true, fecha: true, lugar: true, codigoVerificacion: true },
  });
  if (!asamblea) notFound();

  // Genera el código si por alguna razón falta (asambleas previas a esta función).
  let codigo = asamblea.codigoVerificacion;
  if (!codigo) {
    for (let i = 0; i < 5; i++) {
      try {
        codigo = generarCodigoVerificacion(anioLima());
        await prisma.asamblea.update({
          where: { id: asamblea.id },
          data: { codigoVerificacion: codigo },
        });
        break;
      } catch {
        codigo = null;
      }
    }
  }

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const url = `${proto}://${host}/portal/asambleas/${codigo}`;
  const svg = await generarQrSvg(url);

  return (
    <div className="asm-qr">
      <div className="asm-qr__card">
        <div className="asm-qr__eyebrow">Asistencia · escanea para registrarte</div>
        <h1 className="asm-qr__title">{asamblea.titulo}</h1>
        <p className="asm-qr__meta">
          {fechaLargaTS(asamblea.fecha)}
          {asamblea.lugar ? ` · ${asamblea.lugar}` : ""}
        </p>
        <div className="asm-qr__svg" dangerouslySetInnerHTML={{ __html: svg }} />
        <p className="asm-qr__hint">
          Los socios escanean este código con su celular (con su sesión iniciada)
          para marcar su asistencia.
        </p>
        <p className="asm-qr__code">{codigo}</p>
        <QrPrintButton backHref={`/asambleas/${asamblea.id}`} />
      </div>

      <style>{`
        .asm-qr { display: grid; place-items: center; padding: 32px 16px; }
        .asm-qr__card {
          background: #fff; border: 1px solid var(--border); border-radius: 18px;
          padding: 32px; max-width: 460px; width: 100%; text-align: center;
          box-shadow: var(--shadow-md, 0 14px 40px rgba(33,16,84,.1));
        }
        .asm-qr__eyebrow { font-size: 12px; font-weight: 700; letter-spacing: .4px;
          text-transform: uppercase; color: var(--accent, #5128b4); }
        .asm-qr__title { font-size: 22px; font-weight: 800; margin: 6px 0 2px; }
        .asm-qr__meta { color: var(--text-muted); font-size: 14px; margin-bottom: 18px; }
        .asm-qr__svg { width: 280px; height: 280px; margin: 0 auto 16px; }
        .asm-qr__svg svg { width: 100%; height: 100%; }
        .asm-qr__hint { font-size: 13px; color: var(--text-muted); margin-bottom: 8px; }
        .asm-qr__code { font-family: ui-monospace, monospace; font-size: 14px;
          letter-spacing: 1px; color: var(--text); margin-bottom: 18px; }
        @media print {
          .asm-qr__hint, .asm-qr__code ~ * { }
        }
      `}</style>
    </div>
  );
}
