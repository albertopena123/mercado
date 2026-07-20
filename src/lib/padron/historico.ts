import "server-only";
import { prisma } from "@/lib/prisma";
import { searchTokens } from "@/lib/socios/normalize";
import {
  antiguedadDesdeSlots, construirSlots, firmaNombre, masAntiguoEntrePuestos,
} from "./continuidad";
import type {
  AntiguedadSocio, AntiguedadPuesto, LinajePuesto, RegistroBusqueda,
} from "./types";

export async function getLinajePuesto(puestoId: string): Promise<LinajePuesto | null> {
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

  const gestiones = await prisma.empadronamiento.findMany({ orderBy: { orden: "asc" } });
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

export async function getAntiguedadSocio(socioId: string): Promise<AntiguedadSocio> {
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
  if (!socio || socio.asignacionesPuesto.length === 0) return vacio;

  const firmaActual = firmaNombre(
    [socio.apellidoPaterno, socio.apellidoMaterno, socio.nombres].filter(Boolean).join(" "),
  );

  const porPuesto: AntiguedadPuesto[] = [];
  for (const asig of socio.asignacionesPuesto) {
    const linaje = await getLinajePuesto(asig.puesto.id);
    if (!linaje) continue;

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
  if (!masAntiguo) return { ...vacio, porPuesto };
  return {
    desdeAnio: masAntiguo.desdeAnio,
    desdeGestion: masAntiguo.desdeGestion,
    puestoQueLoJustifica: masAntiguo.puestoCodigo,
    porPuesto,
  };
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
