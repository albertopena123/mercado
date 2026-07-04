import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { puestoCodigo, GIRO_LABEL } from "../src/lib/puestos/giro";
import { normalizeToken } from "../src/lib/socios/normalize";

// Backfill: reescribe Puesto.codigo al nuevo formato 'E{etapa}-{bloque}-{numero}'
// (sin la sub-fila vestigial, que siempre era 1) y recompone searchKey igual que
// buildSearchKey() del módulo de puestos. Idempotente: solo toca filas que cambian.
async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  try {
    const puestos = await prisma.puesto.findMany({
      select: {
        id: true,
        etapa: true,
        bloque: true,
        numero: true,
        giro: true,
        codigo: true,
        searchKey: true,
      },
    });

    let cambiados = 0;
    for (const p of puestos) {
      const nuevoCodigo = puestoCodigo(p.etapa, p.bloque, p.numero);
      const giroLabel = p.giro ? GIRO_LABEL[p.giro] : null;
      const nuevoSearchKey = [nuevoCodigo, p.bloque, giroLabel]
        .filter((x): x is string => Boolean(x))
        .map(normalizeToken)
        .join(" ");

      if (nuevoCodigo === p.codigo && nuevoSearchKey === p.searchKey) continue;

      await prisma.puesto.update({
        where: { id: p.id },
        data: { codigo: nuevoCodigo, searchKey: nuevoSearchKey },
      });
      cambiados++;
      console.log(`  ${p.codigo}  →  ${nuevoCodigo}`);
    }

    console.log(`\n✔ ${cambiados} puesto(s) actualizado(s) de ${puestos.length}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
