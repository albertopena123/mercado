import type { BandaPuesto } from "@/generated/prisma/client";
import type { PlanoCell } from "@/app/(admin)/puestos/types";

// Orden vertical de las bandas dentro de un bloque (de arriba a abajo).
const BANDA_ORDER: BandaPuesto[] = ["alta", "media", "baja"];

export type PlanoBanda = { banda: BandaPuesto; cells: PlanoCell[] };
export type PlanoBloque = { bloque: string; bandas: PlanoBanda[] };
export type Plano = { bloques: PlanoBloque[] };

/**
 * Función pura: agrupa las celdas por bloque (orden configurable) y, dentro de
 * cada bloque, por banda (alta → media → baja), con los puestos ordenados por
 * número. Solo incluye bloques/bandas que tengan puestos (data-driven).
 */
export function armarPlano(
  cells: PlanoCell[],
  opts?: { orden?: "A-M" | "M-A" },
): Plano {
  const orden = opts?.orden ?? "A-M";
  const byBloque = new Map<string, PlanoCell[]>();
  for (const c of cells) {
    const arr = byBloque.get(c.bloque) ?? [];
    arr.push(c);
    byBloque.set(c.bloque, arr);
  }

  const bloques = [...byBloque.keys()].sort();
  if (orden === "M-A") bloques.reverse();

  return {
    bloques: bloques.map((bloque) => {
      const arr = byBloque.get(bloque)!;
      const bandas: PlanoBanda[] = BANDA_ORDER.map((banda) => ({
        banda,
        cells: arr
          .filter((c) => c.banda === banda)
          .sort((a, b) => a.numero - b.numero),
      })).filter((b) => b.cells.length > 0);
      return { bloque, bandas };
    }),
  };
}

/**
 * Reordena las celdas de una banda (ordenadas asc. por número) para que, al
 * pintarlas fila por fila en una grilla de `cols` columnas, los números queden
 * de ABAJO hacia ARRIBA (el #1 abajo, los más altos arriba) — como el plano
 * físico. Mantiene el orden ascendente dentro de cada fila.
 */
export function celdasBottomUp<T>(cells: T[], cols = 2): T[] {
  const filas: T[][] = [];
  for (let i = 0; i < cells.length; i += cols) filas.push(cells.slice(i, i + cols));
  filas.reverse();
  return filas.flat();
}
