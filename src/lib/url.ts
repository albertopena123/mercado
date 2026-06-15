import "server-only";
import { headers } from "next/headers";

/**
 * URL base canónica de la app, para construir enlaces absolutos (QR de
 * verificación de constancias, QR de asistencia a asambleas, etc.).
 *
 * En PRODUCCIÓN se DEBE configurar NEXT_PUBLIC_APP_URL: es la única fuente no
 * falseable del host. Sin ella caemos a los headers Host / X-Forwarded-* — que
 * el cliente puede falsificar — lo cual es aceptable solo en desarrollo. Un
 * atacante que falsee el host solo lograría que un QR apunte a otro dominio, no
 * acceso a datos; aun así, fijar el env elimina el riesgo por completo.
 */
export async function appBaseUrl(): Promise<string> {
  const env = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "");
  if (env) return env;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ??
    (process.env.NODE_ENV === "production" ? "https" : "http");
  return `${proto}://${host}`;
}
