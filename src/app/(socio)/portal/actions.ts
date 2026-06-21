"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSocioActual } from "@/lib/portal/socio";
import { isQrTokenValid } from "@/lib/asambleas/qrToken";
import { Prisma, type TipoDocumento } from "@/generated/prisma/client";
import { lookupDniUnamad, type DniLookupResult } from "@/lib/socios/dni-lookup";
import { validateSocioInput } from "@/lib/socios/update";
import type { ActionResult, CreateSocioInput } from "@/app/(admin)/socios/types";

export type CheckinResult =
  | { ok: true; estado: "presente" | "tardanza"; yaRegistrado: boolean }
  | { ok: false; error: string };

/**
 * El socio logueado marca SU propia asistencia escaneando el QR VIVO de la
 * asamblea. `codigo` = Asamblea.codigoVerificacion (identifica la reunión) y
 * `token` = token rotativo de la ventana actual (viaja en el QR como `?t=`).
 * Sin un token fresco se rechaza: así no se puede marcar "desde casa" con la
 * URL estática, hay que escanear el código que la mesa muestra en pantalla.
 * El primer registro manda (un re-escaneo no cambia el estado).
 */
export async function checkInSocio(
  codigo: string,
  token?: string | null,
): Promise<CheckinResult> {
  try {
    const r = await getSocioActual();
    if (!r) return { ok: false, error: "Debes iniciar sesión como socio." };

    const asamblea = await prisma.asamblea.findUnique({
      where: { codigoVerificacion: codigo },
      select: { id: true, fecha: true, toleranciaMin: true, estado: true },
    });
    if (!asamblea) return { ok: false, error: "Reunión no encontrada." };

    // No registrar asistencia en reuniones cerradas (datos finalizados).
    if (asamblea.estado === "cerrada")
      return {
        ok: false,
        error: "La reunión ya está cerrada; no se puede registrar asistencia.",
      };
    // El registro está abierto cuando la mesa lo abrió (en_curso) o cuando una
    // asamblea programada ya alcanzó su hora de inicio (auto-apertura). Antes de
    // eso no se permite (evita auto-marcarse en una reunión futura con un código
    // de QR conocido de antemano). La mesa puede abrirlo desde el detalle de la
    // asamblea ("Iniciar asistencia").
    const abierto =
      asamblea.estado === "en_curso" ||
      (asamblea.estado === "programada" && Date.now() >= asamblea.fecha.getTime());
    if (!abierto)
      return {
        ok: false,
        error:
          "El registro de asistencia aún no está abierto. Espera a que la mesa lo habilite.",
      };

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

    // Una inasistencia justificada por la mesa es una decisión del admin: el
    // socio NO puede sobrescribirla escaneando el QR (cambiaría quórum y multas,
    // ya que justificado no paga). La mesa puede corregirla manualmente.
    if (asis.estado === "justificado") {
      return {
        ok: false,
        error: "Tu inasistencia ya fue justificada por la mesa.",
      };
    }

    // Prueba de presencia: el token debe ser el de la ventana vigente del QR que
    // muestra la mesa. Un token ausente o caducado (URL vieja/guardada) se
    // rechaza — esto es lo que impide marcar asistencia sin estar presente.
    if (!isQrTokenValid(asamblea.id, token, Date.now())) {
      return {
        ok: false,
        error: token
          ? "El código QR expiró. Vuelve a escanear el que se muestra en la pantalla de la reunión."
          : "Para registrar tu asistencia, escanea el código QR que se muestra en la pantalla de la reunión.",
      };
    }

    const now = Date.now();
    const cutoff =
      asamblea.fecha.getTime() + (asamblea.toleranciaMin ?? 15) * 60000;
    const estado: "presente" | "tardanza" = now <= cutoff ? "presente" : "tardanza";

    // Update condicional: si la asamblea se cerró entre la lectura de arriba y
    // este punto (TOCTOU), no registrar. `cerrada` es un límite duro.
    const upd = await prisma.asistencia.updateMany({
      where: { id: asis.id, asamblea: { estado: { not: "cerrada" } } },
      data: { estado, byUserId: r.user.id },
    });
    if (upd.count === 0)
      return {
        ok: false,
        error: "La reunión se cerró; no se pudo registrar tu asistencia.",
      };

    // La primera marca "inicia" la reunión: promueve programada → en_curso para
    // que el estado refleje que el registro está activo (consistencia con el
    // panel del admin). No bloqueante: si falla, el check-in ya quedó hecho.
    if (asamblea.estado === "programada") {
      try {
        await prisma.asamblea.update({
          where: { id: asamblea.id },
          data: { estado: "en_curso" },
        });
        revalidatePath("/asambleas");
        revalidatePath(`/asambleas/${asamblea.id}`);
      } catch (e) {
        console.error("checkInSocio: auto-promover estado", e);
      }
    }

    revalidatePath(`/portal/asambleas/${codigo}`);
    revalidatePath("/portal/asambleas");
    return { ok: true, estado, yaRegistrado: false };
  } catch (e) {
    console.error("checkInSocio", e);
    return { ok: false, error: "No se pudo registrar tu asistencia." };
  }
}

export async function lookupDniPortal(
  dni: string,
): Promise<ActionResult<DniLookupResult>> {
  const r = await getSocioActual();
  if (!r) return { ok: false, error: "Debes iniciar sesión como socio." };
  const clean = (dni ?? "").trim();
  if (!/^\d{8}$/.test(clean))
    return { ok: false, error: "El DNI debe tener exactamente 8 dígitos." };
  let data: DniLookupResult | null;
  try {
    data = await lookupDniUnamad(clean);
  } catch (e) {
    console.error("lookupDniPortal fetch", e);
    const err = e as { name?: string };
    if (err?.name === "AbortError")
      return { ok: false, error: "La consulta al servicio de DNI tardó demasiado." };
    return { ok: false, error: "No se pudo consultar el servicio de DNI." };
  }
  if (!data) return { ok: false, error: "No se encontró información para este DNI." };
  return { ok: true, data };
}

export type PerfilSelfInput = {
  tipoDocumento: TipoDocumento;
  numeroDocumento: string;
  apellidoPaterno: string;
  apellidoMaterno?: string;
  nombres: string;
  fechaNacimiento?: string;
  sexo?: "M" | "F";
  estadoCivil?: string;
  telefono?: string;
  email?: string;
  direccion?: string;
  distrito?: string;
  provincia?: string;
  departamento?: string;
};

// Solo los campos de la whitelist del autoservicio (defensa contra inyección de
// campos como estado/numeroPadron).
const SELF_FIELDS = [
  "tipoDocumento",
  "numeroDocumento",
  "apellidoPaterno",
  "apellidoMaterno",
  "nombres",
  "fechaNacimiento",
  "sexo",
  "estadoCivil",
  "telefono",
  "email",
  "direccion",
  "distrito",
  "provincia",
  "departamento",
] as const;

export async function crearSolicitudActualizacion(
  input: PerfilSelfInput,
): Promise<ActionResult<{ id: string }>> {
  const r = await getSocioActual();
  if (!r) return { ok: false, error: "Debes iniciar sesión como socio." };

  // Filtrar a la whitelist antes de validar.
  const clean: Partial<CreateSocioInput> = {};
  for (const k of SELF_FIELDS) {
    const v = (input as Record<string, unknown>)[k];
    if (v !== undefined) (clean as Record<string, unknown>)[k] = v;
  }

  const { fieldErrors, normalized } = validateSocioInput(clean, false);
  if (Object.keys(fieldErrors).length > 0)
    return { ok: false, error: "Revisa los campos marcados.", fieldErrors };

  // Debe quedar al menos un cambio significativo (evita solicitudes vacías).
  if (Object.keys(normalized).length === 0)
    return { ok: false, error: "No hay datos para enviar." };

  const yaPendiente = await prisma.solicitudActualizacionDatos.findFirst({
    where: { socioId: r.socio.id, estado: "pendiente" },
    select: { id: true },
  });
  if (yaPendiente)
    return {
      ok: false,
      error: "Ya tienes una solicitud pendiente de revisión.",
    };

  try {
    const s = await prisma.solicitudActualizacionDatos.create({
      data: {
        socioId: r.socio.id,
        datos: normalized as Prisma.InputJsonValue,
        estado: "pendiente",
      },
      select: { id: true },
    });
    revalidatePath("/portal/perfil");
    revalidatePath("/portal/perfil/actualizar");
    return { ok: true, data: { id: s.id } };
  } catch (e) {
    // El índice parcial único puede chocar si hubo carrera de doble-submit.
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    )
      return { ok: false, error: "Ya tienes una solicitud pendiente de revisión." };
    console.error("crearSolicitudActualizacion", e);
    return { ok: false, error: "No se pudo enviar la solicitud." };
  }
}

export async function cancelarMiSolicitud(): Promise<ActionResult> {
  const r = await getSocioActual();
  if (!r) return { ok: false, error: "Debes iniciar sesión como socio." };
  // Solo borra la pendiente del PROPIO socio (deleteMany acotado por socioId).
  await prisma.solicitudActualizacionDatos.deleteMany({
    where: { socioId: r.socio.id, estado: "pendiente" },
  });
  revalidatePath("/portal/perfil");
  revalidatePath("/portal/perfil/actualizar");
  return { ok: true };
}

