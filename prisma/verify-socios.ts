import "dotenv/config";
import assert from "node:assert/strict";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../src/generated/prisma/client";

async function main() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  });
  const prisma = new PrismaClient({ adapter });

  const stamp = Date.now().toString().slice(-7);
  const dni1 = "7" + stamp;

  console.log("→ Limpiando posibles socios de prueba previos…");
  await prisma.socio.deleteMany({
    where: {
      OR: [
        { numeroDocumento: dni1 },
        { codigo: "SOC-TEST00" },
      ],
    },
  });

  console.log("→ Crear socio 1");
  const last = await prisma.socio.findFirst({
    orderBy: { codigo: "desc" },
    select: { codigo: true },
  });
  const lastN = last ? parseInt(last.codigo.slice(4), 10) : 0;
  const codigo1 = `SOC-${String(lastN + 1).padStart(6, "0")}`;
  const socio1 = await prisma.socio.create({
    data: {
      codigo: codigo1,
      tipoDocumento: "DNI",
      numeroDocumento: dni1,
      apellidoPaterno: "TestPat",
      apellidoMaterno: "TestMat",
      nombres: "Uno",
      fechaIngreso: new Date(),
    },
  });
  assert.match(socio1.codigo, /^SOC-\d{6}$/);
  assert.equal(socio1.estado, "activo");
  console.log("  ✓ codigo =", socio1.codigo);

  console.log("→ Log inicial");
  await prisma.socioEstadoLog.create({
    data: {
      socioId: socio1.id,
      fromEstado: "activo",
      toEstado: "activo",
      motivo: "Alta del socio",
    },
  });

  console.log("→ DNI duplicado debe ser rechazado");
  let dup = false;
  try {
    await prisma.socio.create({
      data: {
        codigo: "SOC-DUP000",
        tipoDocumento: "DNI",
        numeroDocumento: dni1,
        apellidoPaterno: "Dup",
        nombres: "Test",
        fechaIngreso: new Date(),
      },
    });
  } catch (e) {
    dup = e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
  }
  assert.equal(dup, true, "duplicate DNI must be rejected by unique index");
  console.log("  ✓ duplicado rechazado");

  console.log("→ Cambio de estado + log atómico");
  await prisma.$transaction(async (tx) => {
    await tx.socio.update({
      where: { id: socio1.id },
      data: { estado: "suspendido" },
    });
    await tx.socioEstadoLog.create({
      data: {
        socioId: socio1.id,
        fromEstado: "activo",
        toEstado: "suspendido",
        motivo: "Test de verificación",
      },
    });
  });
  const logs = await prisma.socioEstadoLog.findMany({
    where: { socioId: socio1.id },
  });
  assert.ok(logs.length >= 2, "should have at least 2 log entries");
  console.log("  ✓ log con", logs.length, "entradas");

  console.log("→ Adjunto cascade en delete");
  const adj = await prisma.socioAdjunto.create({
    data: {
      socioId: socio1.id,
      tipo: "dni_scan",
      url: "/api/uploads/socios/" + socio1.id + "/test.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1234,
    },
  });
  assert.ok(adj.id, "adjunto created");

  await prisma.socio.delete({ where: { id: socio1.id } });
  const orphanLogs = await prisma.socioEstadoLog.count({
    where: { socioId: socio1.id },
  });
  const orphanAdj = await prisma.socioAdjunto.count({
    where: { socioId: socio1.id },
  });
  assert.equal(orphanLogs, 0, "log entries must cascade-delete with socio");
  assert.equal(orphanAdj, 0, "adjuntos must cascade-delete with socio");
  console.log("  ✓ cascade OK");

  console.log("\n✅ All padrón integrity tests pass.");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("✗", e);
  process.exit(1);
});
