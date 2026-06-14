# Diseño: /puestos — Etapa → Bloque (A–M) → Número + plano interactivo

- **Fecha:** 2026-06-14
- **Estado:** Aprobado (diseño) — pendiente revisión del spec por el usuario
- **Origen:** El mercado tiene 2 etapas; cada etapa se organiza en bloques con letras A–M; cada bloque tiene puestos numerados con un giro y una dimensión. Plano físico de la Etapa 1 compartido por el usuario.

## 1. Objetivo

Reestructurar el módulo `/puestos` para reflejar la organización real del mercado y agregar una vista de plano:

1. Modelar **Etapa (1–2) → Bloque (A–M) → Número** (numeración **continua por bloque**), con dimensión y giro estructurados.
2. **Plano interactivo** por etapa (mapa visual tipo el plano físico), con color por estado/giro y clic que abre el detalle/asignación existente.
3. **Alta estructurada + generador** de la grilla de una etapa.
4. **Filtros, columnas y stats** por etapa/bloque/giro.

## 2. Estado actual (verificado)

- `model Puesto` (`prisma/schema.prisma`) es **plano**: `codigo String @unique` (string opaco, p. ej. "A-12"), `giro String?` (texto libre), `zona String?` (texto libre, redundante), `area Float?`, `estado EstadoPuesto @default(vacio)`, `fotoUrl`, `observaciones`, `searchKey`, auditoría. Índices `@@index([estado])`, `@@index([giro])`.
- `EstadoPuesto`: `activo | vacio | clausurado | construccion`.
- `PuestoAsignacion` (puesto↔socio temporal): `puestoId, socioId, desde, hasta(null=vigente), motivo, byUserId`. **Se conserva sin cambios.**
- Acciones (`src/app/(admin)/puestos/actions.ts`): `listPuestos, getPuesto, createPuesto, updatePuesto, deletePuesto, assignPuesto` (transacción + `SELECT … FOR UPDATE`), `unassignPuesto`, `getPuestoStats`. `buildSearchKey([codigo,giro,zona])`, `SORT_KEYS=['codigo','giro','zona','estado']`, `buildWhere` (estado + tokens sobre searchKey). `validate()` solo exige `codigo`.
- UI: `page.tsx` (server), `PuestosClient.tsx` (tabla 5 col + 5 stat-cards + toolbar + paginación), `CreatePuestoModal.tsx` (codigo libre + giro/zona/area/estado/observaciones), `PuestoDetailDrawer.tsx` (tabs Datos/Asignación, **reutilizable**), `AsignarSocioModal.tsx`, `EstadoPuestoBadge.tsx`, `puestos.css` (`.pst-badge--*`).
- Permisos: `puestos.read/write/delete/assign`.
- **Datos:** ~1 puesto en BD ("A-12", zona "Bloque A", giro "Abarrotes") → **migración de bajo riesgo**.

## 3. Decisiones (acordadas)

1. **Alcance:** paquete completo (modelo + alta estructurada + generador + filtros/stats + giro catálogo + **plano**), en 2 fases.
2. **Numeración:** **continua por bloque**; identidad única `(etapa, bloque, numero)`; `codigo` derivado `E{etapa}-{bloque}-{numero}` (p. ej. `E1-A-12`).
3. **Giro = enum** (catálogo cerrado) con mapa de color/etiqueta en código. *(Tabla `Giro` queda como evolución futura si se necesita gestión por admin.)*
4. **Se eliminan** `zona` (redundante con bloque) y `area` (reemplazada por `dimension`).
5. **Plano = toggle Tabla/Plano** dentro de `/puestos` (sin nuevo ítem de menú), con selector de Etapa.
6. **Enfoque desnormalizado** (sin tablas maestras Etapa/Bloque).

## 4. Modelo de datos

```prisma
enum BandaPuesto     { alta media baja }   // fila del bloque en el plano
enum DimensionPuesto { d3x5 d3x3 }         // reemplaza 'area'
enum Giro {
  verduras abarrotes carnes pescados comidas
  ropa calzado ferreteria productos_region
  juguetes flores_plantas otros
}

model Puesto {
  id            String          @id @default(cuid())
  etapa         Int                                  // 1 | 2
  bloque        String                               // 'A'..'M'
  numero        Int                                  // continuo por bloque
  banda         BandaPuesto
  dimension     DimensionPuesto
  giro          Giro?
  codigo        String          @unique              // DERIVADO 'E1-A-12'
  estado        EstadoPuesto    @default(vacio)
  fotoUrl       String?
  observaciones String?
  searchKey     String          @default("")
  // auditoría + relaciones existentes (asignaciones, createdBy/updatedBy) sin cambios
  @@unique([etapa, bloque, numero])
  @@index([estado])
  @@index([etapa, bloque])
  @@index([giro])
}
```

- `codigo` se **calcula** al crear/editar (`E${etapa}-${bloque}-${numero}`); nunca se escribe a mano. Se mantiene `@unique` (equivalente al compuesto, conserva compatibilidad con `PuestoAsignacion`/detalle de socio que muestran `codigo`).
- Se **eliminan** las columnas `zona` y `area`.
- **Mapa de color/etiqueta de Giro** (en `src/lib/puestos/giro.ts`): cada valor → `{ label, color }` para la leyenda del plano y badges. (Ej.: verduras=verde, abarrotes=ámbar, carnes=rojo, pescados=azul, comidas=naranja, ropa=morado, calzado=índigo, ferreteria=gris, productos_region=teal, juguetes=rosa, flores_plantas=lima, otros=neutro.)

## 5. Migración (riesgo bajo)

Nueva migración `prisma/migrations/<ts>_puesto_etapa_bloque_numero`:
1. `ADD COLUMN etapa/numero (Int) NULL`, `bloque (text) NULL`, `banda`, `dimension`, nuevo `giro` (enum) NULL.
2. **Backfill** del puesto existente: `A-12` → etapa 1, bloque `A`, numero 12, banda `alta`, dimension `d3x5`, giro `abarrotes`, recomputar `codigo`='E1-A-12'. (Parser de `^([A-M])-(\d+)$`; lo no parseable → revisión manual / etapa 1, bloque por defecto.)
3. `SET NOT NULL` en etapa/bloque/numero/banda/dimension.
4. `DROP COLUMN zona, area`.
5. `CREATE UNIQUE INDEX (etapa,bloque,numero)`; índice `(etapa,bloque)`.
6. Recomputar `searchKey`.

Generación de la migración: igual que en migraciones previas de este repo, vía `prisma migrate diff --from-config-datasource --to-schema` + `migrate deploy` (entorno no interactivo).

## 6. Backend (mismo PR que la migración)

`src/app/(admin)/puestos/actions.ts` y `types.ts`:
- `buildSearchKey` → incluye `etapa, bloque, numero, codigo, giro`.
- `SORT_KEYS`/`SortKey` → agregar `bloque`, `numero` (y `etapa`); `buildOrderBy` con esos casos (orden natural: etapa, bloque, numero).
- `buildWhere`/`ListPuestosParams` → filtros `etapa` y `bloque`.
- `validate()` → etapa ∈ {1,2}; bloque ∈ A–M; numero > 0; banda/dimension válidas; derivar `codigo`; unicidad por `(etapa,bloque,numero)` (manejo de P2002).
- `createPuesto`/`updatePuesto` → escriben los campos nuevos + `codigo` derivado.
- `types.ts`: `PuestoRow`/`PuestoDetail`/`CreatePuestoInput` con `etapa, bloque, numero, banda, dimension, giro`.
- **Nueva acción** `listPuestosForPlano(etapa)`: sin paginación, devuelve por puesto `{ id, bloque, numero, banda, dimension, estado, giro, codigo, socioActual }`.
- **Nueva acción** `generarGrillaEtapa(input)`: crea puestos para los bloques elegidos de una etapa con bandas por defecto (alta 1–24 d3x5, media 25–40 d3x3, baja 41–48 d3x5), `estado=vacio`, `giro=null`; **idempotente** (omite `(etapa,bloque,numero)` existentes); permiso `puestos.write`. Devuelve cuántos creó/omitió.
- `getPuestoStats` → además agrupa por `bloque`/`giro` (ocupación por zona/rubro).

## 7. UI

### 7.1 Tabla (`PuestosClient.tsx`, `page.tsx`)
- Columnas: **Etapa · Bloque · Nº** (reemplazan "Zona"), Giro, Estado, Socio actual.
- Toolbar: filtros **Etapa** (1/2) y **Bloque** (A–M) reusando el patrón `updateParam/searchParams`; búsqueda incluye bloque-número.
- **Toggle Tabla / Plano** + selector de Etapa.

### 7.2 Alta / edición (`CreatePuestoModal.tsx`, `DatosForm` del drawer)
- Reemplazar el input libre `codigo` por selectores **Etapa / Bloque / Número / Banda / Dimensión / Giro / Estado** con **preview del código** (`E1-A-12`). Banda y dimensión se autocompletan según rangos por defecto pero son editables.

### 7.3 Plano (`PuestoPlanoView.tsx` + `src/lib/puestos/plano.ts`)
- `plano.ts`: función **pura** que, dados los puestos de una etapa, arma la geometría — bloques como columnas (orden A→M configurable; opción de invertir a M→A para coincidir con el plano físico), y dentro de cada bloque las 3 bandas (alta/media/baja) en grilla de 2 columnas ordenadas por `numero`. **Data-driven**: dibuja solo los puestos que existen (tolera bloques con distinta cantidad).
- `PuestoPlanoView.tsx` (cliente): render con CSS Grid/SVG; cada puesto = celda coloreada por **estado** (tokens existentes: activo=verde, vacio=gris, clausurado=rojo, construccion=ámbar), con conmutador para colorear por **giro** (mapa de color). Decoración: calles (Av. Los Próceres arriba) y puertas **P1/P2**. **Leyenda** de colores.
- Interacción: clic en celda → `setOpenId(id)` que **abre el `PuestoDetailDrawer` existente** (datos + asignar/liberar). Hover → tooltip (giro + socio actual).
- Responsive: en móvil, scroll horizontal del plano o fallback a la tabla.

## 8. Manejo de errores / casos borde
- Crear puesto duplicado `(etapa,bloque,numero)` → error claro ("Ya existe el puesto E1-A-12").
- Número fuera de rango / bloque inválido → error de validación.
- Generador idempotente: informar creados vs omitidos.
- Plano de una etapa sin puestos → estado vacío con CTA "Generar grilla".

## 9. Pruebas / verificación
(No hay runner de tests en el repo → verificación con `tsc --noEmit`, `eslint`, `prisma migrate`, `next build` y verificación manual con la app/Playwright.)
- Migración aplicada sin drift; backfill correcto del puesto existente.
- CRUD con campos nuevos; código derivado correcto; unicidad.
- Generador: crea la grilla y es idempotente.
- Filtros etapa/bloque; orden; búsqueda por bloque-número.
- Plano: ubica los puestos por bloque/banda/número; colores por estado y por giro; clic abre el drawer y permite asignar.

## 10. Fases
- **Fase 1:** modelo + migración + backend + alta estructurada + generador + filtros/columnas/stats. (Tabla ya potente y poblada.)
- **Fase 2:** plano interactivo (`plano.ts` + `PuestoPlanoView` + toggle + leyenda).

## 11. Fuera de alcance
- Tablas maestras `Etapa`/`Bloque` configurables.
- Giro como tabla gestionable por admin (queda como evolución).
- Edición del plano por arrastrar/soltar (drag&drop de puestos).
- Medidas exactas variables por puesto (se usa dimensión 3×5 / 3×3).
