import "dotenv/config";
import assert from "node:assert/strict";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  const stamp = Date.now().toString().slice(-6);

  console.log("→ Preparar socios de prueba");
  const s1 = await prisma.socio.create({
    data: {
      codigo: `SOC-T${stamp}A`,
      tipoDocumento: "DNI",
      numeroDocumento: "9" + stamp + "1",
      apellidoPaterno: "TestA",
      nombres: "Uno",
      fechaIngreso: new Date(),
    },
  });
  const s2 = await prisma.socio.create({
    data: {
      codigo: `SOC-T${stamp}B`,
      tipoDocumento: "DNI",
      numeroDocumento: "9" + stamp + "2",
      apellidoPaterno: "TestB",
      nombres: "Dos",
      fechaIngreso: new Date(),
    },
  });

  console.log("→ Crear puesto");
  const p = await prisma.puesto.create({
    data: {
      codigo: `PT-${stamp}`,
      etapa: 2,
      bloque: "M",
      numero: Number(stamp),
      banda: "alta",
      dimension: "d3x5",
      estado: "vacio",
    },
  });

  console.log("→ Asignar a socio 1");
  await prisma.$transaction(async (tx) => {
    await tx.puestoAsignacion.updateMany({
      where: { puestoId: p.id, hasta: null },
      data: { hasta: new Date(), motivo: "Reasignación" },
    });
    await tx.puestoAsignacion.create({
      data: { puestoId: p.id, socioId: s1.id },
    });
    await tx.puesto.update({ where: { id: p.id }, data: { estado: "activo" } });
  });
  let vigentes = await prisma.puestoAsignacion.count({
    where: { puestoId: p.id, hasta: null },
  });
  assert.equal(vigentes, 1, "debe haber 1 asignación vigente");
  console.log("  ✓ 1 vigente tras primera asignación");

  console.log("→ Reasignar a socio 2 (debe cerrar la anterior)");
  await prisma.$transaction(async (tx) => {
    await tx.puestoAsignacion.updateMany({
      where: { puestoId: p.id, hasta: null },
      data: { hasta: new Date(), motivo: "Reasignación" },
    });
    await tx.puestoAsignacion.create({
      data: { puestoId: p.id, socioId: s2.id },
    });
  });
  vigentes = await prisma.puestoAsignacion.count({
    where: { puestoId: p.id, hasta: null },
  });
  assert.equal(vigentes, 1, "sigue habiendo solo 1 vigente");
  const total = await prisma.puestoAsignacion.count({
    where: { puestoId: p.id },
  });
  assert.equal(total, 2, "historial conserva 2 asignaciones");
  const vig = await prisma.puestoAsignacion.findFirst({
    where: { puestoId: p.id, hasta: null },
  });
  assert.equal(vig?.socioId, s2.id, "el vigente es el socio 2");
  console.log("  ✓ invariante 1-vigente + historial preservado");

  console.log("→ Delete del puesto cascadea asignaciones");
  await prisma.puesto.delete({ where: { id: p.id } });
  const orphan = await prisma.puestoAsignacion.count({
    where: { puestoId: p.id },
  });
  assert.equal(orphan, 0, "asignaciones deben cascadear");
  console.log("  ✓ cascade OK");

  // limpieza
  await prisma.socio.deleteMany({
    where: { id: { in: [s1.id, s2.id] } },
  });

  console.log("\n✅ verify-puestos OK.");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("✗", e);
  process.exit(1);
});
