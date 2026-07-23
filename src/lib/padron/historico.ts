import "server-only";
import { prisma } from "@/lib/prisma";
import type { Empadronamiento } from "@/generated/prisma/client";
import { searchTokens } from "@/lib/socios/normalize";
import {
  antiguedadDesdeSlots, construirSlots, firmaNombre, masAntiguoEntrePuestos,
} from "./continuidad";
import type {
  AntiguedadSocio, AntiguedadPuesto, LinajePuesto, RegistroBusqueda,
} from "./types";

export async function getLinajePuesto(
  puestoId: string,
  // Gestiones precargadas: al recorrer los puestos de un mismo socio
  // (getHistoricoSocio) se leen UNA sola vez y se pasan aquí, en vez de releer
  // la tabla completa de Empadronamiento por cada puesto.
  gestionesPre?: Empadronamiento[],
): Promise<LinajePuesto | null> {
  const puesto = await prisma.puesto.findUnique({
    where: { id: puestoId },
    select: {
      id: true, codigo: true,
      asignaciones: {
        where: { hasta: null },
        select: {
          socio: {
            select: { id: true, apellidoPaterno: true, apellidoMaterno: true, nombres: true },
          },
        },
      },
    },
  });
  if (!puesto) return null;

  const gestiones = gestionesPre ?? await prisma.empadronamiento.findMany({ orderBy: { orden: "asc" } });
  const registros = await prisma.padronRegistro.findMany({ where: { puestoId } });
  const porGestion = new Map(registros.map((r) => [r.empadronamientoId, r]));

  // La construcción de slots y el cálculo de `cambioDeTitular` viven en
  // continuidad.ts (lógica pura, sin Prisma) para poder probarse sin BD.
  const slots = construirSlots(gestiones, (gestionId) => {
    const r = porGestion.get(gestionId);
    if (!r) return null;
    return {
      nombre: r.nombre, nombreOriginal: r.nombreOriginal, observacion: r.observacion,
      numeroPadron: r.numeroPadron, numeroDocumento: r.numeroDocumento, socioId: r.socioId,
    };
  });

  const a = puesto.asignaciones[0];
  return {
    puestoId: puesto.id,
    puestoCodigo: puesto.codigo,
    slots,
    titularActual: a
      ? {
          socioId: a.socio.id,
          nombre: [a.socio.apellidoPaterno, a.socio.apellidoMaterno, a.socio.nombres]
            .filter(Boolean).join(" "),
        }
      : null,
  };
}

// Devuelve, en UNA sola pasada, la antigüedad agregada del socio Y el linaje
// completo de cada uno de sus puestos vigentes. Antes había dos recorridos: uno
// aquí (que calculaba los linajes y los descartaba) y otro en la capa de acción
// que volvía a pedir cada linaje — el doble de queries por puesto. Ahora los
// linajes se calculan una vez y se reusan para ambos fines, y las gestiones se
// leen una sola vez para todos los puestos.
export async function getHistoricoSocio(
  socioId: string,
): Promise<{ antiguedad: AntiguedadSocio; linajes: LinajePuesto[] }> {
  const vacio: AntiguedadSocio = {
    desdeAnio: null, desdeGestion: null, puestoQueLoJustifica: null, porPuesto: [],
  };

  const socio = await prisma.socio.findUnique({
    where: { id: socioId },
    select: {
      apellidoPaterno: true, apellidoMaterno: true, nombres: true,
      asignacionesPuesto: {
        where: { hasta: null },
        select: { puesto: { select: { id: true, codigo: true } } },
      },
    },
  });
  if (!socio || socio.asignacionesPuesto.length === 0) return { antiguedad: vacio, linajes: [] };

  const firmaActual = firmaNombre(
    [socio.apellidoPaterno, socio.apellidoMaterno, socio.nombres].filter(Boolean).join(" "),
  );
  // Una sola lectura de gestiones para todos los puestos del socio.
  const gestiones = await prisma.empadronamiento.findMany({ orderBy: { orden: "asc" } });

  const linajes: LinajePuesto[] = [];
  const porPuesto: AntiguedadPuesto[] = [];
  for (const asig of socio.asignacionesPuesto) {
    const linaje = await getLinajePuesto(asig.puesto.id, gestiones);
    if (!linaje) continue;
    linajes.push(linaje);

    // El recorrido hacia atrás y el corte en el titular anterior distinto viven
    // en continuidad.ts (lógica pura, sin Prisma) para poder probarse sin BD.
    // Se pasa `socioId` para que un enlace ya verificado por DNI (2021) decida
    // la continuidad sin depender de que la firma de nombre calce — ver
    // comentario de `antiguedadDesdeSlots`.
    const { desdeAnio, desdeGestion } = antiguedadDesdeSlots(linaje.slots, firmaActual, socioId);
    porPuesto.push({
      puestoId: asig.puesto.id, puestoCodigo: asig.puesto.codigo, desdeAnio, desdeGestion,
    });
  }

  // Agregado: el empadronamiento MÁS ANTIGUO entre sus puestos (con desempate
  // determinista) — ver comentario en continuidad.ts.
  const masAntiguo = masAntiguoEntrePuestos(porPuesto);
  const antiguedad: AntiguedadSocio = masAntiguo
    ? {
        desdeAnio: masAntiguo.desdeAnio,
        desdeGestion: masAntiguo.desdeGestion,
        puestoQueLoJustifica: masAntiguo.puestoCodigo,
        porPuesto,
      }
    : { ...vacio, porPuesto };
  return { antiguedad, linajes };
}

// Solo la antigüedad agregada (sin los linajes). Delega en getHistoricoSocio
// para no duplicar el recorrido ni recalcular los linajes.
export async function getAntiguedadSocio(socioId: string): Promise<AntiguedadSocio> {
  return (await getHistoricoSocio(socioId)).antiguedad;
}

export async function buscarRegistros(q: string, limit = 50): Promise<RegistroBusqueda[]> {
  const tokens = searchTokens(q);
  if (tokens.length === 0) return [];

  // Búsqueda tokenizada obligatoria (AGENTS.md): CADA token debe aparecer, en
  // cualquier orden. Un `contains` del término completo falla por orden de
  // palabras — p. ej. "Julia Mondragón" contra "mondragon … julia".
  const filas = await prisma.padronRegistro.findMany({
    where: { AND: tokens.map((t) => ({ searchKey: { contains: t } })) },
    take: limit,
    orderBy: [{ empadronamiento: { orden: "desc" } }, { puesto: { codigo: "asc" } }],
    select: {
      id: true, nombreOriginal: true, numeroPadron: true, numeroDocumento: true, socioId: true,
      empadronamiento: { select: { anio: true, nombre: true } },
      puesto: { select: { codigo: true } },
    },
  });

  return filas.map((r) => ({
    id: r.id,
    anio: r.empadronamiento.anio,
    gestion: r.empadronamiento.nombre,
    puestoCodigo: r.puesto.codigo,
    nombreOriginal: r.nombreOriginal,
    numeroPadron: r.numeroPadron,
    numeroDocumento: r.numeroDocumento,
    socioId: r.socioId,
  }));
}
