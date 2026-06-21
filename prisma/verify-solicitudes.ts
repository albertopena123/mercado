import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

// Verifica el modelo SolicitudActualizacionDatos y su invariante de integridad:
// como máximo UNA solicitud pendiente por socio (garantizada por el índice
// parcial único). No siembra datos; solo lee el estado actual.
async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    const total = await prisma.solicitudActualizacionDatos.count();
    const pendientes = await prisma.solicitudActualizacionDatos.count({
      where: { estado: "pendiente" },
    });
    console.log(`→ Solicitudes: ${total} total, ${pendientes} pendientes`);

    // Invariante de app: ≤ 1 pendiente por socio.
    const grupos = await prisma.solicitudActualizacionDatos.groupBy({
      by: ["socioId"],
      where: { estado: "pendiente" },
      _count: { _all: true },
    });
    const violaciones = grupos.filter((g) => g._count._all > 1);
    if (violaciones.length > 0) {
      console.error("✗ Socios con más de una solicitud pendiente:", violaciones);
      process.exitCode = 1;
    } else {
      console.log("✓ Máximo 1 solicitud pendiente por socio");
    }

    // Verifica que el índice parcial único exista a nivel de BD.
    const idx = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'SolicitudActualizacionDatos'
        AND indexname = 'SolicitudActualizacion_unica_pendiente_por_socio'
    `;
    if (idx.length === 1) {
      console.log("✓ Índice parcial único presente:", idx[0].indexname);
    } else {
      console.error("✗ Falta el índice parcial único de unicidad de pendientes");
      process.exitCode = 1;
    }
  } finally {
    // El cliente con adapter-pg no necesita $disconnect explícito, pero lo
    // llamamos por consistencia con los demás verify-*.
    await prisma.$disconnect().catch(() => {});
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
