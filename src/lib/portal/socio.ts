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
  const s = await prisma.socio.findUnique({
    where: { userId: user.id },
    select: SELECT,
  });
  if (!s || !s.portalEnabled) return null;
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

/** Exige usuario con cuenta de socio habilitada; si no, lo saca del portal. */
export async function requireSocio(): Promise<{
  user: CurrentUser;
  socio: SocioActual;
}> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const r = await getSocioActual();
  if (!r) redirect("/403");
  return r;
}
