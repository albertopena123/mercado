// Integridad de la capa de datos del módulo Personal (empleados).
// Crea y elimina sus propios datos; no toca registros reales.
import "dotenv/config";
import assert from "node:assert/strict";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../src/generated/prisma/client";
import { nextCodigoEmpleado } from "../src/lib/empleados/codigo";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const dni = "8" + Date.now().toString().slice(-7);
  console.log("→ Limpiando posibles datos de prueba previos…");
  await prisma.empleado.deleteMany({ where: { numeroDocumento: dni } });

  console.log("→ Crear empleado");
  const last = await prisma.empleado.findFirst({
    orderBy: { codigo: "desc" },
    select: { codigo: true },
  });
  const codigo = nextCodigoEmpleado(last?.codigo ?? null);
  const emp = await prisma.empleado.create({
    data: {
      codigo,
      tipoDocumento: "DNI",
      numeroDocumento: dni,
      apellidoPaterno: "TestEmp",
      nombres: "Uno",
      cargo: "seguridad",
      fechaIngreso: new Date("2026-06-01T00:00:00.000Z"),
      salario: new Prisma.Decimal("1200.00"),
      searchKey: "testemp uno seguridad",
    },
  });
  assert.match(emp.codigo, /^EMP-\d{6}$/, "código EMP-NNNNNN");
  assert.equal(emp.estado, "activo");
  console.log("  ✓ código =", emp.codigo);

  console.log("→ Documento duplicado rechazado");
  let dup = false;
  try {
    await prisma.empleado.create({
      data: {
        codigo: codigo + "X",
        tipoDocumento: "DNI",
        numeroDocumento: dni,
        apellidoPaterno: "Dup",
        nombres: "Test",
        cargo: "otro",
        fechaIngreso: new Date(),
      },
    });
  } catch (e) {
    dup = e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
  }
  assert.equal(dup, true, "documento duplicado rechazado por unique");
  console.log("  ✓ duplicado rechazado");

  console.log("→ Cese: estado inactivo + fechaCese");
  await prisma.empleado.update({
    where: { id: emp.id },
    data: { estado: "inactivo", fechaCese: new Date("2026-06-14T00:00:00.000Z") },
  });
  const cesado = await prisma.empleado.findUnique({ where: { id: emp.id } });
  assert.equal(cesado?.estado, "inactivo");
  assert.ok(cesado?.fechaCese, "fechaCese guardada");
  console.log("  ✓ cese registrado");

  console.log("→ Adjunto (CV) cascade en delete");
  const adj = await prisma.empleadoAdjunto.create({
    data: {
      empleadoId: emp.id,
      tipo: "cv",
      url: "/api/uploads/empleados/" + emp.id + "/cv.pdf",
      mimeType: "application/pdf",
      sizeBytes: 2048,
    },
  });
  assert.ok(adj.id, "adjunto creado");
  await prisma.empleado.delete({ where: { id: emp.id } });
  const orphan = await prisma.empleadoAdjunto.count({ where: { empleadoId: emp.id } });
  assert.equal(orphan, 0, "adjuntos deben cascadear con el empleado");
  console.log("  ✓ cascade OK");

  console.log("\n✅ verify-empleados OK.");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("✗", e);
  await prisma.$disconnect();
  process.exit(1);
});
