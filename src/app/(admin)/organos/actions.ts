"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/server";
import type { PermissionKey } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { inicioDiaUTC } from "@/lib/fecha";
import { normalizeToken } from "@/lib/socios/normalize";
import {
  CARGOS_UNICOS,
  type ActionResult,
  type CrearDirectivoInput,
  type EditarDirectivoInput,
  type SocioOption,
} from "./types";

class Denied extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Denied";
  }
}
async function authorize(perm: PermissionKey): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new Denied("No autenticado.");
  if (!user.permissions.has(perm))
    throw new Denied("No tienes permisos para esta acción.");
  return user;
}
function fail(error: string, fieldErrors?: Record<string, string>): ActionResult {
  return { ok: false, error, fieldErrors };
}
function ok<T>(data?: T): ActionResult<T> {
  return { ok: true, data };
}
function refresh() {
  revalidatePath("/organos");
}
function nombre(s: {
  apellidoPaterno: string;
  apellidoMaterno: string | null;
  nombres: string;
}): string {
  return `${s.apellidoPaterno} ${s.apellidoMaterno ?? ""}, ${s.nombres}`.replace(
    /\s+,/,
    ",",
  );
}

// Busca socios activos por nombre/código para asignarles un cargo directivo.
export async function buscarSocios(
  q: string,
): Promise<ActionResult<SocioOption[]>> {
  try {
    await authorize("organos.read");
    const term = (q ?? "").trim();
    if (term.length < 2) return ok([]);
    const token = normalizeToken(term);
    const socios = await prisma.socio.findMany({
      where: { estado: "activo", searchKey: { contains: token } },
      take: 8,
      orderBy: { apellidoPaterno: "asc" },
      select: {
        id: true,
        codigo: true,
        apellidoPaterno: true,
        apellidoMaterno: true,
        nombres: true,
      },
    });
    return ok(
      socios.map((s) => ({ id: s.id, codigo: s.codigo, nombre: nombre(s) })),
    );
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("buscarSocios", e);
    return fail("No se pudo buscar.");
  }
}

export async function crearDirectivo(
  input: CrearDirectivoInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const me = await authorize("organos.write");

    const socio = await prisma.socio.findUnique({
      where: { id: input.socioId },
      select: { id: true, estado: true },
    });
    if (!socio) return fail("Socio no encontrado.");
    if (socio.estado !== "activo")
      return fail("Solo un socio activo puede ocupar un cargo directivo.");

    const fe: Record<string, string> = {};
    const bloque =
      input.organo === "coordinacion_bloque"
        ? (input.bloque ?? "").trim().toUpperCase()
        : null;
    if (input.organo === "coordinacion_bloque" && !bloque)
      fe.bloque = "Indica el bloque que coordina.";

    if (Object.keys(fe).length > 0)
      return fail("Revisa los campos marcados.", fe);

    // El mismo socio no puede tener dos veces vigente el mismo (órgano, cargo).
    const yaTiene = await prisma.directivo.findFirst({
      where: {
        socioId: input.socioId,
        organo: input.organo,
        cargo: input.cargo,
        hasta: null,
      },
      select: { id: true },
    });
    if (yaTiene)
      return fail("Este socio ya ocupa ese cargo vigente en ese órgano.");

    // Cargos únicos (presidente, fiscal, tesorero…): un solo titular vigente por
    // órgano. Hay que cesar al titular anterior antes de nombrar a otro.
    if (CARGOS_UNICOS.includes(input.cargo)) {
      const ocupado = await prisma.directivo.findFirst({
        where: { organo: input.organo, cargo: input.cargo, hasta: null },
        select: { id: true },
      });
      if (ocupado)
        return fail(
          "Ese cargo ya tiene un titular vigente. Cesa al titular actual antes de nombrar a otro.",
        );
    }

    const desde = input.desde ? inicioDiaUTC(input.desde) : new Date();
    if (isNaN(desde.getTime())) return fail("Fecha de inicio inválida.");

    const created = await prisma.directivo.create({
      data: {
        socioId: input.socioId,
        organo: input.organo,
        cargo: input.cargo,
        bloque,
        periodo: input.periodo?.trim() || null,
        desde,
        observaciones: input.observaciones?.trim() || null,
        byUserId: me.id,
      },
      select: { id: true },
    });
    refresh();
    return ok({ id: created.id });
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof Denied) return fail(e.message);
    console.error("crearDirectivo", e);
    return fail("No se pudo registrar el cargo.");
  }
}

export async function editarDirectivo(
  id: string,
  patch: EditarDirectivoInput,
): Promise<ActionResult> {
  try {
    await authorize("organos.write");
    const actual = await prisma.directivo.findUnique({
      where: { id },
      select: { id: true, organo: true },
    });
    if (!actual) return fail("Cargo no encontrado.");

    const organo = patch.organo ?? actual.organo;
    const bloque =
      organo === "coordinacion_bloque"
        ? (patch.bloque ?? "").trim().toUpperCase() || null
        : null;
    if (organo === "coordinacion_bloque" && !bloque)
      return fail("Indica el bloque que coordina.", { bloque: "Obligatorio." });

    await prisma.directivo.update({
      where: { id },
      data: {
        organo,
        cargo: patch.cargo,
        bloque,
        periodo: patch.periodo?.trim() || null,
        observaciones: patch.observaciones?.trim() || null,
      },
    });
    refresh();
    return ok();
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof Denied) return fail(e.message);
    console.error("editarDirectivo", e);
    return fail("No se pudo actualizar el cargo.");
  }
}

// Cesa un cargo vigente (le pone fecha de fin). Pasa a historial.
export async function cesarDirectivo(
  id: string,
  hasta?: string,
): Promise<ActionResult> {
  try {
    await authorize("organos.write");
    const fin = hasta ? inicioDiaUTC(hasta) : new Date();
    if (isNaN(fin.getTime())) return fail("Fecha de cese inválida.");
    const res = await prisma.directivo.updateMany({
      where: { id, hasta: null },
      data: { hasta: fin },
    });
    if (res.count === 0) return fail("El cargo ya no está vigente.");
    refresh();
    return ok();
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof Denied) return fail(e.message);
    console.error("cesarDirectivo", e);
    return fail("No se pudo cesar el cargo.");
  }
}

// Elimina el registro (para corregir cargas erróneas).
export async function eliminarDirectivo(id: string): Promise<ActionResult> {
  try {
    await authorize("organos.write");
    await prisma.directivo.delete({ where: { id } });
    refresh();
    return ok();
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof Denied) return fail(e.message);
    console.error("eliminarDirectivo", e);
    return fail("No se pudo eliminar el cargo.");
  }
}
