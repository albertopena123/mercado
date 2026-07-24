"use server";

import { getCurrentUser } from "@/lib/auth/server";
import { leerEstadoServidor, type EstadoServidor } from "@/lib/sistema/metrics";
import type { ActionResult } from "./types";

// Sondeo de la página /sistema (cada ~5 s). Misma guarda que la página.
export async function getEstadoServidor(): Promise<ActionResult<EstadoServidor>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: "No autenticado." };
    if (!user.permissions.has("sistema.read"))
      return { ok: false, error: "No tienes permisos para esta acción." };
    return { ok: true, data: await leerEstadoServidor() };
  } catch (e) {
    console.error("getEstadoServidor", e);
    return { ok: false, error: "No se pudo leer el estado del servidor." };
  }
}
