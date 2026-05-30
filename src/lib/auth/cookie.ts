// Edge-safe HMAC cookie signing using Web Crypto (works in middleware + Node).
// Format: <base64url(payload)>.<base64url(signature)>
// Payload: JSON { sid, uid, exp } — sid binds the token to a row in the Session table.

export const SESSION_COOKIE = "conadis_session";
export const SESSION_TTL_DAYS = 14;

export type SessionPayload = {
  sid: string;
  uid: string;
  exp: number; // unix seconds
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str: string): Uint8Array<ArrayBuffer> {
  const padded =
    str.replace(/-/g, "+").replace(/_/g, "/") +
    "=".repeat((4 - (str.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function getSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not set");
  return s;
}

export async function signSession(payload: SessionPayload): Promise<string> {
  const key = await importKey(getSecret());
  const body = b64urlEncode(encoder.encode(JSON.stringify(payload)));
  const sigBuf = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return `${body}.${b64urlEncode(new Uint8Array(sigBuf))}`;
}

export async function verifySession(
  token: string | undefined,
): Promise<SessionPayload | null> {
  if (!token) return null;
  const idx = token.lastIndexOf(".");
  if (idx <= 0) return null;
  const body = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  try {
    const key = await importKey(getSecret());
    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      b64urlDecode(sig),
      encoder.encode(body),
    );
    if (!ok) return null;
    const payload = JSON.parse(decoder.decode(b64urlDecode(body))) as SessionPayload;
    if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
