import type { ReactNode } from "react";
import Link from "next/link";
import { requireSocio } from "@/lib/portal/socio";
import { prisma } from "@/lib/prisma";
import { Icon, type IconName } from "@/components/admin/Icon";
import { fechaHora, ahoraMs } from "@/lib/fecha";
import { isQrTokenValid } from "@/lib/asambleas/qrToken";
import { CheckinButton } from "./CheckinButton";
import { QrScanner } from "./QrScanner";

export const metadata = { title: "Asistencia · Gran Feria Mayorista Internacional" };
export const dynamic = "force-dynamic";

const ESTADO_ASM: Record<string, string> = {
  programada: "Programada",
  en_curso: "En curso",
  cerrada: "Cerrada",
};

type Tone = "brand" | "ok" | "warn" | "info" | "muted" | "danger";

function Medallion({ tone, icon }: { tone: Tone; icon: IconName }) {
  return (
    <div className={`pt-medallion pt-medallion--${tone}`}>
      <Icon name={icon} size={38} />
    </div>
  );
}

export default async function CheckinPage({
  params,
  searchParams,
}: {
  params: Promise<{ codigo: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { codigo } = await params;
  const { t } = await searchParams;
  const token = typeof t === "string" ? t : undefined;
  // Si no hay sesión, vuelve aquí (con el token) tras iniciar sesión, en vez de
  // perder el QR escaneado y caer en el inicio del portal.
  const destino = `/portal/asambleas/${codigo}${token ? `?t=${token}` : ""}`;
  const { socio } = await requireSocio(destino);

  const asamblea = await prisma.asamblea.findUnique({
    where: { codigoVerificacion: codigo },
    select: { id: true, titulo: true, fecha: true, lugar: true, estado: true },
  });

  const back = (
    <Link href="/portal/asambleas" className="pt-back">
      <Icon name="chevron-right" size={15} style={{ transform: "rotate(180deg)" }} />
      Volver a reuniones
    </Link>
  );

  if (!asamblea) {
    return (
      <>
        {back}
        <div className="pt-pase">
          <div className="pt-pase__body">
            <Medallion tone="danger" icon="info" />
            <h2 className="pt-pase__status-title">Reunión no encontrada</h2>
            <p className="pt-pase__status-text">
              El código no es válido o esta reunión ya no está disponible.
            </p>
          </div>
        </div>
      </>
    );
  }

  const asis = await prisma.asistencia.findUnique({
    where: {
      asambleaId_socioId: { asambleaId: asamblea.id, socioId: socio.id },
    },
    select: { estado: true },
  });

  // Misma lógica que checkInSocio: el registro está abierto cuando la mesa lo
  // abrió (en_curso) o cuando una asamblea programada ya alcanzó su hora de
  // inicio. Cerrada lo finaliza.
  const cerrada = asamblea.estado === "cerrada";
  const abierto =
    asamblea.estado === "en_curso" ||
    (asamblea.estado === "programada" && ahoraMs() >= asamblea.fecha.getTime());

  // Estado a mostrar: medallón (tono + icono), titular, texto y acción.
  let tone: Tone;
  let icon: IconName;
  let title: string;
  let text: ReactNode;
  let action: ReactNode = null;

  if (!asis) {
    tone = "muted";
    icon = "users";
    title = "No estás en esta lista";
    text =
      "No figuras en la lista de asistencia de esta reunión. Acércate a la mesa de registro para que te agreguen.";
  } else if (asis.estado === "presente") {
    tone = "ok";
    icon = "shield-check";
    title = "¡Asistencia registrada!";
    text = (
      <>
        Quedaste como <span className="pt-badge pt-badge--presente">Presente</span>.
      </>
    );
  } else if (asis.estado === "tardanza") {
    tone = "warn";
    icon = "clock";
    title = "Asistencia registrada";
    text = (
      <>
        Quedaste como <span className="pt-badge pt-badge--tardanza">Tardanza</span> —
        llegaste pasada la tolerancia.
      </>
    );
  } else if (asis.estado === "justificado") {
    tone = "info";
    icon = "rules";
    title = "Inasistencia justificada";
    text = (
      <>
        La mesa registró tu inasistencia como{" "}
        <span className="pt-badge pt-badge--justificado">Justificado</span>. Si crees
        que es un error, acércate a la mesa de registro.
      </>
    );
  } else if (cerrada) {
    tone = "muted";
    icon = "lock";
    title = "Registro cerrado";
    text =
      "El registro de asistencia de esta reunión ya se cerró y no quedó registrada tu asistencia.";
  } else if (!abierto) {
    tone = "info";
    icon = "hourglass";
    title = "Aún no abre el registro";
    text = (
      <>
        El registro abre a las <strong>{fechaHora(asamblea.fecha)}</strong>. Vuelve a
        escanear el QR en ese momento.
      </>
    );
  } else if (isQrTokenValid(asamblea.id, token, ahoraMs())) {
    // Escaneó el QR vivo (token de la ventana vigente) → puede registrarse.
    tone = "brand";
    icon = "check";
    title = "Confirma tu asistencia";
    text = "Escaneaste el código de la reunión. Registra tu llegada con un toque.";
    action = (
      <>
        <div className="pt-pase__action">
          <CheckinButton codigo={codigo} token={token} />
        </div>
        <p className="pt-pase__hint">
          <Icon name="clock" size={14} />
          Se guarda con la hora exacta de tu llegada.
        </p>
      </>
    );
  } else {
    // En lista y abierto, pero sin token vivo: hay que escanear el QR de la
    // pantalla (no se puede marcar desde casa con la URL). Desde el celular se
    // puede abrir la cámara aquí mismo (o usar la cámara nativa como respaldo).
    tone = "info";
    icon = "qr";
    title = "Escanea el código de la reunión";
    text =
      "Apunta al código QR que se muestra en la pantalla de la reunión. Cambia cada minuto, por eso debes estar presente.";
    action = (
      <div className="pt-pase__action">
        <QrScanner codigo={codigo} />
      </div>
    );
  }

  const estado = asamblea.estado;

  return (
    <>
      {back}
      <div className="pt-pase">
        <div className="pt-pase__head">
          <div className="pt-pase__eyebrow">
            <Icon name="qr" size={13} />
            Pase de asistencia
          </div>
          <div className="pt-pase__titlerow">
            <h1 className="pt-pase__title">{asamblea.titulo}</h1>
            <span className={`pt-state-chip pt-state-chip--${estado}`}>
              {estado === "en_curso" && <span className="pt-state-chip__dot" />}
              {ESTADO_ASM[estado] ?? estado}
            </span>
          </div>
          <div className="pt-pase__meta">
            <span className="pt-pase__metaitem">
              <Icon name="calendar" size={15} />
              {fechaHora(asamblea.fecha)}
            </span>
            {asamblea.lugar && (
              <span className="pt-pase__metaitem">
                <Icon name="pin" size={15} />
                {asamblea.lugar}
              </span>
            )}
          </div>
        </div>

        <div className="pt-pase__perf" />

        <div className="pt-pase__body">
          <Medallion tone={tone} icon={icon} />
          <h2 className="pt-pase__status-title">{title}</h2>
          <p className="pt-pase__status-text">{text}</p>
          {action}
        </div>
      </div>
    </>
  );
}
