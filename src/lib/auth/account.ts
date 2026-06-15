"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/server";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/**
 * Cambia la contraseña del propio usuario logueado (autoservicio). Verifica la
 * contraseña actual y cierra las demás sesiones por seguridad (mantiene la
 * actual). Usada por el admin (TopBar) y por el portal del socio.
 */
export async function changeOwnPassword(
  actual: string,
  nueva: string,
): Promise<ChangePasswordResult> {
  try {
    const me = await getCurrentUser();
    if (!me) return { ok: false, error: "No autenticado." };

    if (typeof nueva !== "string" || nueva.length < 6 || nueva.length > 200) {
      return {
        ok: false,
        error: "Revisa los campos.",
        fieldErrors: {
          nueva: "La nueva contraseña debe tener al menos 6 caracteres.",
        },
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
      await tx.session.deleteMany({
        where: { userId: me.id, NOT: { id: me.sessionId } },
      });
    });
    return { ok: true };
  } catch (e) {
    console.error("changeOwnPassword", e);
    return { ok: false, error: "No se pudo cambiar la contraseña." };
  }
}
