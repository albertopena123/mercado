import type {
  Giro,
  BandaPuesto,
  DimensionPuesto,
} from "@/generated/prisma/client";

// Catálogo de giros (rubros) con etiqueta y color para la leyenda del plano.
export const GIRO_LABEL: Record<Giro, string> = {
  verduras: "Verduras",
  abarrotes: "Abarrotes",
  carnes: "Carnes",
  pescados: "Pescados",
  comidas: "Comidas",
  ropa: "Ropa",
  calzado: "Calzado",
  ferreteria: "Ferretería",
  productos_region: "Productos de la región",
  juguetes: "Juguetes",
  flores_plantas: "Flores y plantas",
  otros: "Otros",
};

export const GIRO_COLOR: Record<Giro, string> = {
  verduras: "#16a34a",
  abarrotes: "#f59e0b",
  carnes: "#dc2626",
  pescados: "#0ea5e9",
  comidas: "#ea580c",
  ropa: "#7c3aed",
  calzado: "#4f46e5",
  ferreteria: "#6b7280",
  productos_region: "#0d9488",
  juguetes: "#db2777",
  flores_plantas: "#65a30d",
  otros: "#94a3b8",
};

export const GIROS = Object.keys(GIRO_LABEL) as Giro[];

export const BANDA_LABEL: Record<BandaPuesto, string> = {
  alta: "Banda alta",
  media: "Banda media",
  baja: "Banda baja",
};

export const DIMENSION_LABEL: Record<DimensionPuesto, string> = {
  d3x5: "3×5 m",
  d3x3: "3×3 m",
};

export const BLOQUES = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M"];
export const ETAPAS = [1, 2];

// 3 bandas de 8 puestos = 24 por bloque, continuo de abajo (junto al SS-HH)
// hacia arriba:
//   abajo  → banda "baja"  : 1–8   (3×5)
//   medio  → banda "media" : 9–16  (3×3)
//   arriba → banda "alta"  : 17–24 (3×5)
export function bandaPorNumero(n: number): BandaPuesto {
  if (n <= 8) return "baja";
  if (n <= 16) return "media";
  return "alta";
}

export function dimensionPorBanda(b: BandaPuesto): DimensionPuesto {
  return b === "media" ? "d3x3" : "d3x5";
}

export function puestoCodigo(
  etapa: number,
  bloque: string,
  numero: number,
): string {
  return `E${etapa}-${bloque.toUpperCase()}-${numero}`;
}
