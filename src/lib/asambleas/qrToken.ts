import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Token rotativo para el QR de asistencia (estilo TOTP). El QR que muestra la
 * mesa cambia cada ventana; el socio debe escanear el QR VIVO de la pantalla
 * para obtener un token válido. Esto impide marcar asistencia "desde casa" con
 * la URL estática: sin el token de la ventana actual el check-in se rechaza.
 *
 * Clave HMAC derivada de SESSION_SECRET (secreto de servidor que la app ya
 * exige) con un namespace propio, así no hace falta una columna/seed por
 * asamblea. La unicidad por asamblea va en el mensaje (asambleaId).
 */
const STEP_MS = 60_000; // ventana del token: 60 s
const GRACE_WINDOWS = 1; // acepta la ventana actual y la anterior (≈ hasta 120 s)
const TOKEN_LEN = 12; // chars base64url (~72 bits)

function qrKey(): Buffer {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not set");
  // Sub-clave con namespace: no reutiliza directamente la clave de sesiones.
  return createHmac("sha256", s).update("asamblea-qr-v1").digest();
}

function derive(asambleaId: string, win: number): string {
  return createHmac("sha256", qrKey())
    .update(`${asambleaId}:${win}`)
    .digest("base64url")
    .slice(0, TOKEN_LEN);
}

/** Token y ms restantes de la ventana actual (para el QR que muestra la mesa). */
export function currentQrToken(
  asambleaId: string,
  nowMs: number,
): { token: string; msLeft: number } {
  const win = Math.floor(nowMs / STEP_MS);
  return { token: derive(asambleaId, win), msLeft: STEP_MS - (nowMs % STEP_MS) };
}

/** Valida el token escaneado contra la ventana actual y la(s) de gracia. */
export function isQrTokenValid(
  asambleaId: string,
  token: string | null | undefined,
  nowMs: number,
): boolean {
  if (!token || token.length !== TOKEN_LEN) return false;
  const win = Math.floor(nowMs / STEP_MS);
  for (let i = 0; i <= GRACE_WINDOWS; i++) {
    if (safeEqual(derive(asambleaId, win - i), token)) return true;
  }
  return false;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export const QR_STEP_MS = STEP_MS;
