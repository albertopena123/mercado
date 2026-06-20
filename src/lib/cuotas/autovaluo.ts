// Token único que define "autovalúo". Compartido por la detección (regex), la
// consulta de duplicados (Prisma `contains`) y, por convención, el predicado del
// índice único parcial (migración: concepto ILIKE '%autoval%'), para que las
// tres capas no se desincronicen. El acento de "autovalúo" va después de
// "autoval", así que el substring lo cubre.
export const AUTOVALUO_TOKEN = "autoval";

/**
 * Una cuota es de "autovalúo" cuando su concepto menciona el autovalúo (impuesto
 * predial). El padrón importado las nombra "Autovalúo 2018", "Autovalúo 2023",
 * etc. El autovalúo exige registrar el N.° de operación del recibo y ese número
 * NO puede reusarse en otro autovalúo (otro año/socio) — control antifraude.
 */
export function esAutovaluo(concepto: string | null | undefined): boolean {
  return new RegExp(AUTOVALUO_TOKEN, "i").test(concepto ?? "");
}

/**
 * Forma canónica del N.° de operación para el control de unicidad del autovalúo:
 * mayúsculas y sin espacios internos. Evita que el mismo recibo escrito como
 * "a-123", "A-123" o "A 123" se cuele como distinto y burle el control. Los
 * separadores (p. ej. "-") y los ceros a la izquierda se conservan: son parte
 * del número real y normalizarlos podría provocar falsos positivos.
 */
export function normalizaNroOperacion(s: string): string {
  return s.trim().toUpperCase().replace(/\s+/g, "");
}
