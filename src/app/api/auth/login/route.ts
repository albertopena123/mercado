import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { clientMeta, createSessionFor } from "@/lib/auth/server";

const GENERIC_ERROR = "Correo o contraseña incorrectos.";

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

// ────────── C3: simple in-memory sliding-window rate limit ──────────
// 10 attempts per minute per IP for the login endpoint.
const RATE_MAX = 10;
const RATE_WINDOW_MS = 60_000;
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function rateCheck(ip: string): { allowed: boolean; retryAfter: number } {
  const now = Date.now();

  // Light GC so the map doesn't grow unbounded under sustained load.
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (v.resetAt < now) buckets.delete(k);
  }

  const b = buckets.get(ip);
  if (!b || b.resetAt < now) {
    buckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { allowed: true, retryAfter: 0 };
  }
  if (b.count >= RATE_MAX) {
    return { allowed: false, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
  }
  b.count++;
  return { allowed: true, retryAfter: 0 };
}

async function getClientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return h.get("x-real-ip") ?? "unknown";
}

export async function POST(request: Request) {
  const ip = await getClientIp();
  const rate = rateCheck(ip);
  if (!rate.allowed) {
    return NextResponse.json(
      {
        error: `Demasiados intentos. Vuelve a intentarlo en ${rate.retryAfter}s.`,
      },
      {
        status: 429,
        headers: { "Retry-After": String(rate.retryAfter) },
      },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const { email, password } =
    typeof body === "object" && body !== null
      ? (body as { email?: unknown; password?: unknown })
      : {};

  if (typeof email !== "string" || typeof password !== "string") {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !password) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
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
    });
  }
  return NextResponse.json({ ok: true });
}
