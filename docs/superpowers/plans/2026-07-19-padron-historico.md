# Padrón histórico de empadronamientos (Fase 1) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Incorporar al sistema los cuatro empadronamientos históricos (2014, 2017, 2019, 2021) desde la hoja `PADRON 2022` del Excel, y exponer el linaje de cada puesto y la antigüedad de cada socio.

**Architecture:** El modelo se ancla al **puesto**, no al socio: la hoja fuente es una matriz indexada por puesto cuya llave `(etapa, bloque, número)` calza 704/704 con la BD. Dos tablas nuevas (`Empadronamiento`, `PadronRegistro`); un limpiador Python que produce JSON y un importador TypeScript con dry-run/apply/rollback; una capa de lectura que **calcula** la continuidad entre gestiones en vez de persistirla; y dos tabs nuevos en los drawers existentes más una página de búsqueda.

**Tech Stack:** Next.js 16 (App Router, Server Actions), Prisma 7 + `@prisma/adapter-pg`, PostgreSQL, TypeScript, Python 3 + openpyxl (solo para el limpiador), `tsx` para scripts.

**Spec:** `docs/superpowers/specs/2026-07-19-padron-historico-design.md`

## Global Constraints

- **Este NO es el Next.js de tu entrenamiento.** Antes de escribir código de framework, lee la guía correspondiente en `node_modules/next/dist/docs/`. (`AGENTS.md`)
- **Toda búsqueda de texto libre contra `searchKey` DEBE tokenizarse** (cada palabra en `AND`) usando `searchKeyAnd(q)` / `searchTokens(q)` de `src/lib/socios/normalize.ts`. Un `contains` del término completo falla por orden de palabras. (`AGENTS.md`)
- **El cliente Prisma se importa desde `../src/generated/prisma/client`** (scripts) o `@/generated/prisma/client` (app), NO desde `@prisma/client`.
- **Los scripts se conectan con el adapter:** `new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })` y `import "dotenv/config"` como primera línea.
- **No sembrar datos ficticios en la BD.** Estado vacío o datos reales.
- **Fechas de calendario en UTC**, instantes en Lima. Los años de empadronamiento son enteros, no fechas: no hay riesgo aquí, pero no los conviertas a `Date`.
- **`npx tsc --noEmit` reporta ~35 errores falsos en `.next/dev/types/routes.d.ts`.** Filtrar siempre: `npx tsc --noEmit 2>&1 | grep -vE '^\.next'`.
- **No hay framework de tests unitarios.** La verificación se hace con scripts `prisma/verify-*.ts` (aserciones con `node:assert/strict` contra la BD real), ejecutados por `npm run test:db`. No introduzcas jest/vitest.
- **Ruta del Excel fuente:** `c:\Users\anonimo\Documents\2026\mercado milagros\2026 ARCHIVOS\PADRON\PADRON EN EXCEL\RELACION DE PUESTOS (version 5).xlsx`, hoja `PADRON 2022`.

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `prisma/schema.prisma` *(mod)* | Modelos `Empadronamiento` y `PadronRegistro` + relaciones inversas en `Puesto` y `Socio`. |
| `prisma/migrations/<ts>_padron_historico/` *(nuevo)* | Migración generada por Prisma. |
| `prisma/import-historico-clean.py` *(nuevo)* | Excel → `prisma/_historico.json`. Único lugar que sabe de openpyxl y celdas combinadas. |
| `prisma/_historico.json` *(generado)* | Payload intermedio. **NO se versiona**: `/prisma/_*` está en `.gitignore`, como todos los JSON intermedios del repo. Se regenera con el limpiador. |
| `prisma/import-historico.ts` *(nuevo)* | JSON → BD. Dry-run/apply/rollback. Único lugar con la regla de enlace por DNI. |
| `prisma/verify-historico.ts` *(nuevo)* | Aserciones sobre el modelo y la capa de lectura. |
| `src/lib/padron/searchKey.ts` *(nuevo)* | `buildPadronRegistroSearchKey`. Sin `server-only`: lo usan el importador y la app. |
| `src/lib/padron/types.ts` *(nuevo)* | Tipos compartidos. Sin `server-only`: los importan componentes cliente. |
| `src/lib/padron/historico.ts` *(nuevo)* | `server-only`. Consultas + cálculo de continuidad y antigüedad. |
| `src/app/(admin)/puestos/actions.ts` *(mod)* | Server action `getHistoricoPuesto`. |
| `src/app/(admin)/socios/actions.ts` *(mod)* | Server actions `getAntiguedadSocio` y `buscarHistorico`. |
| `src/app/(admin)/puestos/PuestoHistorialTab.tsx` *(nuevo)* | Línea de tiempo del puesto. |
| `src/app/(admin)/puestos/PuestoDetailDrawer.tsx` *(mod)* | Alta del tab `historial`. |
| `src/app/(admin)/socios/SocioPadronTab.tsx` *(nuevo)* | Antigüedad del socio. |
| `src/app/(admin)/socios/SocioDetailDrawer.tsx` *(mod)* | Alta del tab `padron`. |
| `src/app/(admin)/socios/historico/page.tsx` *(nuevo)* | Página de búsqueda (patrón de `socios/registros/page.tsx`). |
| `src/app/(admin)/socios/historico/HistoricoClient.tsx` *(nuevo)* | Tabla + buscador. |
| `package.json` *(mod)* | `verify-historico` en `test:db`. |

**Nota de frontera crítica:** `src/lib/padron/historico.ts` lleva `server-only`. Los componentes cliente (`SocioPadronTab`, `PuestoHistorialTab`, `HistoricoClient`) **no pueden importarlo**: importan tipos de `src/lib/padron/types.ts` y datos vía server action. Por eso los tipos viven en un archivo aparte.

---

### Task 1: Esquema y migración

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_padron_historico/migration.sql` (generado por Prisma)

**Interfaces:**
- Consumes: nada.
- Produces: modelos `Empadronamiento` (campos `id`, `anio`, `nombre`, `orden`, `fuente`, `createdAt`) y `PadronRegistro` (campos `id`, `empadronamientoId`, `puestoId`, `nombreOriginal`, `nombre`, `observacion`, `numeroPadron`, `numeroDocumento`, `socioId`, `searchKey`, `filaExcel`, `createdAt`), disponibles en el cliente Prisma como `prisma.empadronamiento` y `prisma.padronRegistro`.

- [ ] **Step 1: Añadir los modelos al schema**

Al final de `prisma/schema.prisma`:

```prisma
// ─────────────────────────── Padrón histórico ───────────────────────────
//
// La hoja fuente (`PADRON 2022`) NO es un padrón: es una matriz indexada por
// PUESTO con un titular por empadronamiento. Por eso el registro se ancla al
// puesto y no al socio — su llave (etapa, bloque, número) calza 704/704 con la
// grilla, mientras que el nombre del titular es texto libre de 2014-2019 sin
// documento que lo respalde.
model Empadronamiento {
  id        String   @id @default(cuid())
  anio      Int      @unique
  nombre    String // "Gestión 2014", "Santos 2017", "Raymundo 2019", "Gestión Santos 2021"
  orden     Int      @unique // ordena el linaje sin depender del año
  fuente    String? // procedencia documental; marca los importados para el rollback
  createdAt DateTime @default(now())

  registros PadronRegistro[]
}

model PadronRegistro {
  id                String @id @default(cuid())
  empadronamientoId String
  puestoId          String

  // Titular tal como consta en la fuente. `nombreOriginal` NO se normaliza ni se
  // corrige: es la evidencia (51 celdas traen anotaciones con valor legal, y una
  // trae dos personas en la misma celda). `nombre` es la versión limpia para
  // mostrar y `observacion` recoge la anotación entre paréntesis.
  nombreOriginal String?
  nombre         String?
  observacion    String?

  numeroPadron    Int?
  numeroDocumento String? // solo el empadronamiento 2021 lo trae
  socioId         String? // enlazado SOLO por DNI verificado; nunca por nombre

  searchKey String @default("")
  filaExcel Int? // trazabilidad a la fila de origen
  createdAt DateTime @default(now())

  empadronamiento Empadronamiento @relation(fields: [empadronamientoId], references: [id], onDelete: Cascade)
  // Restrict, igual que PuestoAsignacion: borrar un puesto no debe arrasar su historia.
  puesto Puesto @relation(fields: [puestoId], references: [id], onDelete: Restrict)
  // SetNull: el registro es evidencia documental y sobrevive al borrado del socio.
  socio Socio? @relation(fields: [socioId], references: [id], onDelete: SetNull)

  @@unique([empadronamientoId, puestoId])
  @@index([puestoId])
  @@index([socioId])
}
```

- [ ] **Step 2: Añadir las relaciones inversas**

En `model Socio`, junto a las demás relaciones (después de `guardianiaCuentas`):

```prisma
  registrosPadron PadronRegistro[]
```

En `model Puesto`, junto a las demás relaciones (después de `guardianiaCuenta`):

```prisma
  registrosPadron PadronRegistro[]
```

- [ ] **Step 3: Verificar que el schema es válido antes de migrar**

Run: `npx prisma validate`
Expected: `The schema at prisma\schema.prisma is valid 🚀`

Si falla por relación faltante, es que el Step 2 quedó incompleto: Prisma exige la contraparte en ambos modelos.

- [ ] **Step 4: Generar y aplicar la migración**

Run: `npx prisma migrate dev --name padron_historico`
Expected: crea `prisma/migrations/<timestamp>_padron_historico/migration.sql`, lo aplica y regenera el cliente.

**No escribas el SQL a mano.** Este repo ya sufrió drift por usar `db push` (los modelos `Bien`/`MovimientoBien` existieron sin migración). El SQL generado debe contener `CREATE TABLE "Empadronamiento"`, `CREATE TABLE "PadronRegistro"`, el índice único `PadronRegistro_empadronamientoId_puestoId_key` y las tres FK con `ON DELETE CASCADE` / `RESTRICT` / `SET NULL` respectivamente. Revísalo antes de commitear.

- [ ] **Step 5: Verificar que el cliente Prisma expone los modelos**

Run: `npx tsc --noEmit 2>&1 | grep -vE '^\.next'`
Expected: sin salida.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(padron): modelos Empadronamiento y PadronRegistro"
```

---

### Task 2: Limpiador del Excel (Python)

**Files:**
- Create: `prisma/import-historico-clean.py`
- Create: `prisma/_historico.json` (salida)

**Interfaces:**
- Consumes: el `.xlsx` fuente.
- Produces: `prisma/_historico.json`, un array de objetos con esta forma exacta, consumido por Task 3:

```json
{
  "filaExcel": 4, "etapa": 1, "bloque": "A", "numero": 11,
  "e2014": {"nombre": null, "padron": null},
  "e2017": {"nombre": "GAMARRA CARRILLO MARCELINA", "padron": 53},
  "e2019": {"nombre": "DURAN QUISPE ULDA", "padron": 191},
  "e2021": {"nombre": "DURAN QUISPE ULDA", "padron": null, "dni": "80427489"}
}
```

- [ ] **Step 1: Escribir el limpiador**

`prisma/import-historico-clean.py`:

```python
# -*- coding: utf-8 -*-
import sys, io, re, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
import openpyxl

# Limpia la matriz histórica de la hoja "PADRON 2022" a un JSON que consume
# prisma/import-historico.ts.
#   python prisma/import-historico-clean.py "<ruta al .xlsx>" prisma/_historico.json
#
# La hoja NO es un padrón: es una matriz indexada por PUESTO con un titular por
# empadronamiento. Cada fila = un puesto; columnas F..N = las cuatro gestiones.
XLSX = sys.argv[1] if len(sys.argv) > 1 else r"c:\Users\anonimo\Documents\2026\mercado milagros\2026 ARCHIVOS\PADRON\PADRON EN EXCEL\RELACION DE PUESTOS (version 5).xlsx"
OUT  = sys.argv[2] if len(sys.argv) > 2 else "prisma/_historico.json"

# read_only=False es OBLIGATORIO: en modo read_only openpyxl no expone
# `merged_cells`, y etapa/bloque vienen combinados verticalmente. Sin eso, las
# 704 filas quedan sin etapa.
wb = openpyxl.load_workbook(XLSX, data_only=True)
ws = wb["PADRON 2022"]

# Propaga el valor de la celda superior-izquierda a todo el rango combinado.
merged = {}
for rng in ws.merged_cells.ranges:
    top = ws.cell(rng.min_row, rng.min_col).value
    for r in range(rng.min_row, rng.max_row + 1):
        for c in range(rng.min_col, rng.max_col + 1):
            merged[(r, c)] = top

def val(r, c):
    v = merged.get((r, c), ws.cell(r, c).value)
    return v.strip() if isinstance(v, str) else v

def txt(r, c):
    v = val(r, c)
    if v is None:
        return None
    s = str(v).strip()
    return s or None

def num(r, c):
    v = val(r, c)
    if v is None:
        return None
    m = re.search(r"\d+", str(v))
    return int(m.group()) if m else None

COLS = {"etapa": 1, "bloque": 2, "numero": 4,
        "n2014": 6, "p2014": 7, "n2017": 8, "p2017": 9,
        "n2019": 10, "p2019": 11, "n2021": 12, "dni": 13, "p2021": 14}

out, descartadas = [], []
for r in range(4, ws.max_row + 1):
    numero = num(r, COLS["numero"])
    if numero is None:
        continue
    et_raw = val(r, COLS["etapa"])
    bloque = txt(r, COLS["bloque"])
    # OJO: la celda de etapa de la Etapa 1 vale 0, que es FALSY en Python. Un
    # `if not et_raw` descarta en silencio las 296 filas de E1. Comparar con None.
    if et_raw is None or bloque is None:
        # Pie de tabla del Excel ("PUESTOS SIN EMPADRONAR", 296, 408): totales.
        descartadas.append((r, txt(r, COLS["n2021"]), numero))
        continue
    etapa = 2 if "SEGUNDA" in str(et_raw).upper() else 1
    dni = val(r, COLS["dni"])
    out.append({
        "filaExcel": r, "etapa": etapa, "bloque": bloque.upper(), "numero": numero,
        "e2014": {"nombre": txt(r, COLS["n2014"]), "padron": num(r, COLS["p2014"])},
        "e2017": {"nombre": txt(r, COLS["n2017"]), "padron": num(r, COLS["p2017"])},
        "e2019": {"nombre": txt(r, COLS["n2019"]), "padron": num(r, COLS["p2019"])},
        "e2021": {"nombre": txt(r, COLS["n2021"]), "padron": num(r, COLS["p2021"]),
                  "dni": None if dni is None else str(dni).strip()},
    })

claves = [f"E{o['etapa']}-{o['bloque']}-{o['numero']}" for o in out]
assert len(claves) == len(set(claves)), "claves de puesto duplicadas en el Excel"

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=2)

print(f"filas emitidas : {len(out)}")
print(f"descartadas    : {len(descartadas)} {descartadas}")
for k in ["e2014", "e2017", "e2019", "e2021"]:
    print(f"  {k}: titulares={sum(1 for o in out if o[k]['nombre'])}"
          f" padron={sum(1 for o in out if o[k]['padron'] is not None)}")
print(f"→ {OUT}")
```

- [ ] **Step 2: Ejecutar y verificar los conteos**

Run: `python prisma/import-historico-clean.py "c:\Users\anonimo\Documents\2026\mercado milagros\2026 ARCHIVOS\PADRON\PADRON EN EXCEL\RELACION DE PUESTOS (version 5).xlsx" prisma/_historico.json`

Expected — estos números están medidos y no son aproximados:

```
filas emitidas : 704
descartadas    : 3 [(709, 'PUESTOS SIN EMPADRONAR', 704), (710, None, 296), (711, None, 408)]
  e2014: titulares=259 padron=256
  e2017: titulares=704 padron=524
  e2019: titulares=419 padron=405
  e2021: titulares=704 padron=534
```

**Si `filas emitidas` es 408 en vez de 704**, caíste en la trampa del `0` falsy: las 296 filas de Etapa 1 se están descartando. Revisa la comparación `et_raw is None`.

- [ ] **Step 3: Commit**

```bash
git add prisma/import-historico-clean.py
git commit -m "feat(padron): limpiador del Excel histórico a JSON"
```

**No añadas `prisma/_historico.json`**: `/prisma/_*` está en `.gitignore`. El JSON es un artefacto regenerable, no una fuente. Queda en el árbol para que la Task 3 lo consuma.

---

### Task 3: Importador

**Files:**
- Create: `src/lib/padron/searchKey.ts`
- Create: `prisma/import-historico.ts`

**Interfaces:**
- Consumes: `prisma/_historico.json` (Task 2), modelos de Task 1.
- Produces: `buildPadronRegistroSearchKey(parts: { nombreOriginal?: string | null; numeroDocumento?: string | null; numeroPadron?: number | null; puestoCodigo?: string | null }): string` exportado desde `src/lib/padron/searchKey.ts`. Datos poblados en BD para Tasks 4-7.

- [ ] **Step 1: Escribir el constructor de searchKey**

`src/lib/padron/searchKey.ts`:

```ts
import { normalizeToken } from "@/lib/socios/normalize";

// searchKey de un registro histórico. Usa `nombreOriginal` (no `nombre`) a
// propósito: así la anotación incrustada —"(vendido 2023)", "(falta pagar
// trapaso)"— también es buscable. Sin `server-only`: lo usan el importador
// (script Node) y la app.
export function buildPadronRegistroSearchKey(parts: {
  nombreOriginal?: string | null;
  numeroDocumento?: string | null;
  numeroPadron?: number | null;
  puestoCodigo?: string | null;
}): string {
  return [
    parts.nombreOriginal,
    parts.numeroDocumento,
    parts.numeroPadron != null ? String(parts.numeroPadron) : null,
    parts.puestoCodigo,
  ]
    .filter((p): p is string => Boolean(p))
    .map(normalizeToken)
    .join(" ");
}
```

- [ ] **Step 2: Escribir el importador**

`prisma/import-historico.ts`:

```ts
// Importa el padrón histórico (4 empadronamientos) desde prisma/_historico.json.
//   npx tsx prisma/import-historico.ts              DRY-RUN: solo reporta
//   npx tsx prisma/import-historico.ts --apply      escribe
//   npx tsx prisma/import-historico.ts --rollback   borra lo importado
//
// El puesto se identifica por (etapa, bloque, número) — la parcela se ignora,
// igual que en import-etapa.ts. El enlace a socio se hace SOLO por DNI y solo
// el empadronamiento 2021 lo trae.
import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { normalizeToken } from "../src/lib/socios/normalize";
import { buildPadronRegistroSearchKey } from "../src/lib/padron/searchKey";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const FUENTE = "[Import Excel] RELACION DE PUESTOS (version 5).xlsx · hoja PADRON 2022";

const GESTIONES = [
  { key: "e2014", anio: 2014, nombre: "Gestión 2014", orden: 1 },
  { key: "e2017", anio: 2017, nombre: "Santos 2017", orden: 2 },
  { key: "e2019", anio: 2019, nombre: "Raymundo 2019", orden: 3 },
  { key: "e2021", anio: 2021, nombre: "Gestión Santos 2021", orden: 4 },
] as const;

type Celda = { nombre: string | null; padron: number | null; dni?: string | null };
type Fila = {
  filaExcel: number; etapa: number; bloque: string; numero: number;
  e2014: Celda; e2017: Celda; e2019: Celda; e2021: Celda;
};

// 5-7 dígitos → el Excel perdió el 0 a la izquierda. 9+ → dedazo: NO se corrige.
// Quitarle un dígito a un documento de identidad es adivinar; se reporta y lo
// resuelve la Fase 2 de reconciliación con la directiva a la vista.
function normDni(raw: unknown): string | null {
  const s = String(raw ?? "").trim().replace(/\s+/g, "");
  if (!/^\d+$/.test(s)) return null;
  if (s.length >= 5 && s.length <= 7) return s.padStart(8, "0");
  if (s.length === 8) return s;
  return null;
}

// Separa "APELLIDOS NOMBRES (vendido 2023)" en nombre limpio + anotación.
function partirNombre(raw: string | null): { nombre: string | null; observacion: string | null } {
  if (!raw) return { nombre: null, observacion: null };
  const m = raw.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
  if (!m) return { nombre: raw.replace(/\s+/g, " ").trim() || null, observacion: null };
  return {
    nombre: m[1].replace(/\s+/g, " ").trim() || null,
    observacion: m[2].trim() || null,
  };
}

// Tokens significativos de un nombre, para el VETO (nunca para unir).
function tokensNombre(s: string | null): Set<string> {
  return new Set(
    normalizeToken(s ?? "")
      .replace(/\([^)]*\)/g, " ")
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2),
  );
}

async function main() {
  const apply = process.argv.includes("--apply");
  const rollback = process.argv.includes("--rollback");

  if (rollback) {
    // Solo borra los empadronamientos importados (por `fuente`). Si algún día el
    // sistema registra el empadronamiento 2026 de forma nativa, este rollback no
    // debe tocarlo. Los registros caen por ON DELETE CASCADE.
    const del = await prisma.empadronamiento.deleteMany({ where: { fuente: FUENTE } });
    console.log(`rollback: ${del.count} empadronamiento(s) eliminados (registros en cascada)`);
    return;
  }

  const filas: Fila[] = JSON.parse(
    readFileSync(path.join(process.cwd(), "prisma", "_historico.json"), "utf8"),
  );

  const puestos = await prisma.puesto.findMany({
    select: { id: true, etapa: true, bloque: true, numero: true, codigo: true },
  });
  const puestoPorLlave = new Map(
    puestos.map((p) => [`${p.etapa}-${p.bloque}-${p.numero}`, p]),
  );

  const socios = await prisma.socio.findMany({
    select: { id: true, numeroDocumento: true, apellidoPaterno: true, apellidoMaterno: true, nombres: true },
  });
  const socioPorDni = new Map(socios.map((s) => [s.numeroDocumento, s]));

  const stats = {
    sinPuesto: 0, registros: 0, conDni: 0,
    enlazados: 0, vetados: 0, dniInvalido: 0, dniSinSocio: 0,
  };
  const incidencias: string[] = [];

  type Pendiente = {
    gestionKey: string; puestoId: string; filaExcel: number;
    nombreOriginal: string | null; nombre: string | null; observacion: string | null;
    numeroPadron: number | null; numeroDocumento: string | null;
    socioId: string | null; searchKey: string;
  };
  const pendientes: Pendiente[] = [];

  for (const f of filas) {
    const p = puestoPorLlave.get(`${f.etapa}-${f.bloque}-${f.numero}`);
    if (!p) {
      stats.sinPuesto++;
      incidencias.push(`SIN PUESTO EN BD: E${f.etapa}-${f.bloque}-${f.numero} (fila ${f.filaExcel})`);
      continue;
    }
    for (const g of GESTIONES) {
      const celda = f[g.key] as Celda;
      if (!celda.nombre && celda.padron === null) continue; // sin dato = sin fila

      const { nombre, observacion: anotacion } = partirNombre(celda.nombre);
      const notas: string[] = [];
      if (anotacion) notas.push(anotacion);

      let numeroDocumento: string | null = null;
      let socioId: string | null = null;

      if (g.key === "e2021" && celda.dni != null && String(celda.dni).trim() !== "") {
        stats.conDni++;
        const dni = normDni(celda.dni);
        if (!dni) {
          stats.dniInvalido++;
          notas.push(`DNI inválido en origen: ${String(celda.dni).trim()}`);
          incidencias.push(`DNI INVÁLIDO ${p.codigo}: "${String(celda.dni).trim()}" (${nombre ?? "?"})`);
        } else {
          numeroDocumento = dni;
          const s = socioPorDni.get(dni);
          if (!s) {
            stats.dniSinSocio++;
            incidencias.push(`DNI SIN SOCIO ${p.codigo}: ${dni} (${nombre ?? "?"})`);
          } else {
            // VETO: el nombre no crea el enlace, solo puede impedirlo. Si el DNI
            // calza con un socio de nombre ajeno, el dato de origen es sospechoso
            // y enlazar sería peor que no hacerlo.
            const tSocio = tokensNombre(`${s.apellidoPaterno} ${s.apellidoMaterno ?? ""} ${s.nombres}`);
            const comparte = [...tokensNombre(nombre)].some((t) => tSocio.has(t));
            if (comparte) {
              socioId = s.id;
              stats.enlazados++;
            } else {
              stats.vetados++;
              notas.push(`enlace vetado: DNI ${dni} corresponde a otro nombre en el padrón`);
              incidencias.push(
                `VETADO ${p.codigo}: dni=${dni} excel="${nombre}" vs bd="${s.apellidoPaterno} ${s.nombres}"`,
              );
            }
          }
        }
      }

      pendientes.push({
        gestionKey: g.key,
        puestoId: p.id,
        filaExcel: f.filaExcel,
        nombreOriginal: celda.nombre,
        nombre,
        observacion: notas.length ? notas.join(" · ") : null,
        numeroPadron: celda.padron,
        numeroDocumento,
        socioId,
        searchKey: buildPadronRegistroSearchKey({
          nombreOriginal: celda.nombre,
          numeroDocumento,
          numeroPadron: celda.padron,
          puestoCodigo: p.codigo,
        }),
      });
      stats.registros++;
    }
  }

  console.log(`\nfilas leídas        : ${filas.length}`);
  console.log(`puestos sin resolver: ${stats.sinPuesto}`);
  console.log(`registros a escribir: ${stats.registros}`);
  for (const g of GESTIONES) {
    console.log(`  ${g.nombre}: ${pendientes.filter((x) => x.gestionKey === g.key).length}`);
  }
  console.log(`\nceldas con DNI 2021 : ${stats.conDni}`);
  console.log(`  enlazados         : ${stats.enlazados}`);
  console.log(`  vetados           : ${stats.vetados}`);
  console.log(`  DNI sin socio     : ${stats.dniSinSocio}`);
  console.log(`  DNI inválido      : ${stats.dniInvalido}`);
  if (incidencias.length) {
    console.log(`\nincidencias (${incidencias.length}):`);
    incidencias.forEach((i) => console.log("  " + i));
  }

  if (!apply) {
    console.log("\nDRY-RUN: nada se escribió. Repite con --apply.");
    return;
  }

  const idPorGestion = new Map<string, string>();
  for (const g of GESTIONES) {
    const e = await prisma.empadronamiento.upsert({
      where: { anio: g.anio },
      update: { nombre: g.nombre, orden: g.orden, fuente: FUENTE },
      create: { anio: g.anio, nombre: g.nombre, orden: g.orden, fuente: FUENTE },
    });
    idPorGestion.set(g.key, e.id);
  }

  let escritos = 0;
  for (const x of pendientes) {
    const empadronamientoId = idPorGestion.get(x.gestionKey)!;
    const datos = {
      nombreOriginal: x.nombreOriginal, nombre: x.nombre, observacion: x.observacion,
      numeroPadron: x.numeroPadron, numeroDocumento: x.numeroDocumento,
      socioId: x.socioId, searchKey: x.searchKey, filaExcel: x.filaExcel,
    };
    await prisma.padronRegistro.upsert({
      where: { empadronamientoId_puestoId: { empadronamientoId, puestoId: x.puestoId } },
      update: datos,
      create: { empadronamientoId, puestoId: x.puestoId, ...datos },
    });
    escritos++;
  }
  console.log(`\nAPLICADO: ${escritos} registros (upsert, idempotente).`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 3: Ejecutar el dry-run y contrastar contra los números medidos**

Run: `npx tsx prisma/import-historico.ts`

Expected — cifras verificadas contra la BD:

```
filas leídas        : 704
puestos sin resolver: 0
registros a escribir: 2090
  Gestión 2014: 262
  Santos 2017: 704
  Raymundo 2019: 420
  Gestión Santos 2021: 704

celdas con DNI 2021 : 616
  enlazados         : 607
  vetados           : 2
  DNI sin socio     : 5
  DNI inválido      : 2
```

Las incidencias deben incluir estos dos vetos exactos:

```
VETADO E1-H-18: dni=45029431 excel="BARRIONUEVO  QUISPE LUISA ZENAIDA" vs bd="CARIAPAZA MARGOTH NERY"
VETADO E2-M-12: dni=25214362 excel="ESPINOZA LARA HILARIA" vs bd="SONCCO EUFRACIA"
```

**`puestos sin resolver` DEBE ser 0.** Cualquier otro valor significa que la llave `(etapa, bloque, número)` se rompió y hay que parar, no seguir.

Los conteos por gestión son ligeramente mayores que los titulares del Task 2 (262 vs 259, 420 vs 419) porque se escribe registro también cuando hay n.º de padrón sin nombre — 4 casos reales en la fuente. Es correcto: el dato existe.

- [ ] **Step 4: Aplicar**

Run: `npx tsx prisma/import-historico.ts --apply`
Expected: termina con `APLICADO: 2090 registros (upsert, idempotente).`

- [ ] **Step 5: Verificar idempotencia**

Run: `npx tsx prisma/import-historico.ts --apply`
Expected: `APLICADO: 2090 registros` otra vez, **sin duplicados**. Confirmar:

Run: `npx tsx -e "import 'dotenv/config'; import {PrismaPg} from '@prisma/adapter-pg'; import {PrismaClient} from './src/generated/prisma/client'; const p=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})}); p.padronRegistro.count().then(c=>console.log('registros:',c)).finally(()=>p.$disconnect())"`
Expected: `registros: 2090`

- [ ] **Step 6: Verificar el rollback y volver a aplicar**

Run: `npx tsx prisma/import-historico.ts --rollback`
Expected: `rollback: 4 empadronamiento(s) eliminados (registros en cascada)`

Confirmar que `padronRegistro.count()` es 0 y que **socios y puestos siguen intactos** (420 y 708). Luego reaplicar:

Run: `npx tsx prisma/import-historico.ts --apply`

- [ ] **Step 7: Commit**

```bash
git add src/lib/padron/searchKey.ts prisma/import-historico.ts
git commit -m "feat(padron): importador del histórico con enlace por DNI y veto por nombre"
```

---

### Task 4: Capa de lectura (linaje y antigüedad)

**Files:**
- Create: `src/lib/padron/types.ts`
- Create: `src/lib/padron/historico.ts`
- Create: `prisma/verify-historico.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: modelos de Task 1, datos de Task 3.
- Produces, desde `src/lib/padron/historico.ts`:
  - `getLinajePuesto(puestoId: string): Promise<LinajePuesto | null>`
  - `getAntiguedadSocio(socioId: string): Promise<AntiguedadSocio>`
  - `buscarRegistros(q: string, limit?: number): Promise<RegistroBusqueda[]>`
- Y los tipos `SlotLinaje`, `LinajePuesto`, `AntiguedadPuesto`, `AntiguedadSocio`, `RegistroBusqueda` desde `src/lib/padron/types.ts`.

- [ ] **Step 1: Definir los tipos compartidos**

`src/lib/padron/types.ts`:

```ts
// Tipos del padrón histórico. Archivo SIN `server-only` a propósito: los
// componentes cliente (tabs de los drawers, página de búsqueda) los importan, y
// no pueden tocar `historico.ts`, que sí es server-only.

export type RegistroHistorico = {
  nombre: string | null;
  nombreOriginal: string | null;
  observacion: string | null;
  numeroPadron: number | null;
  numeroDocumento: string | null;
  socioId: string | null;
};

// Un slot por empadronamiento, SIEMPRE los cuatro. `registro: null` significa
// que esa gestión no empadronó ese puesto — la ausencia es información y la UI
// debe mostrarla, no omitirla.
export type SlotLinaje = {
  anio: number;
  gestion: string;
  orden: number;
  registro: RegistroHistorico | null;
  cambioDeTitular: boolean;
};

export type LinajePuesto = {
  puestoId: string;
  puestoCodigo: string;
  slots: SlotLinaje[];
  titularActual: { socioId: string; nombre: string } | null;
};

export type AntiguedadPuesto = {
  puestoId: string;
  puestoCodigo: string;
  desdeAnio: number | null;
  desdeGestion: string | null;
};

// `desdeAnio`/`desdeGestion` es el agregado: el empadronamiento más antiguo
// entre los puestos del socio. `puestoQueLoJustifica` acompaña siempre al
// agregado en la UI — una antigüedad que no se puede auditar de un vistazo no
// sirve para asignar un derecho.
export type AntiguedadSocio = {
  desdeAnio: number | null;
  desdeGestion: string | null;
  puestoQueLoJustifica: string | null;
  porPuesto: AntiguedadPuesto[];
};

export type RegistroBusqueda = {
  id: string;
  anio: number;
  gestion: string;
  puestoCodigo: string;
  nombreOriginal: string | null;
  numeroPadron: number | null;
  numeroDocumento: string | null;
  socioId: string | null;
};
```

- [ ] **Step 2: Escribir la capa de lectura**

`src/lib/padron/historico.ts`:

```ts
import "server-only";
import { prisma } from "@/lib/prisma";
import { normalizeToken, searchTokens } from "@/lib/socios/normalize";
import type {
  AntiguedadSocio, AntiguedadPuesto, LinajePuesto, RegistroBusqueda, SlotLinaje,
} from "./types";

// Firma normalizada de un nombre para comparar titulares entre gestiones: sin
// tildes, sin anotaciones entre paréntesis, sin palabras cortas, y ORDENADA —
// así "MONDRAGON CONDORI JULIA" y "JULIA MONDRAGON CONDORI" son el mismo
// titular. El nombre solo se usa para comparar dentro de UN MISMO puesto; nunca
// para unir registros entre puestos distintos.
function firmaNombre(s: string | null): string {
  return normalizeToken(s ?? "")
    .replace(/\([^)]*\)/g, " ")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2)
    .sort()
    .join(" ");
}

export async function getLinajePuesto(puestoId: string): Promise<LinajePuesto | null> {
  const puesto = await prisma.puesto.findUnique({
    where: { id: puestoId },
    select: {
      id: true, codigo: true,
      asignaciones: {
        where: { hasta: null },
        select: {
          socio: {
            select: { id: true, apellidoPaterno: true, apellidoMaterno: true, nombres: true },
          },
        },
      },
    },
  });
  if (!puesto) return null;

  const gestiones = await prisma.empadronamiento.findMany({ orderBy: { orden: "asc" } });
  const registros = await prisma.padronRegistro.findMany({ where: { puestoId } });
  const porGestion = new Map(registros.map((r) => [r.empadronamientoId, r]));

  // `cambioDeTitular` se compara contra el ÚLTIMO slot CON DATO, no contra el
  // inmediatamente anterior: 2014 y 2019 fueron empadronamientos incompletos, y
  // comparar contra un hueco reportaría un traspaso que nunca ocurrió.
  let ultimaFirma: string | null = null;
  const slots: SlotLinaje[] = gestiones.map((g) => {
    const r = porGestion.get(g.id);
    if (!r) {
      return { anio: g.anio, gestion: g.nombre, orden: g.orden, registro: null, cambioDeTitular: false };
    }
    const firma = firmaNombre(r.nombre ?? r.nombreOriginal);
    const cambio = ultimaFirma !== null && firma !== "" && firma !== ultimaFirma;
    if (firma !== "") ultimaFirma = firma;
    return {
      anio: g.anio, gestion: g.nombre, orden: g.orden,
      registro: {
        nombre: r.nombre, nombreOriginal: r.nombreOriginal, observacion: r.observacion,
        numeroPadron: r.numeroPadron, numeroDocumento: r.numeroDocumento, socioId: r.socioId,
      },
      cambioDeTitular: cambio,
    };
  });

  const a = puesto.asignaciones[0];
  return {
    puestoId: puesto.id,
    puestoCodigo: puesto.codigo,
    slots,
    titularActual: a
      ? {
          socioId: a.socio.id,
          nombre: [a.socio.apellidoPaterno, a.socio.apellidoMaterno, a.socio.nombres]
            .filter(Boolean).join(" "),
        }
      : null,
  };
}

export async function getAntiguedadSocio(socioId: string): Promise<AntiguedadSocio> {
  const vacio: AntiguedadSocio = {
    desdeAnio: null, desdeGestion: null, puestoQueLoJustifica: null, porPuesto: [],
  };

  const socio = await prisma.socio.findUnique({
    where: { id: socioId },
    select: {
      apellidoPaterno: true, apellidoMaterno: true, nombres: true,
      asignacionesPuesto: {
        where: { hasta: null },
        select: { puesto: { select: { id: true, codigo: true } } },
      },
    },
  });
  if (!socio || socio.asignacionesPuesto.length === 0) return vacio;

  const firmaActual = firmaNombre(
    [socio.apellidoPaterno, socio.apellidoMaterno, socio.nombres].filter(Boolean).join(" "),
  );

  const porPuesto: AntiguedadPuesto[] = [];
  for (const asig of socio.asignacionesPuesto) {
    const linaje = await getLinajePuesto(asig.puesto.id);
    if (!linaje) continue;

    // Se recorre de la gestión MÁS RECIENTE hacia atrás mientras el titular siga
    // siendo el mismo. Al primer titular distinto se corta: antes de ese punto el
    // puesto era de otra persona.
    let desdeAnio: number | null = null;
    let desdeGestion: string | null = null;
    for (const slot of [...linaje.slots].reverse()) {
      if (!slot.registro) continue;
      const firma = firmaNombre(slot.registro.nombre ?? slot.registro.nombreOriginal);
      if (firma === "" || firma !== firmaActual) break;
      desdeAnio = slot.anio;
      desdeGestion = slot.gestion;
    }
    porPuesto.push({
      puestoId: asig.puesto.id, puestoCodigo: asig.puesto.codigo, desdeAnio, desdeGestion,
    });
  }

  // Agregado: el empadronamiento MÁS ANTIGUO entre sus puestos. Un socio con un
  // puesto desde 2014 y otro comprado en 2021 es un socio de 2014.
  const conDato = porPuesto.filter((p) => p.desdeAnio !== null);
  if (conDato.length === 0) return { ...vacio, porPuesto };
  const masAntiguo = conDato.reduce((a, b) => (a.desdeAnio! <= b.desdeAnio! ? a : b));
  return {
    desdeAnio: masAntiguo.desdeAnio,
    desdeGestion: masAntiguo.desdeGestion,
    puestoQueLoJustifica: masAntiguo.puestoCodigo,
    porPuesto,
  };
}

export async function buscarRegistros(q: string, limit = 50): Promise<RegistroBusqueda[]> {
  const tokens = searchTokens(q);
  if (tokens.length === 0) return [];

  // Búsqueda tokenizada obligatoria (AGENTS.md): CADA token debe aparecer, en
  // cualquier orden. Un `contains` del término completo falla por orden de
  // palabras — p. ej. "Julia Mondragón" contra "mondragon … julia".
  const filas = await prisma.padronRegistro.findMany({
    where: { AND: tokens.map((t) => ({ searchKey: { contains: t } })) },
    take: limit,
    orderBy: [{ empadronamiento: { orden: "desc" } }, { puesto: { codigo: "asc" } }],
    select: {
      id: true, nombreOriginal: true, numeroPadron: true, numeroDocumento: true, socioId: true,
      empadronamiento: { select: { anio: true, nombre: true } },
      puesto: { select: { codigo: true } },
    },
  });

  return filas.map((r) => ({
    id: r.id,
    anio: r.empadronamiento.anio,
    gestion: r.empadronamiento.nombre,
    puestoCodigo: r.puesto.codigo,
    nombreOriginal: r.nombreOriginal,
    numeroPadron: r.numeroPadron,
    numeroDocumento: r.numeroDocumento,
    socioId: r.socioId,
  }));
}
```

- [ ] **Step 3: Escribir el verificador (falla antes de que exista el dato correcto)**

`prisma/verify-historico.ts`:

```ts
import "dotenv/config";
import assert from "node:assert/strict";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  console.log("→ Los 4 empadronamientos existen y están ordenados");
  const gestiones = await prisma.empadronamiento.findMany({ orderBy: { orden: "asc" } });
  assert.equal(gestiones.length, 4, "deben existir 4 empadronamientos");
  assert.deepEqual(gestiones.map((g) => g.anio), [2014, 2017, 2019, 2021]);

  console.log("→ Conteo de registros por gestión");
  const esperado: Record<number, number> = { 2014: 262, 2017: 704, 2019: 420, 2021: 704 };
  for (const g of gestiones) {
    const n = await prisma.padronRegistro.count({ where: { empadronamientoId: g.id } });
    assert.equal(n, esperado[g.anio], `${g.nombre}: esperaba ${esperado[g.anio]}, hay ${n}`);
  }

  console.log("→ Todo registro apunta a un puesto real (integridad de la llave)");
  const total = await prisma.padronRegistro.count();
  assert.equal(total, 2090, `total de registros: esperaba 2090, hay ${total}`);

  console.log("→ El enlace a socio solo existe donde hay DNI");
  const enlazadosSinDni = await prisma.padronRegistro.count({
    where: { socioId: { not: null }, numeroDocumento: null },
  });
  assert.equal(enlazadosSinDni, 0, "no puede haber enlace a socio sin DNI que lo respalde");

  console.log("→ Solo el empadronamiento 2021 trae documento");
  const g2021 = gestiones.find((g) => g.anio === 2021)!;
  const docsFuera = await prisma.padronRegistro.count({
    where: { numeroDocumento: { not: null }, empadronamientoId: { not: g2021.id } },
  });
  assert.equal(docsFuera, 0, "ninguna gestión anterior a 2021 tiene DNI en la fuente");

  console.log("→ Enlaces efectivos");
  const enlazados = await prisma.padronRegistro.count({ where: { socioId: { not: null } } });
  assert.equal(enlazados, 607, `esperaba 607 enlaces, hay ${enlazados}`);

  console.log("→ Unicidad (empadronamiento, puesto)");
  const dup = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*)::bigint AS n FROM (
      SELECT "empadronamientoId", "puestoId"
      FROM "PadronRegistro" GROUP BY 1,2 HAVING COUNT(*) > 1
    ) t`;
  assert.equal(Number(dup[0].n), 0, "hay pares (empadronamiento, puesto) duplicados");

  console.log("\n✓ verify-historico OK");
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 4: Ejecutar el verificador**

Run: `npx tsx prisma/verify-historico.ts`
Expected: termina con `✓ verify-historico OK`, sin aserciones fallidas.

Si `total de registros` falla, revisa el dry-run del Task 3: el importador y el verificador deben coincidir en el mismo número (2090).

- [ ] **Step 5: Incorporarlo a la suite**

En `package.json`, añadir al final del script `test:db`:

```json
"test:db": "tsx prisma/verify-cuotas.ts && tsx prisma/verify-pago-monto.ts && tsx prisma/verify-puestos.ts && tsx prisma/verify-caja.ts && tsx prisma/verify-guardiania.ts && tsx prisma/verify-historico.ts"
```

- [ ] **Step 6: Verificar tipos**

Run: `npx tsc --noEmit 2>&1 | grep -vE '^\.next'`
Expected: sin salida.

- [ ] **Step 7: Commit**

```bash
git add src/lib/padron/types.ts src/lib/padron/historico.ts prisma/verify-historico.ts package.json
git commit -m "feat(padron): capa de lectura de linaje y antigüedad + verificador"
```

---

### Task 5: Tab «Historial» en el drawer de puesto

**Files:**
- Modify: `src/app/(admin)/puestos/actions.ts`
- Create: `src/app/(admin)/puestos/PuestoHistorialTab.tsx`
- Modify: `src/app/(admin)/puestos/PuestoDetailDrawer.tsx`

**Interfaces:**
- Consumes: `getLinajePuesto` y el tipo `LinajePuesto` (Task 4).
- Produces: server action `getHistoricoPuesto(puestoId: string): Promise<{ ok: boolean; data?: LinajePuesto | null; error?: string }>` y el componente `<PuestoHistorialTab puestoId={string} />`.

- [ ] **Step 1: Añadir la server action**

En `src/app/(admin)/puestos/actions.ts`, siguiendo el patrón de permisos y forma de retorno `{ ok, data, error }` ya usado en el archivo:

```ts
import { getLinajePuesto } from "@/lib/padron/historico";
import type { LinajePuesto } from "@/lib/padron/types";

export async function getHistoricoPuesto(
  puestoId: string,
): Promise<{ ok: boolean; data?: LinajePuesto | null; error?: string }> {
  try {
    await requirePermission("puestos.read");
    return { ok: true, data: await getLinajePuesto(puestoId) };
  } catch {
    return { ok: false, error: "No se pudo cargar el historial del puesto." };
  }
}
```

Ajusta el `import` de `requirePermission` al que ya exista en el archivo (`@/lib/auth/server`).

- [ ] **Step 2: Escribir el componente del tab**

`src/app/(admin)/puestos/PuestoHistorialTab.tsx`, copiando el patrón de carga de `SocioCuotasTab.tsx` (useEffect + flag `cancelled`):

```tsx
"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/admin/Icon";
import { getHistoricoPuesto } from "./actions";
import type { LinajePuesto } from "@/lib/padron/types";

// Línea de tiempo del puesto a través de los cuatro empadronamientos. Los slots
// SIN registro se muestran explícitamente: que una gestión no empadronara este
// puesto es información, no un hueco que convenga esconder.
export function PuestoHistorialTab({ puestoId }: { puestoId: string }) {
  const [data, setData] = useState<LinajePuesto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await getHistoricoPuesto(puestoId);
      if (cancelled) return;
      if (r.ok) setData(r.data ?? null);
      else setError(r.error ?? "Error");
      setCargando(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [puestoId]);

  if (error) return <p className="soc-error">{error}</p>;
  if (cargando) return <p style={{ color: "var(--text-muted)" }}>Cargando…</p>;
  if (!data || data.slots.length === 0) {
    return (
      <p style={{ color: "var(--text-muted)" }}>
        No hay padrón histórico cargado para este puesto.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {data.slots.map((s) => (
        <div
          key={s.orden}
          style={{
            borderLeft: "2px solid var(--border)",
            paddingLeft: 12,
            opacity: s.registro ? 1 : 0.55,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <strong style={{ fontSize: 13 }}>{s.gestion}</strong>
            {s.cambioDeTitular && (
              <span className="badge badge--amber" title="El titular cambió respecto de la gestión anterior con registro">
                <Icon name="external" size={11} /> Cambió de titular
              </span>
            )}
          </div>

          {s.registro ? (
            <>
              <div style={{ fontSize: 14 }}>{s.registro.nombre ?? "—"}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {s.registro.numeroPadron != null && <>Padrón N.° {s.registro.numeroPadron}</>}
                {s.registro.numeroDocumento && <> · DNI {s.registro.numeroDocumento}</>}
                {s.registro.socioId && <> · <b>identidad verificada</b></>}
              </div>
              {s.registro.observacion && (
                <div style={{ fontSize: 12, color: "var(--warn, #b45309)", marginTop: 2 }}>
                  {s.registro.observacion}
                </div>
              )}
            </>
          ) : (
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Sin registro</div>
          )}
        </div>
      ))}

      <div style={{ borderLeft: "2px solid var(--accent, #2563eb)", paddingLeft: 12 }}>
        <strong style={{ fontSize: 13 }}>Titular actual</strong>
        <div style={{ fontSize: 14 }}>{data.titularActual?.nombre ?? "Sin asignar"}</div>
      </div>
    </div>
  );
}
```

`badge badge--amber` son clases reales del proyecto (ver los modificadores en los `.css` de `src/app/(admin)`). No crees clases nuevas.

- [ ] **Step 3: Dar de alta el tab en el drawer**

En `src/app/(admin)/puestos/PuestoDetailDrawer.tsx`:

1. Importar el componente: `import { PuestoHistorialTab } from "./PuestoHistorialTab";`
2. Ampliar la unión de tipo en la línea 26: `type Tab = "datos" | "asignacion" | "historial";`
3. Añadir el botón dentro del `<div className="soc-tabs">` (después del de `asignacion`, ~línea 166):

```tsx
<button
  className={`soc-tab ${tab === "historial" ? "is-active" : ""}`}
  onClick={() => setTab("historial")}
>
  Historial
</button>
```

4. Renderizar el contenido. El drawer usa hoy un ternario `{tab === "datos" ? (…) : (…)}`; conviértelo a comprobaciones independientes por tab para que el tercero no quede inalcanzable:

```tsx
{tab === "historial" && <PuestoHistorialTab puestoId={puesto.id} />}
```

Ajusta `puesto.id` al nombre real de la prop del drawer.

- [ ] **Step 4: Verificar tipos y lint**

Run: `npx tsc --noEmit 2>&1 | grep -vE '^\.next'`
Expected: sin salida.

Run: `npx eslint "src/app/(admin)/puestos"`
Expected: sin salida.

- [ ] **Step 5: Verificar en la app**

Levanta `npm run dev`, abre `/puestos`, abre el drawer de **E1-A-12** y entra a «Historial».
Expected: cuatro gestiones en orden (Gestión 2014 → Santos 2017 → Raymundo 2019 → Gestión Santos 2021) más el titular actual. Los puestos sin registro en 2014 deben decir «Sin registro» atenuado, no desaparecer.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(admin)/puestos"
git commit -m "feat(padron): tab de historial en el drawer de puesto"
```

---

### Task 6: Tab «Padrón histórico» en el drawer de socio

**Files:**
- Modify: `src/app/(admin)/socios/actions.ts`
- Create: `src/app/(admin)/socios/SocioPadronTab.tsx`
- Modify: `src/app/(admin)/socios/SocioDetailDrawer.tsx`

**Interfaces:**
- Consumes: `getAntiguedadSocio` y el tipo `AntiguedadSocio` (Task 4).
- Produces: server action `getPadronHistoricoSocio(socioId: string): Promise<{ ok: boolean; data?: AntiguedadSocio; error?: string }>` y `<SocioPadronTab socioId={string} />`.

**El tab se llama `padron`, NO `historial`:** el drawer de socio ya tiene un tab `historial` (log de estados) en la línea 25. Reutilizar ese identificador rompe el tab existente.

- [ ] **Step 1: Añadir la server action**

En `src/app/(admin)/socios/actions.ts`:

```ts
import { getAntiguedadSocio } from "@/lib/padron/historico";
import type { AntiguedadSocio } from "@/lib/padron/types";

export async function getPadronHistoricoSocio(
  socioId: string,
): Promise<{ ok: boolean; data?: AntiguedadSocio; error?: string }> {
  try {
    await requirePermission("socios.read");
    return { ok: true, data: await getAntiguedadSocio(socioId) };
  } catch {
    return { ok: false, error: "No se pudo cargar el padrón histórico del socio." };
  }
}
```

- [ ] **Step 2: Escribir el componente del tab**

`src/app/(admin)/socios/SocioPadronTab.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { getPadronHistoricoSocio } from "./actions";
import type { AntiguedadSocio } from "@/lib/padron/types";

// Antigüedad del socio. El agregado NUNCA se muestra solo: va siempre con el
// puesto que lo justifica, porque antes de 2021 la fuente no trae documento y la
// identidad se infiere por continuidad de nombre en un puesto concreto.
export function SocioPadronTab({ socioId }: { socioId: string }) {
  const [data, setData] = useState<AntiguedadSocio | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await getPadronHistoricoSocio(socioId);
      if (cancelled) return;
      if (r.ok) setData(r.data ?? null);
      else setError(r.error ?? "Error");
      setCargando(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [socioId]);

  if (error) return <p className="soc-error">{error}</p>;
  if (cargando) return <p style={{ color: "var(--text-muted)" }}>Cargando…</p>;
  if (!data) return null;

  if (data.porPuesto.length === 0) {
    return (
      <p style={{ color: "var(--text-muted)" }}>
        El socio no tiene puestos vigentes, así que no hay antigüedad derivable del padrón
        histórico.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="deuda-banner">
        <div>
          <div className="deuda-banner__label">
            {data.desdeGestion ? `Socio desde ${data.desdeGestion}` : "Sin antigüedad registrada"}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {data.puestoQueLoJustifica
              ? `Acreditado por el puesto ${data.puestoQueLoJustifica}.`
              : "Ninguno de sus puestos figura en los empadronamientos anteriores."}
          </div>
        </div>
      </div>

      <div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>
          Detalle por puesto
        </div>
        {data.porPuesto.map((p) => (
          <div
            key={p.puestoId}
            style={{
              display: "flex", justifyContent: "space-between",
              padding: "6px 0", borderBottom: "1px solid var(--border)",
            }}
          >
            <span style={{ fontFamily: "monospace" }}>{p.puestoCodigo}</span>
            <span style={{ color: p.desdeGestion ? undefined : "var(--text-muted)" }}>
              {p.desdeGestion ?? "Sin registro previo"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

Si `deuda-banner` no encaja visualmente aquí, usa el contenedor de resumen que ya use el drawer; no crees clases nuevas para esto.

- [ ] **Step 3: Dar de alta el tab en el drawer**

En `src/app/(admin)/socios/SocioDetailDrawer.tsx`:

1. `import { SocioPadronTab } from "./SocioPadronTab";`
2. Línea 25 — ampliar la unión **sin tocar `historial`**:

```tsx
type Tab = "datos" | "puestos" | "adjuntos" | "cuotas" | "historial" | "padron";
```

3. Añadir el botón tras el de `cuotas` (~línea 274):

```tsx
<button
  className={`soc-tab ${tab === "padron" ? "is-active" : ""}`}
  onClick={() => setTab("padron")}
>
  Padrón histórico
</button>
```

4. Renderizar junto a los demás (~línea 387):

```tsx
{tab === "padron" && <SocioPadronTab socioId={socio.id} />}
```

- [ ] **Step 4: Verificar tipos y lint**

Run: `npx tsc --noEmit 2>&1 | grep -vE '^\.next'`
Expected: sin salida.

Run: `npx eslint "src/app/(admin)/socios"`
Expected: sin salida.

- [ ] **Step 5: Verificar en la app**

Abre `/socios`, entra al drawer de un socio con puesto y abre «Padrón histórico».
Expected: un titular tipo «Socio desde Santos 2017» acompañado de «Acreditado por el puesto E1-A-12», más el detalle por puesto. Confirma también que el tab **«Historial» sigue funcionando** (log de estados): es la regresión más probable de esta tarea.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(admin)/socios"
git commit -m "feat(padron): tab de padrón histórico en el drawer de socio"
```

---

### Task 7: Página de búsqueda del histórico

**Files:**
- Modify: `src/app/(admin)/socios/actions.ts`
- Create: `src/app/(admin)/socios/historico/page.tsx`
- Create: `src/app/(admin)/socios/historico/HistoricoClient.tsx`

**Interfaces:**
- Consumes: `buscarRegistros` y el tipo `RegistroBusqueda` (Task 4).
- Produces: server action `buscarPadronHistorico(q: string): Promise<{ ok: boolean; data?: RegistroBusqueda[]; error?: string }>` y la ruta `/socios/historico`.

Se ubica bajo `/socios` siguiendo el patrón ya existente de `socios/registros` y `socios/solicitudes`.

- [ ] **Step 1: Añadir la server action**

En `src/app/(admin)/socios/actions.ts`:

```ts
import { buscarRegistros } from "@/lib/padron/historico";
import type { RegistroBusqueda } from "@/lib/padron/types";

export async function buscarPadronHistorico(
  q: string,
): Promise<{ ok: boolean; data?: RegistroBusqueda[]; error?: string }> {
  try {
    await requirePermission("socios.read");
    return { ok: true, data: await buscarRegistros(q) };
  } catch {
    return { ok: false, error: "No se pudo buscar en el padrón histórico." };
  }
}
```

- [ ] **Step 2: Escribir la página**

`src/app/(admin)/socios/historico/page.tsx`, copiando la cabecera de `src/app/(admin)/socios/registros/page.tsx`:

```tsx
import Link from "next/link";
import { requirePermission } from "@/lib/auth/server";
import { HistoricoClient } from "./HistoricoClient";

export const metadata = { title: "Padrón histórico · Admin" };
export const dynamic = "force-dynamic";

export default async function Page() {
  await requirePermission("socios.read");
  return (
    <div className="socios-page">
      <header className="socios-page__header">
        <div>
          <h1 className="socios-page__title">Padrón histórico</h1>
          <span className="socios-page__sub">
            Empadronamientos 2014, 2017, 2019 y 2021. Busca por nombre, N.° de padrón,
            DNI o código de puesto.
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Link href="/socios" className="btn btn--ghost">
            Volver al padrón
          </Link>
        </div>
      </header>

      <HistoricoClient />
    </div>
  );
}
```

- [ ] **Step 3: Escribir el cliente**

`src/app/(admin)/socios/historico/HistoricoClient.tsx`:

```tsx
"use client";

import { useState } from "react";
import { buscarPadronHistorico } from "../actions";
import type { RegistroBusqueda } from "@/lib/padron/types";

export function HistoricoClient() {
  const [q, setQ] = useState("");
  const [filas, setFilas] = useState<RegistroBusqueda[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function buscar(e: React.FormEvent) {
    e.preventDefault();
    setBuscando(true);
    setError(null);
    const r = await buscarPadronHistorico(q);
    if (r.ok) setFilas(r.data ?? []);
    else setError(r.error ?? "Error");
    setBuscando(false);
  }

  return (
    <div>
      <form onSubmit={buscar} style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <div className="reg-card__search-wrap" style={{ flex: 1 }}>
          <input
            type="search"
            className="reg-card__search-input"
            placeholder="Nombre, N.° de padrón, DNI o puesto (p. ej. E1-A-12)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoComplete="off"
          />
        </div>
        <button className="btn btn--primary" type="submit" disabled={buscando}>
          {buscando ? "Buscando…" : "Buscar"}
        </button>
      </form>

      {error && <p className="soc-error">{error}</p>}

      {filas !== null && filas.length === 0 && (
        <p style={{ color: "var(--text-muted)" }}>
          Sin resultados en el padrón histórico para «{q}».
        </p>
      )}

      {filas !== null && filas.length > 0 && (
        <table className="socios-table">
          <thead>
            <tr>
              <th>Gestión</th>
              <th>Puesto</th>
              <th>Titular</th>
              <th>N.° padrón</th>
              <th>DNI</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.id}>
                <td>{f.gestion}</td>
                <td style={{ fontFamily: "monospace" }}>{f.puestoCodigo}</td>
                <td>{f.nombreOriginal ?? "—"}</td>
                <td>{f.numeroPadron ?? "—"}</td>
                <td>{f.numeroDocumento ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

Clases verificadas contra el proyecto: la tabla es `socios-table` (mismo uso que en `AnunciosClient.tsx`, `CajaClient.tsx`) y el buscador es `reg-card__search-input` dentro de `reg-card__search-wrap` (mismo uso que en `socios/registros/RegistrosList.tsx:143`). **No existen** `soc-table` ni `soc-input`: no los uses.

- [ ] **Step 4: Enlazar desde el padrón**

En `src/app/(admin)/socios/page.tsx`, junto a los enlaces existentes a «Registros» y «Solicitudes», añadir:

```tsx
<Link href="/socios/historico" className="btn btn--ghost">
  Padrón histórico
</Link>
```

- [ ] **Step 5: Verificar la búsqueda tokenizada**

Levanta `npm run dev`, abre `/socios/historico` y busca **`mondragon julia`** y luego **`julia mondragon`**.
Expected: **ambas** consultas devuelven los mismos resultados. Si una devuelve resultados y la otra no, la búsqueda no está tokenizada y viola `AGENTS.md`: revisa que `buscarRegistros` use `searchTokens` con un `AND` por token y no un `contains` del término completo.

Busca también `E1-A-12`: debe listar las gestiones de ese puesto.

- [ ] **Step 6: Verificar tipos y lint**

Run: `npx tsc --noEmit 2>&1 | grep -vE '^\.next'`
Expected: sin salida.

Run: `npx eslint "src/app/(admin)/socios"`
Expected: sin salida.

- [ ] **Step 7: Ejecutar la suite completa**

Run: `npm run test:db`
Expected: todos los verificadores pasan, incluido `✓ verify-historico OK`.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(admin)/socios"
git commit -m "feat(padron): página de búsqueda del padrón histórico"
```

---

## Cobertura del spec

| Sección del spec | Tarea |
|---|---|
| §1 Datos (Prisma) | Task 1 |
| §2.1 Limpiador Python | Task 2 |
| §2.2 Importador (dry-run/apply/rollback) | Task 3 |
| §3 Enlace por DNI con veto | Task 3 |
| §4 Continuidad y antigüedad calculadas | Task 4 |
| §5 Tab de puesto | Task 5 |
| §5 Tab de socio | Task 6 |
| §6 Búsqueda tokenizada | Tasks 4 (`buscarRegistros`) y 7 (UI) |
| §7 Permisos (`socios.read` / `puestos.read`, sin permiso nuevo) | Tasks 5, 6, 7 |
| §8 Casos borde | Tasks 2 (pie de tabla, etapa falsy), 3 (DNI inválido, veto, sin socio), 4 (huecos de gestión, socio sin puesto) |
| §9 Verificación | Task 4 (`verify-historico.ts`) + pasos de verificación de cada tarea |

## Fuera de alcance

Fase 2 (reporte de reconciliación) y Fase 3 (integración anti-fraude en constancia y transferencia), cada una con su propio spec. No las implementes aquí.
