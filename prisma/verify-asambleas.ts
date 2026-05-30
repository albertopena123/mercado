import "dotenv/config";
import assert from "node:assert/strict";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  const stamp = Date.now().toString().slice(-6);

  console.log("→ Socios de prueba (2 activos)");
  const s1 = await prisma.socio.create({
    data: {
      codigo: `SOC-A${stamp}A`,
      tipoDocumento: "DNI",
      numeroDocumento: "8" + stamp + "1",
      apellidoPaterno: "AsmA",
      nombres: "Uno",
      fechaIngreso: new Date(),
      estado: "activo",
    },
  });
  const s2 = await prisma.socio.create({
    data: {
      codigo: `SOC-A${stamp}B`,
      tipoDocumento: "DNI",
      numeroDocumento: "8" + stamp + "2",
      apellidoPaterno: "AsmB",
      nombres: "Dos",
      fechaIngreso: new Date(),
      estado: "activo",
    },
  });

  console.log("→ Crear asamblea + generar lista de activos");
  const activos = await prisma.socio.findMany({
    where: { estado: "activo" },
    select: { id: true },
  });
  const asamblea = await prisma.$transaction(async (tx) => {
    const a = await tx.asamblea.create({
      data: { titulo: `Test ${stamp}`, tipo: "ordinaria", fecha: new Date(), quorumMinimo: 50 },
    });
    await tx.asistencia.createMany({
      data: activos.map((s) => ({
        asambleaId: a.id,
        socioId: s.id,
        estado: "ausente" as const,
      })),
    });
    return a;
  });
  const generated = await prisma.asistencia.count({
    where: { asambleaId: asamblea.id },
  });
  assert.ok(generated >= 2, "lista incluye al menos los 2 socios de prueba");
  console.log(`  ✓ ${generated} filas de asistencia generadas`);

  console.log("→ Unicidad (asambleaId, socioId)");
  let dup = false;
  try {
    await prisma.asistencia.create({
      data: { asambleaId: asamblea.id, socioId: s1.id, estado: "presente" },
    });
  } catch {
    dup = true;
  }
  assert.equal(dup, true, "no se permite asistencia duplicada");
  console.log("  ✓ duplicado rechazado");

  console.log("→ Marcar y calcular quórum");
  await prisma.asistencia.updateMany({
    where: { asambleaId: asamblea.id, socioId: { in: [s1.id, s2.id] } },
    data: { estado: "presente" },
  });
  const asistencias = await prisma.asistencia.findMany({
    where: { asambleaId: asamblea.id },
  });
  const asistieron = asistencias.filter(
    (a) => a.estado === "presente" || a.estado === "tardanza",
  ).length;
  const pct = Math.round((asistieron / asistencias.length) * 100);
  console.log(`  ✓ quórum = ${pct}% (${asistieron}/${asistencias.length})`);
  assert.ok(pct > 0, "quórum calculado");

  console.log("→ Delete asamblea cascadea asistencias");
  await prisma.asamblea.delete({ where: { id: asamblea.id } });
  const orphan = await prisma.asistencia.count({
    where: { asambleaId: asamblea.id },
  });
  assert.equal(orphan, 0, "asistencias deben cascadear");
  console.log("  ✓ cascade OK");

  await prisma.socio.deleteMany({ where: { id: { in: [s1.id, s2.id] } } });

  console.log("\n✅ verify-asambleas OK.");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("✗", e);
  process.exit(1);
});
