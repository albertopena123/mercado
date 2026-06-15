import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { clientMeta, createSessionFor } from "@/lib/auth/server";

const GENERIC_ERROR = "Correo/documento o contraseña incorrectos.";

// ────────── C2: dummy hash for timing-attack mitigation ──────────
// Generated once per process. The verifyPassword cost equals a real check so
// "unknown email" and "known email + bad password" finish in the same time.
let dummyHashPromise: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  if (!dummyHashPromise) {
    dummyHashPromise = hashPassword(
      "decoy-" + randomBytes(16).toString("hex"),
    );
  }
  return dummyHashPromise;
}

// ────────── C3: in-memory sliding-window rate limit ──────────
// Dos límites en capas:
//  1) Por IP (coarse backstop). La IP viene de headers que el cliente puede
//     falsear (x-forwarded-for); por eso es solo una primera barrera y se le da
//     un umbral más holgado (también protege NAT compartido de muchos socios).
//  2) Por IDENTIFICADOR (correo/documento). Esta es la defensa real contra
//     fuerza bruta dirigida a UNA cuenta: aunque el atacante rote la IP, no
//     puede superar N intentos por cuenta dentro de la ventana.
// Nota: el contador es por proceso (en memoria). En despliegues multi-instancia
// conviene mover esto a un contador compartido (Redis); para una sola instancia
// es suficiente. El límite por identificador es independiente de la instancia
// solo si el balanceador es sticky; aun así reduce drásticamente el ataque.
const IP_MAX = 30;
const IP_WINDOW_MS = 60_000;
const ID_MAX = 8;
const ID_WINDOW_MS = 5 * 60_000;
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function rateCheck(
  key: string,
  max: number,
  windowMs: number,
): { allowed: boolean; retryAfter: number } {
  const now = Date.now();

  // Light GC so the map doesn't grow unbounded under sustained load.
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (v.resetAt < now) buckets.delete(k);
  }

  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }
  if (b.count >= max) {
    return { allowed: false, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
  }
  b.count++;
  return { allowed: true, retryAfter: 0 };
}

async function getClientIp(): Promise<string> {
  // En producción, un proxy de confianza (Nginx/Caddy) debe sobrescribir
  // x-real-ip con la IP real del peer TCP; lo preferimos por eso. x-forwarded-for
  // es plenamente falseable y queda solo como último recurso para dev.
  const h = await headers();
  const real = h.get("x-real-ip");
  if (real) return real.trim();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return "unknown";
}

function tooMany(retryAfter: number) {
  return NextResponse.json(
    { error: `Demasiados intentos. Vuelve a intentarlo en ${retryAfter}s.` },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}

export async function POST(request: Request) {
  const ip = await getClientIp();
  const ipRate = rateCheck(`ip:${ip}`, IP_MAX, IP_WINDOW_MS);
  if (!ipRate.allowed) return tooMany(ipRate.retryAfter);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const { identifier, email, password } =
    typeof body === "object" && body !== null
      ? (body as {
          identifier?: unknown;
          email?: unknown;
          password?: unknown;
        })
      : {};

  // Compat: clientes viejos podían enviar `email`; ahora preferimos `identifier`.
  const rawId = typeof identifier === "string" ? identifier : email;

  if (typeof rawId !== "string" || typeof password !== "string") {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
  }

  const id = rawId.trim();
  if (!id || !password) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
  }

  // Límite por cuenta: frena la fuerza bruta dirigida a un identificador aunque
  // el atacante rote la IP. Se normaliza (minúsculas, sin espacios) para que
  // "Correo@x" y "correo@x" compartan el mismo cubo.
  const idKey = `id:${id.toLowerCase().replace(/\s+/g, "")}`;
  const idRate = rateCheck(idKey, ID_MAX, ID_WINDOW_MS);
  if (!idRate.allowed) return tooMany(idRate.retryAfter);

  // Si parece correo (tiene "@") buscamos por email; si no, por número de
  // documento. findFirst en documento porque la unicidad es por (tipo+número).
  const user = id.includes("@")
    ? await prisma.user.findUnique({ where: { email: id.toLowerCase() } })
    : await prisma.user.findFirst({
        where: { numeroDocumento: id.replace(/\s+/g, "") },
      });

  // C2: equalize timing — always run a scrypt verify, even when the email
  // doesn't exist. Discard the result; return the same generic 401.
  if (!user || !user.active) {
    await verifyPassword(password, await getDummyHash());
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  const meta = await clientMeta();
  const h = await headers();
  const isMobile = h.get("x-client") === "mobile";
  const session = await createSessionFor(user.id, meta, {
    clientType: isMobile ? "mobile" : "web",
    returnToken: isMobile,
  });
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  // Destino sugerido: los socios (con portal habilitado y sin acceso al panel)
  // van a /portal; el staff va a /usuarios. La UI honra el ?next si existe.
  const [socio, adminRoles] = await Promise.all([
    prisma.socio.findUnique({
      where: { userId: user.id },
      select: { portalEnabled: true },
    }),
    prisma.userRole.count({
      where: {
        userId: user.id,
        role: {
          permissions: { some: { permission: { key: { not: "portal.read" } } } },
        },
      },
    }),
  ]);
  const redirectTo =
    socio?.portalEnabled && adminRoles === 0 ? "/portal" : "/usuarios";

  if (isMobile && session) {
    return NextResponse.json({
      ok: true,
      token: session.token,
      expiresAt: session.expiresAt.toISOString(),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      redirect: redirectTo,
    });
  }
  return NextResponse.json({ ok: true, redirect: redirectTo });
}
