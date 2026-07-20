// Parseo puro de la celda de nombre del padrón histórico. SIN `server-only`,
// SIN Prisma, SIN I/O — igual que continuidad.ts, y por la misma razón: vive
// separado de prisma/import-historico.ts para que prisma/verify-historico.ts
// pueda probar el código REAL con datos a mano, sin arrastrar el efecto
// secundario de importar un script que ejecuta `main()` al cargarse.

// Separa "APELLIDOS NOMBRES (vendido 2023)" en nombre limpio + anotación. El
// paréntesis puede estar en cualquier posición, no solo al final ("...(96)
// vendio", "...(debe terreno) PASA A DEPURAR"): el nombre es SOLO lo previo al
// primer "(", y tanto el contenido del paréntesis como cualquier texto
// posterior (incluido un ")" repetido, p. ej. "(...))") van a `observacion` —
// no se descarta nada. No intenta separar dos personas en una misma celda: eso
// queda tal cual, verbatim, en `nombreOriginal` (responsabilidad del
// llamador) y arrastrado a `nombre`/`observacion` por esta misma regla.
export function partirNombre(raw: string | null): { nombre: string | null; observacion: string | null } {
  if (!raw) return { nombre: null, observacion: null };
  const idx = raw.indexOf("(");
  if (idx === -1) {
    return { nombre: raw.replace(/\s+/g, " ").trim() || null, observacion: null };
  }
  const nombre = raw.slice(0, idx).replace(/\s+/g, " ").trim() || null;
  const resto = raw.slice(idx + 1); // todo lo que sigue al primer "("
  const cierre = resto.indexOf(")");
  const contenido = cierre === -1 ? resto : resto.slice(0, cierre);
  // Un ")" repetido justo tras el cierre es ruido de tipeo, no dato: se
  // descarta solo ese carácter, nunca el texto que trae detrás.
  const cola = cierre === -1 ? "" : resto.slice(cierre + 1).replace(/^\)+/, "");
  const observacion =
    [contenido, cola].map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean).join(" · ") || null;
  return { nombre, observacion };
}
