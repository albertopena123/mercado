// Standalone integrity check for the /caja data layer.
// Exercises MovimientoCaja CRUD, el resumen por groupBy y el manejo de fechas
// (medianoche local) tal como lo hacen las server actions, sin pasar por Next.
// Crea y elimina sus propios datos; no toca movimientos reales.

import "dotenv/config";
import assert from "node:assert/strict";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const TAG = `VERIFY-CAJA-${Date.now()}`;

async function main() {
  console.log("→ Verificando capa de datos de Caja", TAG);

  // Crea un ingreso y un egreso con la misma lógica de fecha local que la action.
  const fechaLocal = new Date(`2026-06-14T00:00:00`);
  const ingreso = await prisma.movimientoCaja.create({
    data: {
      tipo: "ingreso",
      categoria: "cuota",
      monto: new Prisma.Decimal("150.50"),
      fecha: fechaLocal,
      concepto: `${TAG} ingreso`,
      metodoPago: "efectivo",
      comprobanteTipo: "ninguno",
      searchKey: TAG.toLowerCase(),
    },
  });
  const egreso = await prisma.movimientoCaja.create({
    data: {
      tipo: "egreso",
      categoria: "compra",
      monto: new Prisma.Decimal("80.00"),
      fecha: fechaLocal,
      concepto: `${TAG} egreso`,
      comprobanteTipo: "boleta",
      comprobanteNumero: "B001-1",
      searchKey: TAG.toLowerCase(),
    },
  });
  console.log("  ✓ create ingreso + egreso");

  // La fecha guardada, formateada en es-PE, debe seguir siendo el 14 (no el 13).
  const reload = await prisma.movimientoCaja.findUnique({
    where: { id: ingreso.id },
  });
  const dia = reload!.fecha.toLocaleDateString("es-PE", { day: "numeric" });
  assert.equal(dia, "14", `la fecha debe mostrarse como día 14, salió ${dia}`);
  console.log("  ✓ fecha local se mantiene en el día correcto");

  // Resumen por tipo/categoría como en getCajaStats.
  const grouped = await prisma.movimientoCaja.groupBy({
    by: ["tipo", "categoria"],
    where: { searchKey: TAG.toLowerCase() },
    _sum: { monto: true },
  });
  let ingresos = 0;
  let egresos = 0;
  for (const g of grouped) {
    const v = Number(g._sum.monto ?? 0);
    if (g.tipo === "ingreso") ingresos += v;
    else egresos += v;
  }
  assert.equal(ingresos, 150.5, "suma de ingresos");
  assert.equal(egresos, 80, "suma de egresos");
  assert.equal(
    Math.round((ingresos - egresos) * 100) / 100,
    70.5,
    "balance ingresos - egresos",
  );
  console.log("  ✓ groupBy calcula ingresos/egresos/balance");

  // Filtro de rango de fechas (incluye el 14, excluye días previos).
  const enRango = await prisma.movimientoCaja.count({
    where: {
      searchKey: TAG.toLowerCase(),
      fecha: {
        gte: new Date(`2026-06-14T00:00:00`),
        lte: new Date(`2026-06-14T23:59:59.999`),
      },
    },
  });
  assert.equal(enRango, 2, "ambos movimientos caen dentro del 14");
  const fueraRango = await prisma.movimientoCaja.count({
    where: {
      searchKey: TAG.toLowerCase(),
      fecha: { gte: new Date(`2026-06-15T00:00:00`) },
    },
  });
  assert.equal(fueraRango, 0, "ninguno cae el 15 o después");
  console.log("  ✓ filtro por rango de fechas");

  // Limpieza.
  await prisma.movimientoCaja.deleteMany({
    where: { searchKey: TAG.toLowerCase() },
  });
  const quedan = await prisma.movimientoCaja.count({
    where: { searchKey: TAG.toLowerCase() },
  });
  assert.equal(quedan, 0, "los movimientos de prueba se eliminaron");
  void egreso;
  console.log("  ✓ delete limpia los datos de prueba");

  console.log("\n✅ Todos los tests de integridad de Caja pasaron.");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("✗", e);
  await prisma.$disconnect();
  process.exit(1);
});
