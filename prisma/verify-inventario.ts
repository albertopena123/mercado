// Verificación rápida del módulo de inventario: cuenta bienes, suma unidades y
// agrupa por ubicación/estado (las mismas consultas que usa la página).
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const total = await prisma.bien.count();
  const sum = await prisma.bien.aggregate({ _sum: { cantidad: true } });
  const porUbic = await prisma.bien.groupBy({
    by: ["ubicacion"],
    _count: { _all: true },
  });
  const porEstado = await prisma.bien.groupBy({
    by: ["estado"],
    _count: { _all: true },
  });
  const movs = await prisma.movimientoBien.count();

  console.log("═══════ VERIFICACIÓN INVENTARIO ═══════");
  console.log(`Bienes:        ${total}`);
  console.log(`Unidades (Σ):  ${sum._sum.cantidad ?? 0}`);
  console.log(`Movimientos:   ${movs}`);
  console.log(
    "Por ubicación: " +
      porUbic.map((g) => `${g.ubicacion}=${g._count._all}`).join("  "),
  );
  console.log(
    "Por estado:    " +
      porEstado.map((g) => `${g.estado}=${g._count._all}`).join("  "),
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
