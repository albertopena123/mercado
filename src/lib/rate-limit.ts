import "server-only";
import { headers } from "next/headers";

// Rate-limit de ventana deslizante en memoria (por proceso). Es un BACKSTOP
// best-effort, NO una barrera de seguridad dura: en multi-instancia conviene
// Redis. Para el formulario público la defensa real contra flood es el índice
// parcial único (1 pendiente por DNI) + que el envío solo escribe en la cola de
// pendientes (la aprobación admin es la única vía al padrón).
const MAX_BUCKETS = 5000;
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

// Tope DURO con desalojo: al estar lleno, purga expirados y, si sigue lleno
// (p. ej. un atacante que rota IPs falseadas crea miles de entradas vivas),
// desaloja la más próxima a vencer. Así el cap se respeta SIEMPRE, no solo
// cuando hay entradas expiradas. Solo corre cuando el mapa llegó al tope, para
// no pagar O(n) por request.
function evictIfFull(now: number) {
  if (buckets.size < MAX_BUCKETS) return;
  for (const [k, v] of buckets) if (v.resetAt < now) buckets.delete(k);
  if (buckets.size < MAX_BUCKETS) return;
  let minKey: string | null = null;
  let minResetAt = Infinity;
  for (const [k, v] of buckets) {
    if (v.resetAt < minResetAt) {
      minResetAt = v.resetAt;
      minKey = k;
    }
  }
  if (minKey !== null) buckets.delete(minKey);
}

export function rateCheck(
  key: string,
  max: number,
  windowMs: number,
): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    evictIfFull(now);
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }
  if (b.count >= max) {
    return { allowed: false, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
  }
  b.count++;
  return { allowed: true, retryAfter: 0 };
}

// IP del cliente para el rate-limit. Prefiere x-real-ip, que en producción lo
// fija un proxy de confianza (Nginx/Caddy) con la IP real del peer y el cliente
// NO puede sobreescribir. x-forwarded-for es falseable y queda solo como último
// recurso para dev. Vacío/espacios → "unknown" (evita fusionar buckets con un
// header en blanco). Si despliegas sin proxy de confianza, el rate-limit por IP
// es solo orientativo; las barreras duras son el índice parcial y la aprobación.
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const real = (h.get("x-real-ip") ?? "").trim();
  if (real) return real;
  const fwd = (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ?? "";
  if (fwd) return fwd;
  return "unknown";
}
