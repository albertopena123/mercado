import "server-only";
import { prisma } from "@/lib/prisma";
import type { CargoDirectivo } from "@/generated/prisma/client";

// Firmas del Consejo Directivo vigente, por cargo, para renderizar en documentos.
export type FirmasConsejo = {
  presidente: string | null;
  tesorero: string | null;
  secretario: string | null;
};

const CARGOS: CargoDirectivo[] = ["presidente", "tesorero", "secretario"];

// Devuelve la URL de firma del titular vigente (hasta = null) de cada cargo del
// Consejo Directivo. null si el cargo está vacante o su titular no tiene firma.
export async function resolveFirmasConsejo(): Promise<FirmasConsejo> {
  const rows = await prisma.directivo.findMany({
    where: {
      organo: "consejo_directivo",
      cargo: { in: CARGOS },
      hasta: null,
      firmaUrl: { not: null },
    },
    select: { cargo: true, firmaUrl: true },
  });
  const out: FirmasConsejo = {
    presidente: null,
    tesorero: null,
    secretario: null,
  };
  for (const r of rows) {
    if (r.cargo === "presidente") out.presidente = r.firmaUrl;
    else if (r.cargo === "tesorero") out.tesorero = r.firmaUrl;
    else if (r.cargo === "secretario") out.secretario = r.firmaUrl;
  }
  return out;
}
