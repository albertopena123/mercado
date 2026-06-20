import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";
import { Icon } from "@/components/admin/Icon";
import { generarQrSvg } from "@/lib/constancia/qr";
import { generarCodigoVerificacion, anioLima } from "@/lib/constancia/codigo";
import { currentQrToken, QR_STEP_MS } from "@/lib/asambleas/qrToken";
import { fechaLargaTS, ahoraMs } from "@/lib/fecha";
import { appBaseUrl } from "@/lib/url";
import { RotatingQr } from "./RotatingQr";

export const metadata = { title: "QR de asistencia · Asamblea" };
export const dynamic = "force-dynamic";

export default async function AsambleaQrPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Mostrar (y por tanto emitir) el QR vivo es función de la mesa: exige
  // asambleas.attendance, no el read amplio (un lector no debe cosechar el token).
  await requirePermission("asambleas.attendance");
  const { id } = await params;

  const asamblea = await prisma.asamblea.findUnique({
    where: { id },
    select: {
      id: true,
      titulo: true,
      fecha: true,
      lugar: true,
      estado: true,
      codigoVerificacion: true,
    },
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
  // Si tras los reintentos no hay código, no generar un QR que apunte a
  // "/portal/asambleas/null". 404 explícito en vez de un QR roto silencioso.
  if (!codigo) notFound();

  const cerrada = asamblea.estado === "cerrada";
  const base = await appBaseUrl();
  // Frame inicial del QR rotativo: token de la ventana actual en la URL. La
  // pantalla lo renueva sola; el token vivo es lo que prueba presencia. Si la
  // asamblea está cerrada, no se emite código (la asistencia ya finalizó).
  const { token, msLeft } = currentQrToken(asamblea.id, ahoraMs());
  const url = `${base}/portal/asambleas/${codigo}?t=${token}`;
  const svg = cerrada ? "" : await generarQrSvg(url);
  // Un QR que apunta a localhost/127.0.0.1 NO es escaneable desde el celular del
  // socio (ahí "localhost" es el propio teléfono). Avisar para que se acceda por
  // la IP de la red local o se configure NEXT_PUBLIC_APP_URL.
  const esLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(base);

  return (
    <div className="asm-qr">
      <div className="asm-qr__card">
        <div className="asm-qr__eyebrow">
          {cerrada ? "Asistencia · cerrada" : "Asistencia · escanea en vivo para registrarte"}
        </div>
        <h1 className="asm-qr__title">{asamblea.titulo}</h1>
        <p className="asm-qr__meta">
          {fechaLargaTS(asamblea.fecha)}
          {asamblea.lugar ? ` · ${asamblea.lugar}` : ""}
        </p>

        {cerrada ? (
          <div className="asm-qr__closed">
            <Icon name="lock" size={30} />
            <p>
              La asamblea está cerrada. La asistencia ya finalizó y el código de
              registro dejó de emitirse.
            </p>
          </div>
        ) : (
          <>
            <RotatingQr
              asambleaId={asamblea.id}
              initialSvg={svg}
              initialMsLeft={msLeft}
              stepMs={QR_STEP_MS}
            />

            <p className="asm-qr__hint">
              Los socios escanean este código con su celular (con su sesión
              iniciada) para marcar su asistencia.{" "}
              <strong>Se renueva cada minuto</strong>: solo quien está presente,
              viendo esta pantalla, puede registrarse.
            </p>
            <p className="asm-qr__code">{codigo}</p>

            {esLocal && (
              <p className="asm-qr__warn">
                ⚠️ Este QR apunta a <code>{base}</code>, que solo funciona en esta
                computadora. Para que los socios lo escaneen desde su celular, abre
                el panel por la IP de la red local (p. ej.{" "}
                <code>http://192.168.x.x:3000</code>) o configura{" "}
                <code>NEXT_PUBLIC_APP_URL</code>.
              </p>
            )}
            <p className="asm-qr__note">
              <Icon name="info" size={14} />
              Muestra esta pantalla en la reunión. No lo imprimas: un código
              impreso deja de ser válido al renovarse. ¿Sin pantalla? Registra por
              DNI desde el detalle (Check-in en la puerta).
            </p>
          </>
        )}

        <div className="asm-qr__actions">
          <Link href={`/asambleas/${asamblea.id}`} className="btn btn--ghost">
            <Icon name="chevron-right" size={14} style={{ transform: "rotate(180deg)" }} />
            <span>Volver</span>
          </Link>
        </div>
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
        .asm-qr__svg { width: 280px; height: 280px; margin: 0 auto 12px; }
        .asm-qr__svg svg { width: 100%; height: 100%; }
        .asm-qr__count { display: flex; align-items: center; gap: 10px;
          max-width: 280px; margin: 0 auto 16px; }
        .asm-qr__count-track { flex: 1; height: 6px; border-radius: 999px;
          background: var(--bg-sunken, #eef0f6); overflow: hidden; }
        .asm-qr__count-fill { display: block; height: 100%;
          background: linear-gradient(90deg, #7a4ce6, #5128b4);
          transition: width .25s linear; }
        .asm-qr__count-label { font-size: 12px; color: var(--text-muted);
          font-variant-numeric: tabular-nums; white-space: nowrap; }
        .asm-qr__svg--stale { opacity: .35; }
        .asm-qr__err { display: flex; flex-direction: column; align-items: center;
          gap: 8px; margin: 0 auto 16px; color: #b91c1c; font-size: 13px;
          font-weight: 600; }
        .asm-qr__hint { font-size: 13px; color: var(--text-muted); margin-bottom: 8px; }
        .asm-qr__code { font-family: ui-monospace, monospace; font-size: 14px;
          letter-spacing: 1px; color: var(--text); margin-bottom: 14px; }
        .asm-qr__warn { font-size: 12.5px; line-height: 1.5; text-align: left;
          background: #fef3c7; color: #92400e; border: 1px solid #fcd34d;
          border-radius: 10px; padding: 10px 12px; margin: 0 0 14px; }
        .asm-qr__warn code { font-family: ui-monospace, monospace; font-size: 12px; }
        .asm-qr__note { display: flex; gap: 7px; align-items: flex-start;
          text-align: left; font-size: 12.5px; line-height: 1.5;
          color: var(--text-muted); margin: 0 0 18px; }
        .asm-qr__note svg { flex: none; margin-top: 1px; }
        .asm-qr__closed { display: flex; flex-direction: column; align-items: center;
          gap: 10px; color: var(--text-muted); padding: 18px 8px 24px; }
        .asm-qr__closed svg { color: #64748b; }
        .asm-qr__closed p { margin: 0; font-size: 14px; line-height: 1.55; max-width: 320px; }
        .asm-qr__actions { display: flex; gap: 8px; justify-content: center; }
      `}</style>
    </div>
  );
}
