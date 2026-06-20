import "server-only";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/server";
import type { EstadoSocio, TipoDocumento } from "@/generated/prisma/client";

export type SocioActual = {
  id: string;
  codigo: string;
  nombre: string;
  tipoDocumento: TipoDocumento;
  numeroDocumento: string;
  estado: EstadoSocio;
  telefono: string | null;
  email: string | null;
};

function nombreDe(s: {
  apellidoPaterno: string;
  apellidoMaterno: string | null;
  nombres: string;
}): string {
  return `${s.apellidoPaterno} ${s.apellidoMaterno ?? ""}, ${s.nombres}`.replace(
    /\s+,/,
    ",",
  );
}

const SELECT = {
  id: true,
  codigo: true,
  apellidoPaterno: true,
  apellidoMaterno: true,
  nombres: true,
  tipoDocumento: true,
  numeroDocumento: true,
  estado: true,
  telefono: true,
  email: true,
  portalEnabled: true,
} as const;

/** El socio vinculado al usuario logueado, o null si no aplica. */
export async function getSocioActual(): Promise<{
  user: CurrentUser;
  socio: SocioActual;
} | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  // El portal exige el permiso explícito portal.read ADEMÁS del vínculo con el
  // padrón: tener cuenta de socio no basta si el rol no concede el portal.
  if (!user.permissions.has("portal.read")) return null;
  const s = await prisma.socio.findUnique({
    where: { userId: user.id },
    select: SELECT,
  });
  if (!s || !s.portalEnabled) return null;
  // Un socio retirado o fallecido no accede al portal. Los suspendidos SÍ (para
  // que puedan consultar y regularizar su deuda).
  if (s.estado === "retirado" || s.estado === "fallecido") return null;
  return {
    user,
    socio: {
      id: s.id,
      codigo: s.codigo,
      nombre: nombreDe(s),
      tipoDocumento: s.tipoDocumento,
      numeroDocumento: s.numeroDocumento,
      estado: s.estado,
      telefono: s.telefono,
      email: s.email ?? user.email ?? null,
    },
  };
}

/**
 * Exige usuario con cuenta de socio habilitada; si no, lo saca del portal.
 * `next` (ruta interna) se conserva al redirigir a /login para volver al destino
 * tras autenticarse — clave para que el socio que escanea el QR sin sesión
 * regrese a la página de asistencia con su token intacto.
 */
export async function requireSocio(next?: string): Promise<{
  user: CurrentUser;
  socio: SocioActual;
}> {
  const user = await getCurrentUser();
  if (!user)
    redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  const r = await getSocioActual();
  if (!r) redirect("/403");
  return r;
}
