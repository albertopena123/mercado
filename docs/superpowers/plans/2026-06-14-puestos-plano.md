# /puestos Etapa→Bloque→Número + Plano — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Reestructurar `/puestos` a Etapa(1–2)→Bloque(A–M)→Número (continuo) con giro/dimensión estructurados, alta estructurada + generador, filtros/stats, y un plano interactivo por etapa.

**Architecture:** Desnormalizado en `Puesto` (sin tablas maestras). `codigo` derivado `E{etapa}-{bloque}-{numero}`. Giro como enum con mapa de color en `src/lib/puestos/giro.ts`. Plano = vista cliente data-driven (`src/lib/puestos/plano.ts` puro + `PuestoPlanoView.tsx`) que reutiliza `PuestoDetailDrawer`. Verificación: `tsc`, `eslint`, `prisma migrate`, `next build`, Playwright.

**Tech Stack:** Next 16 (App Router, server actions), React 19, Prisma 7 (Postgres), TS.

**Branch:** `feat/puestos-plano` (ya creada, spec commiteado).

---

## FASE 1 — modelo + backend + alta + filtros + generador

### Task 1: Esquema + migración (etapa/bloque/numero/banda/dimension/giro)

**Files:** `prisma/schema.prisma`; nueva migración.

- [ ] **Paso 1: Editar `model Puesto` y agregar enums.** En `prisma/schema.prisma`, junto al enum `EstadoPuesto`, añadir:

```prisma
enum BandaPuesto { alta media baja }
enum DimensionPuesto { d3x5 d3x3 }
enum Giro {
  verduras
  abarrotes
  carnes
  pescados
  comidas
  ropa
  calzado
  ferreteria
  productos_region
  juguetes
  flores_plantas
  otros
}
```

Reemplazar en `model Puesto`: quitar `giro String?`, `area Float?`, `zona String?`; agregar `etapa Int`, `bloque String`, `numero Int`, `banda BandaPuesto`, `dimension DimensionPuesto`, `giro Giro?`. Mantener `codigo String @unique`. Añadir `@@unique([etapa, bloque, numero])` y `@@index([etapa, bloque])` (conservar `@@index([estado])`, `@@index([giro])`).

- [ ] **Paso 2: Validar.** Run: `npx prisma validate` → Expected: "is valid".

- [ ] **Paso 3: Generar SQL de migración (no interactivo).**
Run: `ts=$(date +%Y%m%d%H%M%S) && dir="prisma/migrations/${ts}_puesto_etapa_bloque_numero" && mkdir -p "$dir" && npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script -o "$dir/migration.sql"`
Luego **editar** `$dir/migration.sql` para preservar el puesto existente (solo hay 1): el diff de Prisma hará DROP/ADD de columnas NOT NULL, lo que falla con filas existentes. Anteponer al script un backfill seguro o, dado que es 1 fila de prueba (`A-12`), aceptar recrearla. Estrategia simple y segura: convertir las nuevas columnas a NULL→backfill→NOT NULL. Si el script generado hace `ADD COLUMN ... NOT NULL` directo, reemplazar por:
```sql
ALTER TABLE "Puesto" ADD COLUMN "etapa" INTEGER;
ALTER TABLE "Puesto" ADD COLUMN "bloque" TEXT;
ALTER TABLE "Puesto" ADD COLUMN "numero" INTEGER;
ALTER TABLE "Puesto" ADD COLUMN "banda" "BandaPuesto";
ALTER TABLE "Puesto" ADD COLUMN "dimension" "DimensionPuesto";
-- giro: pasar de TEXT a enum
ALTER TABLE "Puesto" ADD COLUMN "giro_new" "Giro";
UPDATE "Puesto" SET etapa=1, bloque=upper(split_part(codigo,'-',1)), numero=NULLIF(split_part(codigo,'-',2),'')::int,
  banda='alta', dimension='d3x5', "giro_new"='abarrotes', codigo='E1-'||upper(split_part(codigo,'-',1))||'-'||split_part(codigo,'-',2);
ALTER TABLE "Puesto" DROP COLUMN "giro";
ALTER TABLE "Puesto" RENAME COLUMN "giro_new" TO "giro";
ALTER TABLE "Puesto" DROP COLUMN IF EXISTS "zona";
ALTER TABLE "Puesto" DROP COLUMN IF EXISTS "area";
ALTER TABLE "Puesto" ALTER COLUMN "etapa" SET NOT NULL;
ALTER TABLE "Puesto" ALTER COLUMN "bloque" SET NOT NULL;
ALTER TABLE "Puesto" ALTER COLUMN "numero" SET NOT NULL;
ALTER TABLE "Puesto" ALTER COLUMN "banda" SET NOT NULL;
ALTER TABLE "Puesto" ALTER COLUMN "dimension" SET NOT NULL;
CREATE UNIQUE INDEX "Puesto_etapa_bloque_numero_key" ON "Puesto"("etapa","bloque","numero");
CREATE INDEX "Puesto_etapa_bloque_idx" ON "Puesto"("etapa","bloque");
```
También crear los tipos enum si el diff no los incluyó (`CREATE TYPE "BandaPuesto" AS ENUM (...)`, etc.) — el diff normalmente los antepone; verificar y conservar.

- [ ] **Paso 4: Aplicar + generar cliente.** Run: `npx prisma migrate deploy && npx prisma generate`. Expected: "successfully applied" + cliente generado. Luego `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` → Expected: "No difference detected" (sin drift).

- [ ] **Paso 5: Commit.** `git add prisma/schema.prisma prisma/migrations && git commit -m "feat(db): puesto etapa/bloque/numero/banda/dimension + giro enum"`

> Tras esto, `tsc` romperá en `actions.ts`/`types.ts`/UI (campos zona/area/giro string). Se arregla en Tasks 2–6.

### Task 2: Catálogo de Giro + etiquetas de banda/dimensión

**Files:** Create `src/lib/puestos/giro.ts`.

- [ ] **Paso 1:** Crear el archivo con etiqueta + color por giro, y helpers de código/banda/dimensión:

```ts
import type { Giro, BandaPuesto, DimensionPuesto } from "@/generated/prisma/client";

export const GIRO_LABEL: Record<Giro, string> = {
  verduras: "Verduras", abarrotes: "Abarrotes", carnes: "Carnes",
  pescados: "Pescados", comidas: "Comidas", ropa: "Ropa",
  calzado: "Calzado", ferreteria: "Ferretería",
  productos_region: "Productos de la región", juguetes: "Juguetes",
  flores_plantas: "Flores y plantas", otros: "Otros",
};
export const GIRO_COLOR: Record<Giro, string> = {
  verduras: "#16a34a", abarrotes: "#f59e0b", carnes: "#dc2626",
  pescados: "#0ea5e9", comidas: "#ea580c", ropa: "#7c3aed",
  calzado: "#4f46e5", ferreteria: "#6b7280",
  productos_region: "#0d9488", juguetes: "#db2777",
  flores_plantas: "#65a30d", otros: "#94a3b8",
};
export const GIROS = Object.keys(GIRO_LABEL) as Giro[];

export const BANDA_LABEL: Record<BandaPuesto, string> = {
  alta: "Banda alta", media: "Banda media", baja: "Banda baja",
};
export const DIMENSION_LABEL: Record<DimensionPuesto, string> = {
  d3x5: "3×5 m", d3x3: "3×3 m",
};
// banda por defecto según el número continuo del bloque (1-24 alta, 25-40 media, 41-48 baja)
export function bandaPorNumero(n: number): BandaPuesto {
  if (n <= 24) return "alta";
  if (n <= 40) return "media";
  return "baja";
}
export function dimensionPorBanda(b: BandaPuesto): DimensionPuesto {
  return b === "media" ? "d3x3" : "d3x5";
}
export function puestoCodigo(etapa: number, bloque: string, numero: number): string {
  return `E${etapa}-${bloque.toUpperCase()}-${numero}`;
}
```

- [ ] **Paso 2:** `npx tsc --noEmit` (seguirá con errores en actions/UI — esperado). Commit junto con Task 3.

### Task 3: Backend `actions.ts` + `types.ts`

**Files:** `src/app/(admin)/puestos/types.ts`, `src/app/(admin)/puestos/actions.ts`.

- [ ] **Paso 1: types.ts.** En `PuestoRow`, `PuestoDetail`, `CreatePuestoInput`: quitar `zona`, `area`; agregar `etapa:number`, `bloque:string`, `numero:number`, `banda:BandaPuesto`, `dimension:DimensionPuesto`, `giro:Giro|null`. `ListPuestosParams`: agregar `etapa?:number`, `bloque?:string`. `SortKey` (si está aquí) o en actions: incluir `bloque`, `numero`. Extender `PuestoStats` opcionalmente con `porBloque`/`porGiro` (Record). Importar enums de `@/generated/prisma/client`.

- [ ] **Paso 2: actions.ts.** Cambios:
  - `buildSearchKey({ codigo, giro, bloque })` → `[codigo, giroLabel, bloque]` normalizados (usar `GIRO_LABEL`).
  - `SORT_KEYS = ["codigo","bloque","numero","giro","estado"]`; `buildOrderBy` casos `bloque`→`[{etapa},{bloque},{numero}]`, `numero`→`[{etapa:'asc'},{bloque:'asc'},{numero:dir}]`.
  - `buildWhere` → filtros `etapa` (Int) y `bloque` (string).
  - `validate()` → etapa ∈ {1,2}; bloque ∈ /^[A-M]$/i (uppercase); numero entero ≥1; banda/dimension válidas (default por número si faltan); giro opcional ∈ enum; derivar `codigo = puestoCodigo(...)`. Devuelve normalized con todos los campos.
  - `createPuesto`/`updatePuesto` → escribir etapa/bloque/numero/banda/dimension/giro + `codigo` derivado; quitar zona/area. P2002 → "Ya existe el puesto {codigo}".
  - `listPuestos` select → etapa/bloque/numero/banda/dimension/giro (quitar zona/area). `PuestoRow` map ídem.
  - `getPuesto` → ídem campos nuevos.
  - `getPuestoStats` → además `groupBy(['bloque'])` y `groupBy(['giro'])` para ocupación por zona/rubro (opcional v1: dejar igual + agregar después).
  - **Nueva** `listPuestosForPlano(etapa:number)`: `authorize('puestos.read')`, findMany sin paginar `where:{etapa}`, select `{id,bloque,numero,banda,dimension,estado,giro,codigo, asignaciones vigente→socio}`, map a `{id,bloque,numero,banda,dimension,estado,giro,codigo,socioActual}`.
  - **Nueva** `generarGrillaEtapa({ etapa, bloques, alta?, media?, baja? })`: `authorize('puestos.write')`; para cada bloque y cada banda con su rango por defecto (alta 1–24/d3x5, media 25–40/d3x3, baja 41–48/d3x5) hacer `createMany({ skipDuplicates:true })` con codigo derivado, estado 'vacio', searchKey; devolver `{creados, omitidos}`. Idempotente (skipDuplicates por `@@unique`).

- [ ] **Paso 3: Verificar.** `npx tsc --noEmit` → corregir hasta 0 errores en actions/types (UI seguirá rota hasta Tasks 4–6). `npx eslint` sobre los archivos.

- [ ] **Paso 4: Commit.** `git add src/lib/puestos/giro.ts "src/app/(admin)/puestos/actions.ts" "src/app/(admin)/puestos/types.ts" && git commit -m "feat(puestos): backend etapa/bloque/numero + giro + plano-data + generador"`

### Task 4: `page.tsx` — parsear filtros etapa/bloque

**Files:** `src/app/(admin)/puestos/page.tsx`.
- [ ] Parsear `etapa` (Int 1/2) y `bloque` de searchParams, pasarlos a `listPuestos`. `tsc`/`eslint`. Commit (junto con Task 5).

### Task 5: `PuestosClient.tsx` — columnas + filtros + toggle

**Files:** `src/app/(admin)/puestos/PuestosClient.tsx`.
- [ ] Columnas Etapa/Bloque/Nº (reemplazan Zona); mostrar giro con `GIRO_LABEL`. Filtros Etapa (1/2) y Bloque (A–M) reusando el patrón `updateParam`. Toggle **Tabla / Plano** (en Fase 1 el botón Plano queda visible pero deshabilitado o muestra "próximamente"; se activa en Task 8–9). `tsc`/`eslint`/verificación visual. Commit.

### Task 6: Alta/edición estructurada

**Files:** `src/app/(admin)/puestos/CreatePuestoModal.tsx`, `PuestoDetailDrawer.tsx` (DatosForm).
- [ ] Reemplazar input `codigo` libre por selectores Etapa/Bloque/Número (+ Banda/Dimensión autocompletadas por número, editables) + Giro (select con `GIRO_LABEL`) + Estado, con **preview del código** `E1-A-12`. Quitar campos zona/area. `tsc`/`eslint`/verificación (crear puesto). Commit.

### Task 7: Generador de grilla (UI)

**Files:** `PuestosClient.tsx` (botón "Generar grilla") + un modal simple, usando `generarGrillaEtapa`.
- [ ] Botón que abre modal: elegir Etapa + bloques (A–M, multiselección, default todos) → llama `generarGrillaEtapa` → toast "{creados} creados, {omitidos} existentes". `tsc`/`eslint`/verificación (generar Etapa 1). Commit.

## FASE 2 — plano interactivo

### Task 8: `src/lib/puestos/plano.ts` (layout puro)

**Files:** Create `src/lib/puestos/plano.ts`.
- [ ] Función pura `armarPlano(puestos, { ordenBloques?: 'A-M'|'M-A' })` → estructura `{ bloques: { bloque, bandas: { banda, puestos: PlanoCell[] }[] }[] }`, agrupando por bloque (orden configurable, default A→M) y dentro por banda (alta→media→baja), puestos ordenados por número. Tipos `PlanoCell = {id,numero,estado,giro,codigo,dimension,socioActual}`. Sin React, testeable.

### Task 9: `PuestoPlanoView.tsx` + toggle

**Files:** Create `src/app/(admin)/puestos/PuestoPlanoView.tsx`; modificar `PuestosClient.tsx`.
- [ ] Render del plano (CSS Grid): columnas por bloque, 3 bandas apiladas, celdas coloreadas por estado (tokens existentes) con conmutador "Color por: Estado / Giro" (usa `GIRO_COLOR`). Decoración: barra "Av. Los Próceres" arriba, "P1"/"P2" en extremos. Leyenda. Clic en celda → `setOpenId(id)` (abre `PuestoDetailDrawer`). Hover → tooltip (codigo + giro + socio). Selector de Etapa. Cargar con `listPuestosForPlano(etapa)`. Activar el toggle de Task 5. Estado vacío con CTA "Generar grilla".

### Task 10: `puestos.css` — estilos del plano

**Files:** `src/app/(admin)/puestos/puestos.css`.
- [ ] Clases `.pst-plano`, `.pst-plano__bloque`, `.pst-plano__banda`, `.pst-cell`, `.pst-cell--{estado}`, `.pst-plano__calle`, `.pst-plano__puerta`, `.pst-legend`, tooltip. Reusar variables/tokens. Responsive: scroll horizontal en móvil.

### Task 11: Verificación end-to-end + build

- [ ] `npx tsc --noEmit && npm run lint` (sin errores nuevos); `npm run build` (detener dev server, build, reiniciar).
- [ ] Playwright (con admin temporal): generar Etapa 1, ver tabla con filtros etapa/bloque, abrir plano, ver puestos por bloque/banda con color por estado y por giro, clic abre el drawer y permite asignar; estado vacío. Limpieza de datos de prueba.
- [ ] Commit de arreglos si los hubiera.

## Self-review (cobertura del spec)
- Modelo etapa/bloque/numero/banda/dimension + giro enum + codigo derivado + unique → Task 1–3. ✓
- Eliminar zona/area → Task 1, 3, 5, 6. ✓
- Alta estructurada + preview código → Task 6. ✓
- Generador → Task 3 (acción) + Task 7 (UI). ✓
- Filtros/columnas/stats → Task 4, 5 (+stats opcional Task 3). ✓
- Giro catálogo enum + colores → Task 2. ✓
- Plano interactivo (layout puro + view + reuse drawer + leyenda + calles/P1P2) → Task 8–10. ✓
- Migración bajo riesgo (1 puesto) → Task 1. ✓
