"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/admin/Icon";
import { useToast } from "@/components/admin/toast";
import { checkInSocio } from "../../actions";

// BarcodeDetector no está en los tipos del DOM; declaración mínima para evitar any.
type DetectedBarcode = { rawValue: string };
type BarcodeDetectorLike = {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
};
type BarcodeDetectorCtor = new (opts?: {
  formats?: string[];
}) => BarcodeDetectorLike;

const FALLBACK_MSG =
  "Tu navegador no permite escanear aquí. Abre la cámara de tu celular y apunta al QR de la reunión.";

function getDetectorCtor(): BarcodeDetectorCtor | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor })
    .BarcodeDetector;
}

/**
 * Escáner de QR dentro de la app: abre la cámara del celular, lee el QR rotativo
 * que muestra la mesa, extrae el token (`?t=`) y registra la asistencia. El
 * servidor revalida el token, así que esto es solo una forma cómoda de capturarlo.
 *
 * La cámara del navegador exige contexto seguro (HTTPS o localhost). Si no está
 * disponible (HTTP por IP local, iOS sin BarcodeDetector, permiso denegado) se
 * degrada a una guía para usar la cámara nativa del celular.
 */
export function QrScanner({ codigo }: { codigo: string }) {
  const router = useRouter();
  const toast = useToast();
  const [scanning, setScanning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [soportado, setSoportado] = useState<boolean | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<BarcodeDetectorLike | null>(null);
  const rafRef = useRef<number | null>(null);
  const doneRef = useRef(false);
  const unmountedRef = useRef(false);

  // ¿Se puede escanear en la página? Contexto seguro + API de cámara + detector.
  // Se evalúa tras montar (las APIs no existen en SSR → evita desajuste de hidratación).
  useEffect(() => {
    const ok =
      window.isSecureContext &&
      !!navigator.mediaDevices?.getUserMedia &&
      !!getDetectorCtor();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSoportado(ok);
  }, []);

  const stop = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  // Apaga la cámara al desmontar (y marca el desmontaje para la carrera de start()).
  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      stop();
    };
  }, [stop]);

  // "Latest ref" del manejador: el loop de detección lo lee sin reiniciarse cuando
  // cambia la identidad de toast/router (que recrearían handleResult cada render).
  const handlerRef = useRef<(raw: string) => Promise<void>>(async () => {});
  useEffect(() => {
    handlerRef.current = async (raw: string) => {
      if (doneRef.current) return;
      let scannedToken: string | null = null;
      try {
        const u = new URL(raw);
        if (u.pathname === `/portal/asambleas/${codigo}`) {
          scannedToken = u.searchParams.get("t");
        } else if (u.pathname.includes("/portal/asambleas/")) {
          setHint("Ese QR es de otra reunión.");
          return;
        } else {
          return; // URL ajena → seguir escaneando
        }
      } catch {
        return; // no es URL → seguir escaneando
      }
      if (!scannedToken) return;

      doneRef.current = true;
      stop();
      setScanning(false);
      setSubmitting(true);
      const res = await checkInSocio(codigo, scannedToken);
      setSubmitting(false);
      if (!res.ok) {
        doneRef.current = false;
        toast.error(res.error);
        return;
      }
      toast.success(
        res.estado === "presente"
          ? "¡Asistencia registrada como presente!"
          : "Asistencia registrada (tardanza).",
      );
      router.refresh();
    };
  });

  // Loop de detección mientras la cámara está activa.
  useEffect(() => {
    if (!scanning) return;
    const video = videoRef.current;
    const stream = streamRef.current;
    const detector = detectorRef.current;
    if (!video || !stream || !detector) return;

    video.srcObject = stream;
    video.play().catch(() => undefined);
    let active = true;

    const tick = async () => {
      const v = videoRef.current;
      if (!active || doneRef.current || !v) return;
      // Espera a que el frame tenga datos (evita girar en vacío ~1-2 s al abrir).
      if (v.readyState >= 2) {
        try {
          const codes = await detector.detect(v);
          if (codes.length > 0) await handlerRef.current(codes[0].rawValue);
        } catch {
          // detección puntual fallida: reintenta en el próximo frame
        }
      }
      if (active && !doneRef.current) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      active = false;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [scanning]);

  async function start() {
    setHint(null);
    doneRef.current = false;
    const Ctor = getDetectorCtor();
    if (!navigator.mediaDevices?.getUserMedia || !Ctor) {
      setHint(FALLBACK_MSG);
      return;
    }
    // Construir el detector aquí (no en el efecto) para capturar un posible throw.
    let detector: BarcodeDetectorLike;
    try {
      detector = new Ctor({ formats: ["qr_code"] });
    } catch {
      setHint(FALLBACK_MSG);
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
    } catch (e) {
      const name = (e as { name?: string })?.name;
      setHint(
        name === "NotFoundError" || name === "OverconstrainedError"
          ? "No se encontró una cámara en este dispositivo. Usa la cámara de tu celular y apunta al QR."
          : "No se pudo abrir la cámara (¿permiso denegado?). Usa la cámara de tu celular y apunta al QR.",
      );
      return;
    }
    // Si se desmontó mientras se pedía la cámara, apágala y no sigas.
    if (unmountedRef.current) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    streamRef.current = stream;
    detectorRef.current = detector;
    setScanning(true);
  }

  function cancel() {
    stop();
    setScanning(false);
  }

  if (submitting) {
    return <p className="pt-scan__status">Registrando tu asistencia…</p>;
  }

  if (scanning) {
    return (
      <div className="pt-scan">
        <div className="pt-scan__viewport">
          <video
            ref={videoRef}
            className="pt-scan__video"
            playsInline
            muted
            autoPlay
          />
          <div className="pt-scan__frame" aria-hidden />
        </div>
        <p className="pt-scan__tip">Apunta al código QR de la pantalla.</p>
        <button type="button" className="pt-btn pt-btn--ghost" onClick={cancel}>
          Cancelar
        </button>
      </div>
    );
  }

  // Contexto inseguro / sin soporte → guía a la cámara nativa (sin botón roto).
  if (soportado === false) {
    return (
      <p className="pt-scan__fallback">
        <Icon name="qr" size={16} />
        Abre la cámara de tu celular y apunta al QR de la reunión para registrarte.
      </p>
    );
  }

  // soportado === null (aún detectando) → botón deshabilitado, sin parpadeo de copy.
  return (
    <div className="pt-scan">
      <button
        type="button"
        className="pt-btn pt-btn--block"
        onClick={start}
        disabled={soportado !== true}
      >
        <Icon name="qr" size={18} />
        Escanear código
      </button>
      {hint && <p className="pt-scan__hint">{hint}</p>}
    </div>
  );
}
