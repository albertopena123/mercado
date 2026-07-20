# Padrón histórico de empadronamientos — Diseño (Fase 1)

**Fecha:** 2026-07-19
**Estado:** Aprobado (diseño), pendiente de plan de implementación
**Fuente de datos:** `RELACION DE PUESTOS (version 5).xlsx`, hoja `PADRON 2022`

## Objetivo

El padrón que hoy vive en `/socios` es el vigente y es correcto. Falta su historia:
la asociación ha hecho **cuatro empadronamientos** (2014, 2017, 2019 y 2021) y hoy
esa información solo existe en un Excel. Este diseño la incorpora al sistema para
poder responder, sobre cualquier puesto o socio, desde cuándo figura y por cuántas
manos pasó.

## Concepto central

La hoja `PADRON 2022` **no es un padrón**: es una **matriz indexada por puesto**, con
un titular por empadronamiento en cada fila. Por eso el modelo se ancla al **puesto**,
no al socio:

> Un `PadronRegistro` es «quién figuraba como titular del puesto P en el
> empadronamiento E», tal como consta en el documento fuente.

De ahí se derivan por lectura las dos vistas que se piden: el **linaje** de un puesto
(recorriendo sus registros en orden) y la **antigüedad** de un socio (partiendo de sus
puestos vigentes hacia atrás).

## Hallazgos que sostienen el diseño

Todos verificados contra la BD antes de escribir este documento:

| Comprobación | Resultado |
|---|---|
| Filas del Excel que encuentran su puesto en la BD | **704 / 704** |
| Claves `(etapa, bloque, número)` duplicadas | **0** |
| Puestos de la BD sin fila histórica | 4 — exactamente los SS-HH del bloque A |
| Titulares 2021 con DNI que siguen siendo el mismo socio hoy | **608 / 616 (98.7 %)** |

Cobertura por empadronamiento (de 704 puestos):

| Empadronamiento | Titulares | N.º de padrón | Cobertura |
|---|---|---|---|
| Gestión 2014 | 259 | 256 | parcial (E1 146/296 · E2 113/408) |
| Santos 2017 | 704 | 524 | **completa** |
| Raymundo 2019 | 419 | 405 | parcial (E1 194/296 · E2 225/408) |
| Gestión Santos 2021 | 704 | 534 | **completa** (+616 DNI) |

**La dispersión es real, no un defecto de extracción.** 2014 y 2019 fueron
empadronamientos incompletos en ambas etapas. El modelo debe permitir la ausencia de
registro; nunca rellenarla.

Rotación de titular entre gestiones (mismo puesto, comparando nombre normalizado):

- 2014 → 2017: 97 % sin cambio (9 traspasos)
- 2017 → 2019: **67 % sin cambio (136 traspasos)**
- 2019 → 2021: 81 % sin cambio (79 traspasos)

### Decisiones que se derivan

1. **La unión es por puesto, jamás por nombre.** El nombre solo se muestra. Esto evita
   reproducir el problema de socios duplicados (caso Julia Mondragón).
2. **El enlace a socio se hace solo por DNI**, y únicamente la columna 2021 trae DNI.
   Para 2014/2017/2019 `socioId` queda en `null` por diseño.
3. **La continuidad se calcula al leer.** Son 4 registros por puesto. Un valor
   calculado y persistido se vuelve mentira con el primer traspaso.
4. **El nombre se guarda verbatim.** 51 celdas traen anotaciones incrustadas con valor
   legal — `(vendido 2023)`, `(falta pagar trapaso)`, `(debe laster y terreno)` — y una
   trae dos personas y una comilla en la misma celda
   (`APAZA  SUCATICONA ALEXCE "CARRASCO  TTORUCO JUAN`). Limpiar de forma destructiva
   perdería evidencia.

## 1. Datos (Prisma)

Migración timestamped en `prisma/migrations/`.

```prisma
model Empadronamiento {
  id        String   @id @default(cuid())
  anio      Int      @unique
  nombre    String   // "Gestión 2014", "Santos 2017", "Raymundo 2019", "Gestión Santos 2021"
  orden     Int      @unique // 1..4 — ordena el linaje sin depender del año
  fuente    String?  // procedencia documental del dato
  createdAt DateTime @default(now())

  registros PadronRegistro[]
}

model PadronRegistro {
  id                String @id @default(cuid())
  empadronamientoId String
  puestoId          String

  // Titular tal como consta en el documento fuente. NO se normaliza ni se corrige:
  // es la evidencia. `nombre` es la versión limpia para mostrar y `observacion`
  // recoge la anotación entre paréntesis cuando la hay.
  nombreOriginal String?
  nombre         String?
  observacion    String?

  numeroPadron    Int?
  numeroDocumento String? // solo el empadronamiento 2021 lo trae
  socioId         String? // enlazado SOLO por DNI verificado; ver §3

  // Concatenación normalizada para búsqueda tokenizada (convención del proyecto).
  searchKey String @default("")

  filaExcel Int?     // trazabilidad a la fila de origen
  createdAt DateTime @default(now())

  empadronamiento Empadronamiento @relation(fields: [empadronamientoId], references: [id], onDelete: Cascade)
  // Restrict, igual que PuestoAsignacion: borrar un puesto no debe arrasar su historia.
  puesto Puesto @relation(fields: [puestoId], references: [id], onDelete: Restrict)
  // SetNull: el registro es evidencia documental y sobrevive al borrado del socio.
  socio  Socio? @relation(fields: [socioId], references: [id], onDelete: SetNull)

  @@unique([empadronamientoId, puestoId])
  @@index([socioId])
  @@index([puestoId])
}
```

Volumen: 4 filas en `Empadronamiento`, ~2 100 en `PadronRegistro`.

`@@unique([empadronamientoId, puestoId])` es seguro: verificado 0 duplicados en las
704 filas.

Contrapartes obligatorias de la relación: `registros PadronRegistro[]` en `Puesto` y en
`Socio`.

## 2. Importador

Sigue el patrón ya establecido en el repo (`import-guardiania-clean.py` +
`import-guardiania.ts`), en dos pasos para que el parseo del Excel sea reproducible y
auditable por separado de la escritura en BD.

### 2.1 `prisma/import-historico-clean.py`

Excel → `prisma/_historico.json`. Responsabilidades:

- Resolver **celdas combinadas**: etapa y bloque vienen combinados verticalmente; hay
  que propagar el valor de la celda superior izquierda del rango.
- **Cuidado con la etapa de E1: su celda vale `0`**, que es *falsy*. Una comprobación
  tipo `if not valor` descarta las 296 filas de la Etapa 1 en silencio. Comparar contra
  `None` explícitamente.
- Etapa: `0`/vacío → 1; texto que contenga `SEGUNDA` → 2.
- Descartar las 3 filas de pie de tabla (`PUESTOS SIN EMPADRONAR`, `296`, `408`): son
  totales, se reconocen por no tener bloque.
- Emitir por fila: `etapa`, `bloque`, `numero`, `filaExcel` y, por cada
  empadronamiento, `{nombre, padron, dni?}`.

Mapeo de columnas de la hoja `PADRON 2022`:

| Col | Contenido |
|---|---|
| A / B / D | etapa / bloque / número de puesto |
| C | parcela — **se ignora** (no forma parte de la llave) |
| F, G | Gestión 2014: nombre, n.º padrón |
| H, I | Santos 2017: nombre, n.º padrón |
| J, K | Raymundo 2019: nombre, n.º padrón |
| L, M, N | Gestión Santos 2021: nombre, **DNI**, n.º padrón |

### 2.2 `prisma/import-historico.ts`

Modos idénticos a `import-padron.ts`: **dry-run por defecto**, `--apply` escribe,
`--rollback` revierte. El dry-run debe imprimir el cuadro de resultados completo
(enlazados, vetados, DNI inválidos, sin socio) para revisión antes de aplicar.

- Llave de puesto: `(etapa, bloque, numero)`. La parcela se ignora, igual que en
  `import-etapa.ts`.
- Idempotente: `upsert` sobre `(empadronamientoId, puestoId)`.
- Solo inserta registro donde hay dato. Ausencia = sin fila.
- Normalización de DNI reutilizando la lógica de `normDni` existente: 5–7 dígitos →
  `padStart(8, "0")`; 8 dígitos → tal cual; 9 o más → **inválido**.
- Extracción de anotación: el paréntesis final pasa a `observacion`; `nombre` es el
  resto limpio; `nombreOriginal` conserva la celda íntegra.
- `searchKey` con `buildSocioSearchKey`/`normalizeToken` de
  `src/lib/socios/normalize.ts`.

**Los DNI inválidos no se corrigen.** Hay 2 casos de 9 dígitos (`412761335`,
`424506390`) donde quitar el último dígito produciría un DNI que sí existe. Adivinar
sobre un documento de identidad no es aceptable: se deja `numeroDocumento = null` y se
anota el valor crudo en `observacion` para que la Fase 2 lo resuelva con la directiva.

## 3. Enlace a socio: DNI con veto por nombre

`socioId` se asigna cuando se cumplen **las dos** condiciones:

1. El DNI normalizado corresponde a un socio existente.
2. El nombre del registro **comparte al menos un token** (≥3 caracteres, sin tildes,
   mayúsculas) con el nombre del socio.

La condición 2 es un **veto, no una unión**: el nombre nunca crea un enlace, solo puede
impedirlo. Si el DNI calza pero el nombre es ajeno, el dato de origen es sospechoso y
enlazar sería peor que no hacerlo.

Que un DNI se repita en varias filas es **normal y esperado**: 140 DNIs tienen más de un
puesto. El veto no penaliza eso; solo detecta el mismo DNI con nombres distintos.

Resultado medido sobre las 616 celdas con DNI:

| | |
|---|---|
| Enlazan | **607** |
| Vetados (DNI calza, nombre ajeno) | 2 |
| DNI sin socio en la BD | 5 |
| DNI inválido (9 dígitos) | 2 |

Los 2 vetados son exactamente los casos que se quieren atrapar:

```
E1-H-18  dni=45029431  excel="BARRIONUEVO QUISPE LUISA ZENAIDA"  bd="CARIAPAZA MARGOTH NERY"
E2-M-12  dni=25214362  excel="ESPINOZA LARA HILARIA"             bd="SONCCO EUFRACIA"
```

Vetados, sin socio e inválidos se reportan en el dry-run y quedan con `socioId = null`.
No bloquean la importación; son insumo de la Fase 2.

## 4. Continuidad (cálculo al leer)

`src/lib/padron/historico.ts` (`server-only`):

- `getLinajePuesto(puestoId)` → registros ordenados por `Empadronamiento.orden`, cada
  uno con un flag `cambioDeTitular` calculado comparando el nombre normalizado contra
  el registro anterior **no vacío** (saltando los empadronamientos sin dato, para no
  reportar un traspaso falso por un hueco de 2014 o 2019). Cierra con el titular actual
  tomado de la asignación vigente.
- `getAntiguedadSocio(socioId)` → para cada puesto vigente del socio, el empadronamiento
  más antiguo en el que el titular sigue siendo el mismo nombre de forma ininterrumpida.
  Devuelve el detalle por puesto **y** un `desde` agregado.

**Regla del agregado:** la antigüedad del socio es el empadronamiento **más antiguo entre
todos sus puestos**. Un socio con un puesto desde 2014 y otro comprado en 2021 es un
socio de 2014; es la lectura que corresponde para efectos de derechos y prioridad.

**El agregado nunca se muestra solo.** Va siempre acompañado del puesto que lo justifica
(«Socio desde Gestión 2014 — por E1-A-12»), por dos razones: la identidad previa a 2021
se infiere por continuidad de nombre en un puesto concreto (antes de esa gestión no hay
DNI en la fuente), y un dato de antigüedad que no se puede auditar de un vistazo es un
dato en el que nadie va a confiar cuando se use para asignar un derecho.

## 5. Interfaz

Ambas fichas de detalle son **drawers con tabs** (`soc-tabs` / `soc-tab`), no páginas.
Se añade un tab a cada una siguiendo el patrón existente (unión `type Tab`, `useState`).

**`SocioDetailDrawer`** — nuevo tab `padron`, etiqueta **«Padrón histórico»**.
El drawer **ya tiene un tab `historial`** (log de estados): el nombre nuevo debe ser
distinto para no colisionar ni confundir.
Muestra, por cada puesto vigente, desde qué empadronamiento figura el socio y la lista
de titulares anteriores de ese puesto.

**`PuestoDetailDrawer`** — nuevo tab `historial`, etiqueta **«Historial»**.
Línea de tiempo 2014 → 2017 → 2019 → 2021 → titular actual, con el n.º de padrón de cada
gestión, marcando visualmente dónde cambió de manos y mostrando la `observacion` cuando
exista. Los empadronamientos sin dato se muestran explícitamente como «sin registro»,
no se omiten: la ausencia es información.

Los registros con `socioId` enlazan al socio; los demás se muestran como texto plano.
La diferencia debe ser visible — un nombre enlazado significa identidad verificada por
DNI, y esa distinción es justamente lo que dará valor a la Fase 3.

## 6. Búsqueda

Buscar un nombre histórico y obtener puesto y gestión.

Obligatorio por `AGENTS.md`: la búsqueda contra `searchKey` **debe tokenizarse** con
`searchKeyAnd(q)` / `searchTokens(q)` de `src/lib/socios/normalize.ts`. Un `contains`
del término completo falla por orden de palabras.

## 7. Permisos

No se crea permiso nuevo. Los tabs viven dentro de los drawers de socio y puesto y
heredan `socios.read` y `puestos.read`. Fase 1 es de solo lectura: no hay acciones de
escritura desde la UI, la única escritura es el importador por CLI.

## 8. Casos borde

| Caso | Tratamiento |
|---|---|
| Puesto sin registro en una gestión | Sin fila. La UI lo muestra como «sin registro». |
| Los 4 SS-HH del bloque A | No tienen fila histórica y es correcto: no son puestos. |
| 3 filas de pie de tabla | Descartadas por el limpiador (sin bloque). |
| Nombre con anotación | `nombreOriginal` íntegro + `nombre` limpio + `observacion`. |
| Celda con dos personas | Se guarda verbatim, sin intentar separar. |
| DNI de 9 dígitos | `numeroDocumento = null` + valor crudo en `observacion`. |
| Mismo DNI, nombres distintos | Vetado, `socioId = null`, reportado. |
| Mismo DNI, varios puestos | Normal (140 casos). Se enlazan todos. |
| DNI 2021 sin socio en la BD | `socioId = null`, reportado (5 casos). |
| Socio con puestos de distinta data | Antigüedad = la del puesto más antiguo (§4), mostrando ese puesto. |
| Socio sin ningún puesto vigente | Sin antigüedad derivable. La UI lo dice; no se inventa un valor. |

## 9. Verificación

- `npx tsx prisma/import-historico.ts` (dry-run) reporta **704 puestos resueltos, 0 sin
  resolver** y el cuadro de enlaces del §3.
- Tras `--apply`: `PadronRegistro` tiene el conteo esperado por gestión (262 / 704 / 420
  / 704) y `Empadronamiento` tiene 4 filas. Es más que el número de nombres porque también
  se escribe registro cuando hay número de padrón sin nombre (4 casos).
- `--rollback` deja ambas tablas vacías sin tocar socios ni puestos.
- Reejecutar `--apply` no duplica filas (idempotencia por `upsert`).
- `npx tsc --noEmit` limpio (filtrando el ruido conocido de `.next`) y `eslint` limpio.
- Verificador `prisma/verify-historico.ts` siguiendo el patrón de los `verify-*.ts`
  existentes, incorporado a `npm run test:db`.

## Fuera de alcance (fases siguientes)

Cada una con su propio spec:

- **Fase 2 — Reconciliación.** Reporte en `/reportes` con: DNIs recuperables para los 70
  socios `SIN-DNI` (el histórico tiene el dato que falta), titulares de 2021 ausentes
  hoy, DNI con dedazo de 9 dígitos, y los 2 casos vetados.
- **Fase 3 — Anti-fraude.** Mostrar la procedencia del titular al emitir constancia y al
  formalizar una transferencia, apoyándose en el linaje y en las anotaciones tipo
  «vendido 2023» / «falta pagar traspaso».
