import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";
import { hasAdminAccess, type PermissionKey } from "@/lib/auth/permissions";
import { LogoutButton } from "./LogoutButton";

export const metadata = { title: "Acceso denegado" };
export const dynamic = "force-dynamic";

// Módulos del panel y el permiso de lectura que cada uno exige, en orden de
// preferencia. Se usa para mandar al staff a un módulo que SÍ pueda abrir
// (evita el bucle /403 → módulo sin permiso → /403).
const ADMIN_HOMES: { perm: PermissionKey; href: string }[] = [
  { perm: "users.read", href: "/usuarios" },
  { perm: "socios.read", href: "/socios" },
  { perm: "puestos.read", href: "/puestos" },
  { perm: "cuotas.read", href: "/cuotas" },
  { perm: "asambleas.read", href: "/asambleas" },
  { perm: "anuncios.read", href: "/anuncios" },
  { perm: "roles.read", href: "/roles" },
];

export default async function ForbiddenPage() {
  const user = await getCurrentUser();

  // Sin sesión: a iniciar sesión.
  if (!user) redirect("/login");

  // Socio del portal (sin acceso al panel): a su dashboard.
  const socio = await prisma.socio.findUnique({
    where: { userId: user.id },
    select: { portalEnabled: true },
  });
  if (socio?.portalEnabled && !hasAdminAccess(user.permissions)) {
    redirect("/portal");
  }

  // Staff: al primer módulo que pueda abrir realmente.
  for (const h of ADMIN_HOMES) {
    if (user.permissions.has(h.perm)) redirect(h.href);
  }

  // Caso límite: usuario con sesión pero sin ningún acceso → solo puede salir.
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        textAlign: "center",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div style={{ maxWidth: 420 }}>
        <div style={{ fontSize: 56, fontWeight: 800, color: "#5128b4" }}>403</div>
        <h1 style={{ fontSize: 22, margin: "8px 0 6px" }}>Acceso denegado</h1>
        <p style={{ color: "#5c5872", marginBottom: 20 }}>
          Tu cuenta no tiene módulos asignados. Contacta al administrador.
        </p>
        <LogoutButton />
      </div>
    </main>
  );
}
