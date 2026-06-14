"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/server";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { getSocioActual } from "@/lib/portal/socio";

export type PortalResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** Cambia la contraseña del propio usuario logueado (autoservicio). */
export async function changeMiPassword(
  actual: string,
  nueva: string,
): Promise<PortalResult> {
  try {
    const me = await getCurrentUser();
    if (!me) return { ok: false, error: "No autenticado." };

    if (typeof nueva !== "string" || nueva.length < 6 || nueva.length > 200) {
      return {
        ok: false,
        error: "Revisa los campos.",
        fieldErrors: { nueva: "La nueva contraseña debe tener al menos 6 caracteres." },
      };
    }

    const user = await prisma.user.findUnique({
      where: { id: me.id },
      select: { passwordHash: true },
    });
    if (!user) return { ok: false, error: "Usuario no encontrado." };

    const valid = await verifyPassword(actual, user.passwordHash);
    if (!valid) {
      return {
        ok: false,
        error: "La contraseña actual es incorrecta.",
        fieldErrors: { actual: "Contraseña incorrecta." },
      };
    }

    const newHash = await hashPassword(nueva);
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: me.id },
        data: { passwordHash: newHash },
      });
      // Cierra las demás sesiones por seguridad (mantiene la actual).
      await tx.session.deleteMany({
        where: { userId: me.id, NOT: { id: me.sessionId } },
      });
    });
    return { ok: true };
  } catch (e) {
    console.error("changeMiPassword", e);
    return { ok: false, error: "No se pudo cambiar la contraseña." };
  }
}

export type CheckinResult =
  | { ok: true; estado: "presente" | "tardanza"; yaRegistrado: boolean }
  | { ok: false; error: string };

/**
 * El socio logueado marca SU propia asistencia escaneando el QR de la asamblea.
 * `codigo` = Asamblea.codigoVerificacion (viaja en el QR). Aplica la misma
 * ventana de tolerancia que el check-in por DNI del admin. El primer registro
 * manda (un re-escaneo no cambia el estado).
 */
export async function checkInSocio(codigo: string): Promise<CheckinResult> {
  try {
    const r = await getSocioActual();
    if (!r) return { ok: false, error: "Debes iniciar sesión como socio." };

    const asamblea = await prisma.asamblea.findUnique({
      where: { codigoVerificacion: codigo },
      select: { id: true, fecha: true, toleranciaMin: true },
    });
    if (!asamblea) return { ok: false, error: "Reunión no encontrada." };

    const asis = await prisma.asistencia.findUnique({
      where: {
        asambleaId_socioId: { asambleaId: asamblea.id, socioId: r.socio.id },
      },
      select: { id: true, estado: true },
    });
    if (!asis)
      return { ok: false, error: "No estás en la lista de esta reunión." };

    if (asis.estado === "presente" || asis.estado === "tardanza") {
      return { ok: true, estado: asis.estado, yaRegistrado: true };
    }

    const now = Date.now();
    const cutoff =
      asamblea.fecha.getTime() + (asamblea.toleranciaMin ?? 15) * 60000;
    const estado: "presente" | "tardanza" = now <= cutoff ? "presente" : "tardanza";

    await prisma.asistencia.update({
      where: { id: asis.id },
      data: { estado, byUserId: r.user.id },
    });
    revalidatePath(`/portal/asambleas/${codigo}`);
    revalidatePath("/portal/asambleas");
    return { ok: true, estado, yaRegistrado: false };
  } catch (e) {
    console.error("checkInSocio", e);
    return { ok: false, error: "No se pudo registrar tu asistencia." };
  }
}

