import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/cookie";

const PUBLIC_PATHS = new Set<string>(["/", "/login", "/403"]);

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

  // Las rutas públicas pasan directo. NO redirigimos /login → /usuarios aquí:
  // el proxy solo valida la firma del token (stateless), pero la sesión podría
  // estar revocada/borrada en la BD. La página /login ya redirige a quien esté
  // realmente autenticado usando getCurrentUser (que sí consulta la BD), así
  // que duplicarlo aquí provocaba un bucle de redirección cuando el token
  // seguía firmado pero su sesión ya no existía. (Ver getCurrentUser.)
  if (isPublic) {
    return NextResponse.next();
  }

  // Resuelve el token igual que getCurrentUser: los clientes móviles no llevan
  // cookie y se autentican con `Authorization: Bearer …`, así que el proxy debe
  // considerar el bearer o redirigiría a /login una petición móvil válida. El
  // bearer tiene precedencia para que una cookie obsoleta no pise el header.
  const authz = request.headers.get("authorization");
  const bearer =
    authz && /^bearer\s+/i.test(authz)
      ? authz.replace(/^bearer\s+/i, "").trim()
      : null;
  const cookieToken = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySession(bearer || cookieToken);

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
