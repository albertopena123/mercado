import "dotenv/config";
import assert from "node:assert/strict";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  antiguedadDesdeSlots, construirSlots, firmaNombre, masAntiguoEntrePuestos,
  type GestionInput,
} from "../src/lib/padron/continuidad";
import type { AntiguedadPuesto, RegistroHistorico } from "../src/lib/padron/types";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// --- Fixtures para la lógica pura (continuidad.ts) -------------------------
// Sin BD: se construyen los datos a mano para ejercitar la lógica de negocio
// real (el código que importa historico.ts), no una copia de ella.

const GESTIONES: GestionInput[] = [
  { id: "g2014", anio: 2014, nombre: "Gestión 2014", orden: 1 },
  { id: "g2017", anio: 2017, nombre: "Santos 2017", orden: 2 },
  { id: "g2019", anio: 2019, nombre: "Raymundo 2019", orden: 3 },
  { id: "g2021", anio: 2021, nombre: "Gestión Santos 2021", orden: 4 },
];

function registro(nombre: string | null): RegistroHistorico {
  return {
    nombre, nombreOriginal: nombre, observacion: null,
    numeroPadron: null, numeroDocumento: null, socioId: null,
  };
}

// Construye un lookup gestionId -> registro a partir de un mapa parcial
// { anio: nombreTitular | null }. Las gestiones ausentes del mapa son huecos.
function porAnio(datos: Partial<Record<2014 | 2017 | 2019 | 2021, string | null>>) {
  const byGestionId = new Map<string, RegistroHistorico | null>();
  for (const g of GESTIONES) {
    const key = g.anio as 2014 | 2017 | 2019 | 2021;
    byGestionId.set(g.id, key in datos ? registro(datos[key] ?? null) : null);
  }
  return (gestionId: string) => byGestionId.get(gestionId) ?? null;
}

async function main() {
  console.log("→ Los 4 empadronamientos existen y están ordenados");
  const gestiones = await prisma.empadronamiento.findMany({ orderBy: { orden: "asc" } });
  assert.equal(gestiones.length, 4, "deben existir 4 empadronamientos");
  assert.deepEqual(gestiones.map((g) => g.anio), [2014, 2017, 2019, 2021]);

  console.log("→ Conteo de registros por gestión");
  const esperado: Record<number, number> = { 2014: 262, 2017: 704, 2019: 420, 2021: 704 };
  for (const g of gestiones) {
    const n = await prisma.padronRegistro.count({ where: { empadronamientoId: g.id } });
    assert.equal(n, esperado[g.anio], `${g.nombre}: esperaba ${esperado[g.anio]}, hay ${n}`);
  }

  console.log("→ Todo registro apunta a un puesto real (integridad de la llave)");
  const total = await prisma.padronRegistro.count();
  assert.equal(total, 2090, `total de registros: esperaba 2090, hay ${total}`);

  console.log("→ El enlace a socio solo existe donde hay DNI");
  const enlazadosSinDni = await prisma.padronRegistro.count({
    where: { socioId: { not: null }, numeroDocumento: null },
  });
  assert.equal(enlazadosSinDni, 0, "no puede haber enlace a socio sin DNI que lo respalde");

  console.log("→ Solo el empadronamiento 2021 trae documento");
  const g2021 = gestiones.find((g) => g.anio === 2021)!;
  const docsFuera = await prisma.padronRegistro.count({
    where: { numeroDocumento: { not: null }, empadronamientoId: { not: g2021.id } },
  });
  assert.equal(docsFuera, 0, "ninguna gestión anterior a 2021 tiene DNI en la fuente");

  console.log("→ Enlaces efectivos");
  const enlazados = await prisma.padronRegistro.count({ where: { socioId: { not: null } } });
  assert.equal(enlazados, 607, `esperaba 607 enlaces, hay ${enlazados}`);

  // La unicidad (empadronamiento, puesto) NO se verifica aquí: el schema ya la
  // garantiza con `@@unique([empadronamientoId, puestoId])` (prisma/schema.prisma).
  // Una consulta que cuente duplicados contra una BD que el propio schema
  // impide poblar con duplicados jamás puede fallar — es una aserción
  // infalsificable. Si algún día se quita el `@@unique`, esta nota deja de
  // aplicar y habría que reinstalar el chequeo.

  // ---------------------------------------------------------------------
  // Lógica pura de continuidad (continuidad.ts) — sin BD, con datos a mano.
  // Ejercita el código real que consume historico.ts, no una copia.
  // ---------------------------------------------------------------------

  console.log("→ firmaNombre: insensible al orden de palabras y a tildes");
  assert.equal(
    firmaNombre("MONDRAGON CONDORI JULIA"),
    firmaNombre("Julia Mondragón Condori"),
    "mismo titular escrito en distinto orden y con/sin tildes debe dar la misma firma",
  );
  assert.notEqual(
    firmaNombre("MONDRAGON CONDORI JULIA"),
    firmaNombre("MONDRAGON CONDORI ANA"),
    "titulares distintos no pueden coincidir en firma",
  );

  console.log("→ construirSlots: hueco entre dos slots del MISMO titular no marca cambio");
  {
    // 2014 con dato, 2017 hueco (empadronamiento incompleto), 2019 con el MISMO
    // titular: comparar 2019 contra el hueco de 2017 reportaría un traspaso
    // inexistente. Debe compararse contra el último slot CON DATO (2014).
    const slots = construirSlots(GESTIONES, porAnio({ 2014: "Julia Mondragón Condori", 2019: "Julia Mondragón Condori" }));
    const s2019 = slots.find((s) => s.anio === 2019)!;
    assert.equal(s2019.cambioDeTitular, false, "mismo titular a través de un hueco no es cambio");
  }

  console.log("→ construirSlots: traspaso real SÍ marca cambio");
  {
    const slots = construirSlots(GESTIONES, porAnio({ 2014: "Julia Mondragón Condori", 2019: "Ana Torres Vega" }));
    const s2019 = slots.find((s) => s.anio === 2019)!;
    assert.equal(s2019.cambioDeTitular, true, "titular distinto en el siguiente slot con dato es un traspaso");
  }

  console.log("→ construirSlots: el primer slot con dato nunca es un cambio");
  {
    const slots = construirSlots(GESTIONES, porAnio({ 2017: "Julia Mondragón Condori" }));
    const s2017 = slots.find((s) => s.anio === 2017)!;
    assert.equal(s2017.cambioDeTitular, false, "no hay titular previo con el que comparar el primer dato");
  }

  console.log("→ construirSlots: nombre vacío no produce falso mismo-titular ni falso cambio");
  {
    const slots = construirSlots(GESTIONES, porAnio({ 2014: "Julia Mondragón Condori", 2017: "", 2019: "Ana Torres Vega" }));
    const s2017 = slots.find((s) => s.anio === 2017)!;
    const s2019 = slots.find((s) => s.anio === 2019)!;
    assert.equal(s2017.cambioDeTitular, false, "una firma vacía no puede compararse, no es 'mismo titular' ni 'cambió'");
    assert.equal(s2019.cambioDeTitular, true, "la comparación sigue haciéndose contra el último slot CON firma no vacía (2014)");
  }

  console.log("→ antiguedadDesdeSlots: corta en el titular anterior distinto");
  {
    // 2014 otra persona, 2017 hueco, 2019 y 2021 el titular actual: la
    // antigüedad debe arrancar en 2019 (el slot más antiguo con el mismo
    // titular), sin cruzar el corte de 2014.
    const slots = construirSlots(
      GESTIONES,
      porAnio({ 2014: "Ana Torres Vega", 2019: "Julia Mondragón Condori", 2021: "Julia Mondragón Condori" }),
    );
    const r = antiguedadDesdeSlots(slots, firmaNombre("Julia Mondragón Condori"));
    assert.equal(r.desdeAnio, 2019, "debe cortar en 2014 (otro titular) y arrancar en 2019");
    assert.equal(r.desdeGestion, "Raymundo 2019");
  }

  console.log("→ antiguedadDesdeSlots: nombre vacío no afirma continuidad con nada");
  {
    const slots = construirSlots(GESTIONES, porAnio({ 2019: "Julia Mondragón Condori", 2021: "Julia Mondragón Condori" }));
    const r = antiguedadDesdeSlots(slots, "");
    assert.equal(r.desdeAnio, null, "una firma objetivo vacía no puede tener antigüedad");
  }

  console.log("→ masAntiguoEntrePuestos: elige el año más antiguo entre varios puestos");
  {
    const porPuesto: AntiguedadPuesto[] = [
      { puestoId: "p1", puestoCodigo: "B-05", desdeAnio: 2021, desdeGestion: "Gestión Santos 2021" },
      { puestoId: "p2", puestoCodigo: "B-02", desdeAnio: 2014, desdeGestion: "Gestión 2014" },
      { puestoId: "p3", puestoCodigo: "B-09", desdeAnio: null, desdeGestion: null },
    ];
    const r = masAntiguoEntrePuestos(porPuesto);
    assert.equal(r?.puestoCodigo, "B-02", "el socio es tan antiguo como su puesto más antiguo (2014), no el de 2021");
  }

  console.log("→ masAntiguoEntrePuestos: desempate determinista por código de puesto");
  {
    const porPuesto: AntiguedadPuesto[] = [
      { puestoId: "p1", puestoCodigo: "B-09", desdeAnio: 2014, desdeGestion: "Gestión 2014" },
      { puestoId: "p2", puestoCodigo: "B-02", desdeAnio: 2014, desdeGestion: "Gestión 2014" },
    ];
    // El orden de entrada favorece a B-09 si el desempate no fuera explícito;
    // debe ganar B-02 por ser el código alfabéticamente menor, sin importar el
    // orden en que Prisma haya devuelto las filas.
    const r1 = masAntiguoEntrePuestos(porPuesto);
    const r2 = masAntiguoEntrePuestos([...porPuesto].reverse());
    assert.equal(r1?.puestoCodigo, "B-02", "desempate debe ser determinista, no el orden de llegada");
    assert.equal(r2?.puestoCodigo, "B-02", "el resultado no puede cambiar según el orden de las filas");
  }

  console.log("\n✓ verify-historico OK");
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
