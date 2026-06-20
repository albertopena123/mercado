"use client";

import { useEffect, useRef, useState } from "react";
import { getAsambleaQrFrame } from "../../actions";

const TICK_MS = 250;

export function RotatingQr({
  asambleaId,
  initialSvg,
  initialMsLeft,
  stepMs,
}: {
  asambleaId: string;
  initialSvg: string;
  initialMsLeft: number;
  stepMs: number;
}) {
  const [svg, setSvg] = useState(initialSvg);
  const [msLeft, setMsLeft] = useState(initialMsLeft);
  const [error, setError] = useState(false);
  const fetching = useRef(false);
  const mounted = useRef(true);

  // Guard de montaje: evita setState tras desmontar (sin cancelar el fetch en
  // vuelo, ya que el efecto de refetch se re-ejecuta en cada tick).
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Cuenta regresiva.
  useEffect(() => {
    const id = setInterval(() => setMsLeft((m) => m - TICK_MS), TICK_MS);
    return () => clearInterval(id);
  }, []);

  // Al expirar la ventana, trae el nuevo frame. Si falla, NO rearma en silencio:
  // muestra un error para que la mesa sepa que el QR dejó de renovarse.
  useEffect(() => {
    if (msLeft > 0 || fetching.current || error) return;
    fetching.current = true;
    getAsambleaQrFrame(asambleaId)
      .then((r) => {
        if (!mounted.current) return;
        if (r.ok && r.data) {
          setSvg(r.data.svg);
          setMsLeft(r.data.msLeft);
        } else {
          setError(true);
        }
      })
      .catch(() => {
        if (mounted.current) setError(true);
      })
      .finally(() => {
        fetching.current = false;
      });
  }, [msLeft, asambleaId, error]);

  const pct = Math.max(0, Math.min(100, (msLeft / stepMs) * 100));
  const secs = Math.max(0, Math.ceil(msLeft / 1000));

  return (
    <div className="asm-qr__live">
      <div
        className={`asm-qr__svg${error ? " asm-qr__svg--stale" : ""}`}
        // SVG generado en el servidor con qrcode; se reemplaza cada ventana.
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      {error ? (
        <div className="asm-qr__err" role="alert">
          <span>No se pudo renovar el código.</span>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => window.location.reload()}
          >
            Recargar pantalla
          </button>
        </div>
      ) : (
        <div
          className="asm-qr__count"
          role="status"
          aria-label={`El código se renueva en ${secs} segundos`}
        >
          <span className="asm-qr__count-track">
            <span className="asm-qr__count-fill" style={{ width: `${pct}%` }} />
          </span>
          <span className="asm-qr__count-label">
            {secs === 0 ? "Renovando…" : `Se renueva en ${secs}s`}
          </span>
        </div>
      )}
    </div>
  );
}
