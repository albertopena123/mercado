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
 * Reordena las celdas de una banda (ordenadas asc. por número) en SERPENTINA,
 * como el plano físico (2 columnas): la columna izquierda sube de abajo hacia
 * arriba (1·2·3·4, con el #1 abajo) y luego continúa por la columna derecha de
 * arriba hacia abajo (5·6·7·8). Devuelve el arreglo en orden de pintado fila a
 * fila (auto-flow row), p. ej. [4,5, 3,6, 2,7, 1,8].
 */
export function celdasSerpiente<T>(cells: T[]): T[] {
  const n = cells.length;
  const rows = Math.ceil(n / 2);
  const izq = cells.slice(0, rows); // columna izquierda (se pinta abajo→arriba)
  const der = cells.slice(rows); // columna derecha (se pinta arriba→abajo)
  const out: T[] = [];
  for (let r = 0; r < rows; r++) {
    out.push(izq[rows - 1 - r]); // izquierda, de abajo hacia arriba
    const d = der[r]; // derecha, de arriba hacia abajo
    if (d !== undefined) out.push(d);
  }
  return out;
}
