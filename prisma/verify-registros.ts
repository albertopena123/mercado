import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

// Verifica el modelo SolicitudRegistroPublico (formulario público) y su
// invariante de integridad: como máximo UNA solicitud pendiente por DNI
// (garantizada por el índice parcial único). No siembra datos; solo lee.
async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    const total = await prisma.solicitudRegistroPublico.count();
    const pendientes = await prisma.solicitudRegistroPublico.count({
      where: { estado: "pendiente" },
    });
    console.log(`→ Registros públicos: ${total} total, ${pendientes} pendientes`);

    const grupos = await prisma.solicitudRegistroPublico.groupBy({
      by: ["numeroDocumento"],
      where: { estado: "pendiente" },
      _count: { _all: true },
    });
    const violaciones = grupos.filter((g) => g._count._all > 1);
    if (violaciones.length > 0) {
      console.error("✗ DNIs con más de un registro pendiente:", violaciones);
      process.exitCode = 1;
    } else {
      console.log("✓ Máximo 1 registro pendiente por DNI");
    }

    const idx = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'SolicitudRegistroPublico'
        AND indexname = 'RegistroPublico_unico_pendiente_por_doc'
    `;
    if (idx.length === 1) {
      console.log("✓ Índice parcial único presente:", idx[0].indexname);
    } else {
      console.error("✗ Falta el índice parcial único de unicidad de pendientes");
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
