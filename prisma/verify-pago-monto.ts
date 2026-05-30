import "dotenv/config";
import assert from "node:assert/strict";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

// Replica del algoritmo de pagarPorMonto para validar el comportamiento
// contra la BD real (sin pasar por el server / sesión).
async function pagar(prisma: PrismaClient, socioId: string, monto: number) {
  return prisma.$transaction(async (tx) => {
    const socio = await tx.socio.findUnique({
      where: { id: socioId },
      select: { saldoAFavor: true },
    });
    let pozo = Number(socio!.saldoAFavor) + monto;
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
    await tx.socio.update({ where: { id: socioId }, data: { saldoAFavor: pozo } });
    return { pagadas, saldoAFavor: pozo };
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

  console.log("→ Pagar S/200 → 10 cuotas, saldo 0");
  let r = await pagar(prisma, s.id, 200);
  assert.equal(r.pagadas, 10, "200/20 = 10 cuotas");
  assert.equal(r.saldoAFavor, 0, "saldo 0");
  let pend = await prisma.cuota.count({ where: { socioId: s.id, estado: "pendiente" } });
  assert.equal(pend, 2, "quedan 2 pendientes");
  console.log(`  ✓ pagadas=${r.pagadas}, pendientes=${pend}, saldo=S/${r.saldoAFavor}`);

  console.log("→ Pagar S/50 → 2 cuotas (40), saldo 10");
  r = await pagar(prisma, s.id, 50);
  assert.equal(r.pagadas, 2, "50 cubre 2 cuotas de 20");
  assert.equal(r.saldoAFavor, 10, "sobra 10 → saldo a favor");
  pend = await prisma.cuota.count({ where: { socioId: s.id, estado: "pendiente" } });
  assert.equal(pend, 0, "sin pendientes");
  console.log(`  ✓ pagadas=${r.pagadas}, pendientes=${pend}, saldo=S/${r.saldoAFavor}`);

  console.log("→ Nueva cuota + pagar S/10 (usa saldo 10 + 10 = 20) → 1 cuota");
  await prisma.cuota.create({
    data: { socioId: s.id, periodo: "2027-01", concepto: "Test", monto: 20 },
  });
  r = await pagar(prisma, s.id, 10);
  assert.equal(r.pagadas, 1, "saldo 10 + 10 = 20 cubre 1 cuota");
  assert.equal(r.saldoAFavor, 0, "saldo consumido");
  console.log(`  ✓ pagadas=${r.pagadas}, saldo=S/${r.saldoAFavor}`);

  await prisma.socio.delete({ where: { id: s.id } });
  console.log("\n✅ verify-pago-monto OK.");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("✗", e);
  process.exit(1);
});
