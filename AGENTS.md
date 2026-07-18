<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Búsqueda por nombre

Toda búsqueda de texto libre contra un campo `searchKey` DEBE tokenizarse (cada palabra en `AND`), nunca un solo `contains` del término completo — si no, falla por orden de palabras (p. ej. "Julia Mondragón"). Usa `searchKeyAnd(q)` / `searchTokens(q)` de `src/lib/socios/normalize.ts`. Detalles: skill `busqueda-por-nombre`.
