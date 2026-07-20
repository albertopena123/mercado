import "server-only";
import { prisma } from "@/lib/prisma";
import { normalizeToken, searchTokens } from "@/lib/socios/normalize";
import type {
  AntiguedadSocio, AntiguedadPuesto, LinajePuesto, RegistroBusqueda, SlotLinaje,
} from "./types";

// Firma normalizada de un nombre para comparar titulares entre gestiones: sin
// tildes, sin anotaciones entre paréntesis, sin palabras cortas, y ORDENADA —
// así "MONDRAGON CONDORI JULIA" y "JULIA MONDRAGON CONDORI" son el mismo
// titular. El nombre solo se usa para comparar dentro de UN MISMO puesto; nunca
// para unir registros entre puestos distintos.
function firmaNombre(s: string | null): string {
  return normalizeToken(s ?? "")
    .replace(/\([^)]*\)/g, " ")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2)
    .sort()
    .join(" ");
}

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

  // `cambioDeTitular` se compara contra el ÚLTIMO slot CON DATO, no contra el
  // inmediatamente anterior: 2014 y 2019 fueron empadronamientos incompletos, y
  // comparar contra un hueco reportaría un traspaso que nunca ocurrió.
  let ultimaFirma: string | null = null;
  const slots: SlotLinaje[] = gestiones.map((g) => {
    const r = porGestion.get(g.id);
    if (!r) {
      return { anio: g.anio, gestion: g.nombre, orden: g.orden, registro: null, cambioDeTitular: false };
    }
    const firma = firmaNombre(r.nombre ?? r.nombreOriginal);
    const cambio = ultimaFirma !== null && firma !== "" && firma !== ultimaFirma;
    if (firma !== "") ultimaFirma = firma;
    return {
      anio: g.anio, gestion: g.nombre, orden: g.orden,
      registro: {
        nombre: r.nombre, nombreOriginal: r.nombreOriginal, observacion: r.observacion,
        numeroPadron: r.numeroPadron, numeroDocumento: r.numeroDocumento, socioId: r.socioId,
      },
      cambioDeTitular: cambio,
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

    // Se recorre de la gestión MÁS RECIENTE hacia atrás mientras el titular siga
    // siendo el mismo. Al primer titular distinto se corta: antes de ese punto el
    // puesto era de otra persona.
    let desdeAnio: number | null = null;
    let desdeGestion: string | null = null;
    for (const slot of [...linaje.slots].reverse()) {
      if (!slot.registro) continue;
      const firma = firmaNombre(slot.registro.nombre ?? slot.registro.nombreOriginal);
      if (firma === "" || firma !== firmaActual) break;
      desdeAnio = slot.anio;
      desdeGestion = slot.gestion;
    }
    porPuesto.push({
      puestoId: asig.puesto.id, puestoCodigo: asig.puesto.codigo, desdeAnio, desdeGestion,
    });
  }

  // Agregado: el empadronamiento MÁS ANTIGUO entre sus puestos. Un socio con un
  // puesto desde 2014 y otro comprado en 2021 es un socio de 2014.
  const conDato = porPuesto.filter((p) => p.desdeAnio !== null);
  if (conDato.length === 0) return { ...vacio, porPuesto };
  const masAntiguo = conDato.reduce((a, b) => (a.desdeAnio! <= b.desdeAnio! ? a : b));
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
