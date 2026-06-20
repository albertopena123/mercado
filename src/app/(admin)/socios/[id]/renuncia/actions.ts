"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/server";
import { inicioDiaUTC } from "@/lib/fecha";
import type { ActionResult } from "../../types";

function fail(error: string, fieldErrors?: Record<string, string>): ActionResult {
  return { ok: false, error, fieldErrors };
}
function ok<T>(data?: T): ActionResult<T> {
  return { ok: true, data };
}
function refresh(socioId: string) {
  revalidatePath(`/socios/${socioId}/renuncia`);
  revalidatePath("/socios");
  revalidatePath("/puestos");
}

// Estados en los que el expediente sigue "abierto" (no se puede abrir otro).
const ABIERTOS = ["solicitada", "aceptada_cd", "ratificada_ag"] as const;

/**
 * Registra la SOLICITUD de renuncia de un socio (Estatuto Art. 8.a: renuncia
 * escrita dirigida al Presidente). Crea el expediente en estado 'solicitada'.
 */
export async function crearRenuncia(
  socioId: string,
  input: { motivo?: string; observaciones?: string },
): Promise<ActionResult<{ id: string }>> {
  try {
    const me = await requirePermission("socios.write");

    const socio = await prisma.socio.findUnique({
      where: { id: socioId },
      select: { id: true, estado: true },
    });
    if (!socio) return fail("Socio no encontrado.");
    if (socio.estado !== "activo")
      return fail("Solo un socio activo puede presentar su renuncia.");

    const abierta = await prisma.renuncia.findFirst({
      where: { socioId, estado: { in: [...ABIERTOS] } },
      select: { id: true },
    });
    if (abierta)
      return fail("Este socio ya tiene un expediente de renuncia en trámite.");

    const created = await prisma.renuncia.create({
      data: {
        socioId,
        estado: "solicitada",
        motivo: input.motivo?.trim() || null,
        observaciones: input.observaciones?.trim() || null,
        createdById: me.id,
      },
      select: { id: true },
    });
    refresh(socioId);
    return ok({ id: created.id });
  } catch (e) {
    unstable_rethrow(e);
    console.error("crearRenuncia", e);
    return fail("No se pudo registrar la solicitud de renuncia.");
  }
}

/**
 * Registra la ACEPTACIÓN del Consejo Directivo (acta). solicitada → aceptada_cd.
 */
export async function registrarAceptacionCd(
  renunciaId: string,
  input: { actaCdNumero?: string; actaCdFecha?: string },
): Promise<ActionResult> {
  try {
    await requirePermission("socios.write");
    const r = await prisma.renuncia.findUnique({
      where: { id: renunciaId },
      select: { socioId: true, estado: true },
    });
    if (!r) return fail("Expediente de renuncia no encontrado.");
    if (r.estado !== "solicitada")
      return fail("La renuncia ya no está en estado 'solicitada'.");

    const numero = input.actaCdNumero?.trim() || null;
    if (!numero) return fail("Indica el número de acta del Consejo Directivo.");

    // Transición condicional (anti doble-click / carrera).
    const upd = await prisma.renuncia.updateMany({
      where: { id: renunciaId, estado: "solicitada" },
      data: {
        estado: "aceptada_cd",
        actaCdNumero: numero,
        actaCdFecha: input.actaCdFecha ? inicioDiaUTC(input.actaCdFecha) : null,
      },
    });
    if (upd.count === 0)
      return fail("El expediente cambió de estado; recarga la página.");
    refresh(r.socioId);
    return ok();
  } catch (e) {
    unstable_rethrow(e);
    console.error("registrarAceptacionCd", e);
    return fail("No se pudo registrar la aceptación del Consejo Directivo.");
  }
}

/**
 * Registra la RATIFICACIÓN de la Asamblea General (acta). aceptada_cd →
 * ratificada_ag.
 */
export async function registrarRatificacionAg(
  renunciaId: string,
  input: { actaAgNumero?: string; actaAgFecha?: string },
): Promise<ActionResult> {
  try {
    await requirePermission("socios.write");
    const r = await prisma.renuncia.findUnique({
      where: { id: renunciaId },
      select: { socioId: true, estado: true },
    });
    if (!r) return fail("Expediente de renuncia no encontrado.");
    if (r.estado !== "aceptada_cd")
      return fail("La renuncia debe estar aceptada por el Consejo Directivo.");

    const numero = input.actaAgNumero?.trim() || null;
    if (!numero) return fail("Indica el número de acta de la Asamblea General.");

    const upd = await prisma.renuncia.updateMany({
      where: { id: renunciaId, estado: "aceptada_cd" },
      data: {
        estado: "ratificada_ag",
        actaAgNumero: numero,
        actaAgFecha: input.actaAgFecha ? inicioDiaUTC(input.actaAgFecha) : null,
      },
    });
    if (upd.count === 0)
      return fail("El expediente cambió de estado; recarga la página.");
    refresh(r.socioId);
    return ok();
  } catch (e) {
    unstable_rethrow(e);
    console.error("registrarRatificacionAg", e);
    return fail("No se pudo registrar la ratificación de la Asamblea General.");
  }
}

/**
 * EFECTIVIZA la renuncia (solo desde ratificada_ag): en una transacción marca el
 * expediente 'efectiva', retira al socio (estado 'retirado' + SocioEstadoLog) y
 * libera sus puestos (cierra asignaciones vigentes y deja los puestos vacíos).
 */
export async function efectivizarRenuncia(
  renunciaId: string,
): Promise<ActionResult<{ puestosLiberados: number; socioRetirado: boolean }>> {
  try {
    const me = await requirePermission("socios.change-state");
    const r = await prisma.renuncia.findUnique({
      where: { id: renunciaId },
      select: { socioId: true, estado: true, actaAgNumero: true },
    });
    if (!r) return fail("Expediente de renuncia no encontrado.");
    if (r.estado !== "ratificada_ag")
      return fail(
        "La renuncia debe estar ratificada por la Asamblea General antes de efectivizarse.",
      );

    const socio = await prisma.socio.findUnique({
      where: { id: r.socioId },
      select: { id: true, estado: true },
    });
    if (!socio) return fail("Socio no encontrado.");

    const result = await prisma.$transaction(async (tx) => {
      // Lock las filas Puesto vigentes del socio para serializar contra
      // formalizarTransferencia/assignPuesto (que también toman SELECT ... FOR
      // UPDATE sobre Puesto). Evita pisar el estado del puesto en una carrera
      // (p. ej. dejar el puesto "vacio" cuando una transferencia recién lo
      // reasignó a un adquiriente).
      await tx.$queryRaw`SELECT p.id FROM "Puesto" p
        JOIN "PuestoAsignacion" pa ON pa."puestoId" = p.id
        WHERE pa."socioId" = ${socio.id} AND pa.hasta IS NULL
        FOR UPDATE OF p`;
      // Transición condicional: si otro proceso ya la efectivizó, no repetir.
      const upd = await tx.renuncia.updateMany({
        where: { id: renunciaId, estado: "ratificada_ag" },
        data: { estado: "efectiva", efectivaEn: new Date() },
      });
      if (upd.count === 0) return { puestosLiberados: 0, socioRetirado: false };

      const ahora = new Date();
      let socioRetirado = false;
      if (socio.estado === "activo") {
        await tx.socio.update({
          where: { id: socio.id },
          data: { estado: "retirado" },
        });
        await tx.socioEstadoLog.create({
          data: {
            socioId: socio.id,
            fromEstado: socio.estado,
            toEstado: "retirado",
            motivo: `Renuncia voluntaria${
              r.actaAgNumero ? ` · Acta AG ${r.actaAgNumero}` : ""
            }`,
            byUserId: me.id,
          },
        });
        socioRetirado = true;
      }

      // Liberar puestos vigentes del socio.
      const asigs = await tx.puestoAsignacion.findMany({
        where: { socioId: socio.id, hasta: null },
        select: { puestoId: true },
      });
      if (asigs.length > 0) {
        await tx.puestoAsignacion.updateMany({
          where: { socioId: socio.id, hasta: null },
          data: { hasta: ahora, motivo: "Renuncia del socio" },
        });
        await tx.puesto.updateMany({
          where: { id: { in: asigs.map((a) => a.puestoId) } },
          data: { estado: "vacio" },
        });
      }
      return { puestosLiberados: asigs.length, socioRetirado };
    });

    refresh(r.socioId);
    return ok(result);
  } catch (e) {
    unstable_rethrow(e);
    console.error("efectivizarRenuncia", e);
    return fail("No se pudo efectivizar la renuncia.");
  }
}

/**
 * RECHAZA la renuncia (el órgano no la acepta). Cualquier estado abierto →
 * rechazada. No toca al socio ni a sus puestos.
 */
export async function rechazarRenuncia(
  renunciaId: string,
  input: { motivoRechazo?: string },
): Promise<ActionResult> {
  try {
    await requirePermission("socios.write");
    const r = await prisma.renuncia.findUnique({
      where: { id: renunciaId },
      select: { socioId: true, estado: true },
    });
    if (!r) return fail("Expediente de renuncia no encontrado.");
    if (!ABIERTOS.includes(r.estado as (typeof ABIERTOS)[number]))
      return fail("Solo se puede rechazar un expediente en trámite.");

    const upd = await prisma.renuncia.updateMany({
      where: { id: renunciaId, estado: { in: [...ABIERTOS] } },
      data: {
        estado: "rechazada",
        motivoRechazo: input.motivoRechazo?.trim() || null,
      },
    });
    if (upd.count === 0)
      return fail("El expediente cambió de estado; recarga la página.");
    refresh(r.socioId);
    return ok();
  } catch (e) {
    unstable_rethrow(e);
    console.error("rechazarRenuncia", e);
    return fail("No se pudo rechazar la renuncia.");
  }
}
