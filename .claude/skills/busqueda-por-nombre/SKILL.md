---
name: busqueda-por-nombre
description: Use when implementing, fixing, or reviewing any free-text search / buscador / picker / autocomplete over socios, puestos, cuotas, empleados, transferencias, usuarios, or any entity with a searchKey field — especially when a search fails to find a record by full name (e.g. "Julia Mondragón" not found), or when word order, accents, commas, or apellido-antes-que-nombre break the match.
---

# Búsqueda por nombre contra `searchKey`

## Principio

`searchKey` es una **concatenación normalizada** (lowercase, sin tildes) de varios campos —código, documento, padrón, apellidos, nombres— unidos por espacios (ver `buildSocioSearchKey` en `src/lib/socios/normalize.ts`). El orden almacenado es **apellidos → nombres**.

Por eso: buscar el término completo con un solo `contains` **falla** cuando el usuario escribe el nombre en otro orden que el almacenado. La única forma correcta es **tokenizar** la consulta y exigir que **cada token** aparezca (AND), en cualquier orden.

## La regla

**NUNCA** busques con un solo `contains` del término completo:

```ts
// ❌ MAL — falla con "Julia Mondragón" porque searchKey guarda "mondragon … julia"
const token = normalizeToken(q.trim());
where: { searchKey: { contains: token } }
```

**SIEMPRE** tokeniza + AND, usando el helper compartido:

```ts
// ✅ BIEN — cada palabra debe aparecer, en cualquier orden; tolera comas/tildes
import { searchKeyAnd } from "@/lib/socios/normalize";
where: { AND: searchKeyAnd(q) }
// combinable con otros filtros:
where: { estado: "activo", AND: searchKeyAnd(q) }
```

Para el `searchKey` de un **modelo relacionado** (o varias ramas OR), usa `searchTokens(q)` y arma la rama tú mismo:

```ts
import { searchTokens } from "@/lib/socios/normalize";
where: {
  AND: searchTokens(q).map((t) => ({
    OR: [
      { searchKey: { contains: t } },                                   // entidad
      { socio: { searchKey: { contains: t } } },                        // relación
    ],
  })),
}
```

## Helpers (fuente única: `src/lib/socios/normalize.ts`)

| Helper | Devuelve | Uso |
|---|---|---|
| `searchTokens(q)` | `string[]` tokens normalizados | armar ramas propias |
| `searchKeyAnd(q)` | `[{ searchKey: { contains } }, …]` | poner directo en `AND:` |
| `splitSearchTokens(q)` | tokens crudos (con tildes) | contra campos crudos, no `searchKey` |
| `normalizeToken(s)` | string sin tildes+lowercase | normalizar UN token ya aislado |

`searchTokens`/`searchKeyAnd` parten por **cualquier** carácter no alfanumérico (espacios, comas, guiones, puntos), así que "Apellido, Nombre" pegado de la lista también funciona.

## Caso canónico (por qué existe esta skill)

Socia real: apellidoPaterno `MONDRAGON`, materno `CONDORI`, nombres `JULIA PAULINA` → `searchKey = "… mondragon condori julia paulina"`. Buscar **"julia mondragon"** con un solo `contains` da **0 resultados** (esa subcadena contigua no existe). Con `searchKeyAnd` da 1 resultado. Este bug apareció en `organos.buscarSocios` (commit fix) tras ya haberse arreglado en `/socios` — es una clase recurrente porque **cada módulo reescribe su búsqueda**.

## Al revisar o crear una búsqueda

- ¿Aparece `searchKey: { contains: <algo> }` **fuera** de un `.map` sobre tokens? → bug, cámbialo a `searchKeyAnd`/`searchTokens`.
- ¿Se normaliza `q` entero con `normalizeToken(q)` y se pasa como un solo `contains`? → bug.
- ¿La búsqueda encuentra por documento/código pero no por nombre completo? → casi siempre es esto.
