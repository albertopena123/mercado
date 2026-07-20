import "dotenv/config";
import assert from "node:assert/strict";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

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

  console.log("→ Unicidad (empadronamiento, puesto)");
  const dup = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*)::bigint AS n FROM (
      SELECT "empadronamientoId", "puestoId"
      FROM "PadronRegistro" GROUP BY 1,2 HAVING COUNT(*) > 1
    ) t`;
  assert.equal(Number(dup[0].n), 0, "hay pares (empadronamiento, puesto) duplicados");

  console.log("\n✓ verify-historico OK");
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
