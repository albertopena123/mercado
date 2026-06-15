"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSocioActual } from "@/lib/portal/socio";

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
      select: { id: true, fecha: true, toleranciaMin: true, estado: true },
    });
    if (!asamblea) return { ok: false, error: "Reunión no encontrada." };

    // No registrar asistencia en reuniones cerradas (datos finalizados) ni
    // antes de que inicien (evita auto-marcarse presente en una reunión futura
    // con un código de QR conocido de antemano).
    if (asamblea.estado === "cerrada")
      return {
        ok: false,
        error: "La reunión ya está cerrada; no se puede registrar asistencia.",
      };
    if (Date.now() < asamblea.fecha.getTime())
      return { ok: false, error: "La reunión aún no ha iniciado." };

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

