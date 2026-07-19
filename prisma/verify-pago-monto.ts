import "dotenv/config";
import assert from "node:assert/strict";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

// Replica del algoritmo de pagarPorMonto para validar el comportamiento contra
// la BD real (sin pasar por el server / sesión). No se maneja saldo a favor: el
// monto debe saldar cuotas COMPLETAS; si sobra dinero, el pago se rechaza y la
// transacción no toca ninguna cuota.
class SobraError extends Error {}

async function pagar(prisma: PrismaClient, socioId: string, monto: number) {
  return prisma.$transaction(async (tx) => {
    let pozo = monto;
    const pend = await tx.cuota.findMany({
      where: { socioId, estado: "pendiente" },
      orderBy: [{ periodo: "asc" }],
      select: { id: true, monto: true },
    });
    let pagadas = 0;
    for (const c of pend) {
      const m = Number(c.monto);
      if (pozo + 1e-9 >= m) {
        await tx.cuota.update({
          where: { id: c.id },
          data: { estado: "pagada", pagadoEn: new Date(), pagadoMonto: m },
        });
        pozo = Math.round((pozo - m) * 100) / 100;
        pagadas++;
      } else break;
    }
    if (pozo > 0.0001)
      throw new SobraError(`sobra S/${pozo.toFixed(2)} (no se maneja saldo a favor)`);
    return { pagadas };
  });
}

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  const stamp = Date.now().toString().slice(-6);

  const s = await prisma.socio.create({
    data: {
      codigo: `SOC-PM${stamp}`,
      tipoDocumento: "DNI",
      numeroDocumento: "6" + stamp + "0",
      apellidoPaterno: "PagoMonto",
      nombres: "Test",
      fechaIngreso: new Date(),
      estado: "activo",
    },
  });

  console.log("→ 12 cuotas de S/20 (ene–dic 2026)");
  await prisma.cuota.createMany({
    data: Array.from({ length: 12 }, (_, i) => ({
      socioId: s.id,
      periodo: `2026-${String(i + 1).padStart(2, "0")}`,
      concepto: "Test",
      monto: 20,
    })),
  });

  console.log("→ Pagar S/200 → 10 cuotas exactas (sin sobra)");
  let r = await pagar(prisma, s.id, 200);
  assert.equal(r.pagadas, 10, "200/20 = 10 cuotas");
  let pend = await prisma.cuota.count({ where: { socioId: s.id, estado: "pendiente" } });
  assert.equal(pend, 2, "quedan 2 pendientes");
  console.log(`  ✓ pagadas=${r.pagadas}, pendientes=${pend}`);

  console.log("→ Pagar S/50 → sobran S/10 → RECHAZO, nada cambia");
  await assert.rejects(
    () => pagar(prisma, s.id, 50),
    (e) => e instanceof SobraError,
    "un monto con sobrante debe rechazarse",
  );
  pend = await prisma.cuota.count({ where: { socioId: s.id, estado: "pendiente" } });
  assert.equal(pend, 2, "el rechazo revierte la tx: siguen 2 pendientes");
  console.log(`  ✓ rechazado, pendientes intactas=${pend}`);

  console.log("→ Pagar S/40 → 2 cuotas exactas → sin pendientes");
  r = await pagar(prisma, s.id, 40);
  assert.equal(r.pagadas, 2, "40 cubre las 2 cuotas restantes");
  pend = await prisma.cuota.count({ where: { socioId: s.id, estado: "pendiente" } });
  assert.equal(pend, 0, "sin pendientes");
  console.log(`  ✓ pagadas=${r.pagadas}, pendientes=${pend}`);

  await prisma.cuota.deleteMany({ where: { socioId: s.id } });
  await prisma.socio.delete({ where: { id: s.id } });
  console.log("\n✅ verify-pago-monto OK.");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("✗", e);
  process.exit(1);
});
