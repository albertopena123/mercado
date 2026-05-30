import "dotenv/config";
import assert from "node:assert/strict";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  const stamp = Date.now().toString().slice(-6);

  const s = await prisma.socio.create({
    data: {
      codigo: `SOC-C${stamp}`,
      tipoDocumento: "DNI",
      numeroDocumento: "7" + stamp + "0",
      apellidoPaterno: "CuotaTest",
      nombres: "Uno",
      fechaIngreso: new Date(),
      estado: "activo",
    },
  });

  console.log("→ Generar cuota");
  await prisma.cuota.create({
    data: { socioId: s.id, periodo: "2026-05", concepto: "Test", monto: 20 },
  });

  console.log("→ Deuda inicial = 20");
  let pend = await prisma.cuota.findMany({
    where: { socioId: s.id, estado: "pendiente" },
  });
  let deuda = pend.reduce((a, c) => a + Number(c.monto), 0);
  assert.equal(deuda, 20, "deuda inicial debe ser 20");
  console.log("  ✓ deuda = S/", deuda);

  console.log("→ Unicidad (socio, periodo, concepto)");
  let dup = false;
  try {
    await prisma.cuota.create({
      data: { socioId: s.id, periodo: "2026-05", concepto: "Test", monto: 20 },
    });
  } catch {
    dup = true;
  }
  assert.equal(dup, true, "no se permite cuota duplicada");
  console.log("  ✓ duplicado rechazado");

  console.log("→ Registrar pago → deuda = 0");
  await prisma.cuota.updateMany({
    where: { socioId: s.id, estado: "pendiente" },
    data: { estado: "pagada", pagadoEn: new Date(), pagadoMonto: 20 },
  });
  pend = await prisma.cuota.findMany({
    where: { socioId: s.id, estado: "pendiente" },
  });
  deuda = pend.reduce((a, c) => a + Number(c.monto), 0);
  assert.equal(deuda, 0, "tras pagar, deuda = 0");
  console.log("  ✓ deuda tras pago = S/", deuda);

  console.log("→ Delete socio cascadea cuotas");
  await prisma.socio.delete({ where: { id: s.id } });
  const orphan = await prisma.cuota.count({ where: { socioId: s.id } });
  assert.equal(orphan, 0, "cuotas deben cascadear");
  console.log("  ✓ cascade OK");

  console.log("\n✅ verify-cuotas OK.");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("✗", e);
  process.exit(1);
});
