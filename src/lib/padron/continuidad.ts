// Lógica pura de continuidad de titularidad en el padrón histórico. SIN
// `server-only`, SIN Prisma, SIN I/O: recibe datos ya cargados por el llamador
// (historico.ts) y devuelve estructuras planas. Se separa de historico.ts para
// poder probarla con datos construidos a mano en prisma/verify-historico.ts —
// un script tsx no puede importar `server-only`, y duplicar esta lógica dentro
// del verificador probaría una copia, no el código real.

import { normalizeToken } from "@/lib/socios/normalize";
import type { AntiguedadPuesto, RegistroHistorico, SlotLinaje } from "./types";

// Firma normalizada de un nombre para comparar titulares entre gestiones: sin
// tildes, sin anotaciones entre paréntesis, sin palabras cortas, y ORDENADA —
// así "MONDRAGON CONDORI JULIA" y "JULIA MONDRAGON CONDORI" son el mismo
// titular. El nombre solo se usa para comparar dentro de UN MISMO puesto; nunca
// para unir registros entre puestos distintos.
export function firmaNombre(s: string | null): string {
  return normalizeToken(s ?? "")
    .replace(/\([^)]*\)/g, " ")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2)
    .sort()
    .join(" ");
}

// Gestión mínima necesaria para construir un linaje (una fila de
// Empadronamiento, ya ordenada por `orden` por el llamador).
export type GestionInput = { anio: number; nombre: string; orden: number; id: string };

// Construye los slots del linaje de un puesto, uno por gestión (SIEMPRE los
// cuatro, con `registro: null` si esa gestión no empadronó el puesto — la
// ausencia es información y no debe omitirse) y marca `cambioDeTitular`.
//
// `cambioDeTitular` se compara contra el ÚLTIMO slot CON DATO, no contra el
// inmediatamente anterior: 2014 y 2019 fueron empadronamientos incompletos, y
// comparar contra un hueco reportaría un traspaso que nunca ocurrió. El primer
// slot con dato nunca puede marcarse como cambio (no hay titular previo con el
// que compararlo), y un nombre vacío no cuenta ni como continuidad ni como
// cambio (no hay evidencia en ningún sentido).
export function construirSlots(
  gestiones: GestionInput[],
  registroPorGestion: (gestionId: string) => RegistroHistorico | null,
): SlotLinaje[] {
  let ultimaFirma: string | null = null;
  return gestiones.map((g) => {
    const r = registroPorGestion(g.id);
    if (!r) {
      return { anio: g.anio, gestion: g.nombre, orden: g.orden, registro: null, cambioDeTitular: false };
    }
    const firma = firmaNombre(r.nombre ?? r.nombreOriginal);
    const cambio = ultimaFirma !== null && firma !== "" && firma !== ultimaFirma;
    if (firma !== "") ultimaFirma = firma;
    return { anio: g.anio, gestion: g.nombre, orden: g.orden, registro: r, cambioDeTitular: cambio };
  });
}

// Recorre los slots de un linaje de MÁS RECIENTE a MÁS ANTIGUO mientras el
// titular siga siendo el mismo, y devuelve desde qué gestión es continuo. Los
// huecos (`registro: null`) se SALTAN sin cortar el recorrido — no hay dato,
// no hay contradicción. Una `firmaObjetivo` vacía no puede afirmar
// continuidad con nada.
//
// Un slot cuenta como continuidad de dos formas, evaluadas en este orden:
//   1. `slot.registro.socioId === socioId` — el importador (import-historico.ts)
//      ya verificó este enlace por DNI, con veto por nombre incluido. Honrarlo
//      aquí no crea ningún vínculo nuevo entre personas, solo respeta uno que
//      ya pasó ese control; por eso decide SIN mirar la firma de nombre.
//   2. Si no hay enlace por socioId en ese slot, se cae a comparar la firma de
//      nombre contra `firmaObjetivo` — el único camino disponible en
//      2014/2017/2019, que no traen documento.
// El recorrido corta en el primer slot CON DATO que no cumpla ninguna de las
// dos: antes de ese punto el puesto era de otra persona.
export function antiguedadDesdeSlots(
  slots: SlotLinaje[],
  firmaObjetivo: string,
  socioId: string | null,
): { desdeAnio: number | null; desdeGestion: string | null } {
  let desdeAnio: number | null = null;
  let desdeGestion: string | null = null;
  if (firmaObjetivo === "" && !socioId) return { desdeAnio, desdeGestion };
  for (const slot of [...slots].reverse()) {
    if (!slot.registro) continue;
    if (socioId && slot.registro.socioId === socioId) {
      desdeAnio = slot.anio;
      desdeGestion = slot.gestion;
      continue;
    }
    const firma = firmaNombre(slot.registro.nombre ?? slot.registro.nombreOriginal);
    if (firmaObjetivo === "" || firma === "" || firma !== firmaObjetivo) break;
    desdeAnio = slot.anio;
    desdeGestion = slot.gestion;
  }
  return { desdeAnio, desdeGestion };
}

// Reduce la antigüedad por puesto al empadronamiento MÁS ANTIGUO entre varios
// puestos del mismo socio: un socio con un puesto desde 2014 y otro comprado en
// 2021 es un socio de 2014. Desempate DETERMINISTA por código de puesto (orden
// alfabético ascendente) cuando dos puestos comparten el año más antiguo —
// `puestoQueLoJustifica` es un campo de auditoría y no puede depender del orden
// arbitrario en que Prisma devuelve las filas.
export function masAntiguoEntrePuestos(porPuesto: AntiguedadPuesto[]): AntiguedadPuesto | null {
  const conDato = porPuesto.filter((p) => p.desdeAnio !== null);
  if (conDato.length === 0) return null;
  return conDato.reduce((a, b) => {
    if (a.desdeAnio! !== b.desdeAnio!) return a.desdeAnio! < b.desdeAnio! ? a : b;
    return a.puestoCodigo <= b.puestoCodigo ? a : b;
  });
}
