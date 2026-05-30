import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/cookie";

const PUBLIC_PATHS = new Set<string>(["/login", "/403"]);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic =
    PUBLIC_PATHS.has(pathname) ||
    // Verificación pública de constancias por QR/código: quien escanea el QR
    // no tiene sesión, así que /verificar y /verificar/<codigo> son públicas.
    pathname === "/verificar" ||
    pathname.startsWith("/verificar/") ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico";

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);

  if (isPublic) {
    // If logged in and visiting /login, send them home.
    if (pathname === "/login" && session) {
      const url = request.nextUrl.clone();
      url.pathname = "/usuarios";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (!session) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Run on all routes except static assets and image files
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
