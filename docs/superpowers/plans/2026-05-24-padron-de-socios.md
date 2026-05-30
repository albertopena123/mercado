# Padrón de Socios — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the "Padrón de socios" admin module: registry of market association members with identity, status, attachments, state history. Drops the unused `Incident*` module from the original CONADIS schema.

**Architecture:** Independent `Socio` entity (optional `userId` for future portal). Server-actions pattern matching `usuarios/` and `roles/`. Prisma + Postgres. Two sequential migrations (drop Incident, add Socio). Filesystem-local storage for attachments under `private-uploads/`, served through an auth-checked API route.

**Tech Stack:** Next.js 16.2.6 (App Router), React 19, Prisma 7 + `@prisma/adapter-pg`, Tailwind 4, scrypt-based auth (existing), tsx for scripts.

**Spec:** `docs/superpowers/specs/2026-05-24-padron-de-socios-design.md`

---

## Phase 1 — Schema & permissions

### Task 1: Strip `incidents.*` permissions and roles

**Files:**
- Modify: `src/lib/auth/permissions.ts`

- [ ] **Step 1: Remove `incidents.*` entries from `PERMISSIONS`**

Delete from `PERMISSIONS` array the 5 entries with keys: `incidents.create`, `incidents.read`, `incidents.read:own`, `incidents.write`, `incidents.delete`.

- [ ] **Step 2: Remove `incidents.*` from `ROLE_DEFS`**

For each role (`superadmin`, `admin`, `editor`, `viewer`, `reporter`), strip any string starting with `"incidents."` from the `permissions` array. The `superadmin` role uses `PERMISSIONS.map(p => p.key)` so it auto-updates; the others have inline lists — edit them. The `reporter` role will end with an empty `permissions: []` — leave it that way (the role still exists but grants nothing for now).

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth/permissions.ts
git commit -m "chore(auth): drop incidents.* permissions and role mappings"
```

---

### Task 2: Add `socios.*` permissions and assign to system roles

**Files:**
- Modify: `src/lib/auth/permissions.ts`

- [ ] **Step 1: Add 4 entries to `PERMISSIONS`**

Append to the `PERMISSIONS` array:

```ts
{
  key: "socios.read",
  name: "Ver padrón de socios",
  description: "Listar y consultar socios del mercado",
  category: "Padrón de socios",
},
{
  key: "socios.write",
  name: "Gestionar socios",
  description: "Crear, editar y eliminar adjuntos de socios",
  category: "Padrón de socios",
},
{
  key: "socios.delete",
  name: "Eliminar socios",
  description: "Eliminar socios del padrón (casos excepcionales)",
  category: "Padrón de socios",
},
{
  key: "socios.change-state",
  name: "Cambiar estado del socio",
  description: "Activar, suspender, retirar o marcar como fallecido a un socio",
  category: "Padrón de socios",
},
```

- [ ] **Step 2: Add to system role definitions**

In `ROLE_DEFS`:
- `admin.permissions`: append `"socios.read"`, `"socios.write"`, `"socios.change-state"` (no delete).
- `viewer.permissions`: append `"socios.read"`.
- `superadmin` and `editor`/`reporter` need no change (`superadmin` auto-gets all, `editor`/`reporter` have no socios permissions on purpose).

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth/permissions.ts
git commit -m "feat(auth): add socios.* permissions and assign to system roles"
```

---

### Task 3: Drop Incident from Prisma schema + migration

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `prisma/seed.ts`
- Create: `prisma/migrations/<timestamp>_drop_incident/migration.sql` (Prisma auto-generates)

- [ ] **Step 1: Remove Incident models from `prisma/schema.prisma`**

Delete these models entirely: `IncidentCategory`, `Incident`, `IncidentAttachment`, `IncidentComment`, `IncidentStatusLog`. Delete the enums `IncidentStatus` and `IncidentSeverity`.

In the `User` model, delete the relations:
- `reportedIncidents Incident[] @relation("IncidentReporter")`
- `assignedIncidents Incident[] @relation("IncidentAssignee")`
- `comments          IncidentComment[]`
- `attachments       IncidentAttachment[]`
- `statusChanges     IncidentStatusLog[]`

- [ ] **Step 2: Remove Incident seeding from `prisma/seed.ts`**

Delete the `INCIDENT_CATEGORIES` constant and the entire `console.log("→ Sincronizando categorías de incidentes…")` block at the bottom of `main()`.

- [ ] **Step 3: Generate and apply migration**

Run: `npx prisma migrate dev --name drop_incident`
Expected: Prisma generates a `DROP TABLE` migration and applies it.

- [ ] **Step 4: Re-run seed to refresh permissions/roles in DB**

Run: `npx tsx prisma/seed.ts`
Expected: `→ Sincronizando permisos…` followed by `✓ admin listo: apenam@unamad.edu.pe` and no incident category lines.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/seed.ts prisma/migrations
git commit -m "feat(db): drop incident module (migration drop_incident)"
```

---

### Task 4: Add Socio + SocioAdjunto + SocioEstadoLog to schema

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add enums after the existing `ClientType` enum**

```prisma
enum TipoDocumento {
  DNI
  CE
  PASAPORTE
  RUC
}

enum EstadoSocio {
  activo
  suspendido
  retirado
  fallecido
}

enum Sexo {
  M
  F
}
```

- [ ] **Step 2: Add the three models at the end of the schema**

```prisma
model Socio {
  id              String        @id @default(cuid())
  codigo          String        @unique
  tipoDocumento   TipoDocumento
  numeroDocumento String
  apellidoPaterno String
  apellidoMaterno String?
  nombres         String
  fechaNacimiento DateTime?
  sexo            Sexo?
  estadoCivil    String?

  telefono        String?
  email           String?
  direccion       String?
  distrito        String?
  provincia       String?
  departamento    String?

  fechaIngreso    DateTime
  estado          EstadoSocio   @default(activo)
  observaciones   String?

  fotoUrl         String?

  userId          String?       @unique
  portalEnabled   Boolean       @default(false)

  createdById     String?
  updatedById     String?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  user      User?            @relation("SocioUser", fields: [userId], references: [id], onDelete: SetNull)
  createdBy User?            @relation("SocioCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)
  updatedBy User?            @relation("SocioUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull)
  adjuntos  SocioAdjunto[]
  estadoLog SocioEstadoLog[]

  @@unique([tipoDocumento, numeroDocumento])
  @@index([estado])
  @@index([apellidoPaterno, apellidoMaterno, nombres])
}

model SocioAdjunto {
  id           String   @id @default(cuid())
  socioId      String
  tipo         String
  url          String
  mimeType     String
  sizeBytes    Int?
  uploadedById String?
  createdAt    DateTime @default(now())

  socio      Socio @relation(fields: [socioId], references: [id], onDelete: Cascade)
  uploadedBy User? @relation("SocioAdjuntoUploader", fields: [uploadedById], references: [id], onDelete: SetNull)

  @@index([socioId])
}

model SocioEstadoLog {
  id         String      @id @default(cuid())
  socioId    String
  fromEstado EstadoSocio
  toEstado   EstadoSocio
  motivo     String
  byUserId   String?
  createdAt  DateTime    @default(now())

  socio  Socio @relation(fields: [socioId], references: [id], onDelete: Cascade)
  byUser User? @relation("SocioEstadoLogBy", fields: [byUserId], references: [id], onDelete: SetNull)

  @@index([socioId])
}
```

- [ ] **Step 3: Add inverse relations to `User` model**

Inside `model User { ... }`, after `sessions Session[]`, add:

```prisma
  socioAccount    Socio?         @relation("SocioUser")
  sociosCreated   Socio[]        @relation("SocioCreatedBy")
  sociosUpdated   Socio[]        @relation("SocioUpdatedBy")
  socioAdjuntos   SocioAdjunto[] @relation("SocioAdjuntoUploader")
  socioEstadoLogs SocioEstadoLog[] @relation("SocioEstadoLogBy")
```

- [ ] **Step 4: Generate and apply migration**

Run: `npx prisma migrate dev --name add_socio`
Expected: Prisma creates types and tables. No errors.

- [ ] **Step 5: Verify schema in DB**

Run:

```powershell
npx prisma migrate status
```

Expected output ends with `Database schema is up to date!`

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): add socio + socioAdjunto + socioEstadoLog (migration add_socio)"
```

---

## Phase 2 — Shared lib helpers (TDD)

### Task 5: Document validation helper

**Files:**
- Create: `src/lib/socios/document.ts`
- Create: `prisma/_test-document.ts` (temporary test runner; deleted after task 8)

- [ ] **Step 1: Write the test file**

Create `prisma/_test-document.ts`:

```ts
import assert from "node:assert/strict";
import {
  validateNumeroDocumento,
  normalizeNumeroDocumento,
} from "../src/lib/socios/document";

// DNI: exactly 8 digits
assert.equal(validateNumeroDocumento("DNI", "12345678"), true);
assert.equal(validateNumeroDocumento("DNI", "1234567"), false);
assert.equal(validateNumeroDocumento("DNI", "123456789"), false);
assert.equal(validateNumeroDocumento("DNI", "1234567a"), false);

// RUC: exactly 11 digits
assert.equal(validateNumeroDocumento("RUC", "12345678901"), true);
assert.equal(validateNumeroDocumento("RUC", "1234567890"), false);

// CE: 9-12 digits
assert.equal(validateNumeroDocumento("CE", "123456789"), true);
assert.equal(validateNumeroDocumento("CE", "123456789012"), true);
assert.equal(validateNumeroDocumento("CE", "12345678"), false);
assert.equal(validateNumeroDocumento("CE", "1234567890123"), false);

// PASAPORTE: alphanumeric 6-12
assert.equal(validateNumeroDocumento("PASAPORTE", "ABC123"), true);
assert.equal(validateNumeroDocumento("PASAPORTE", "ABC12"), false);
assert.equal(validateNumeroDocumento("PASAPORTE", "ABC123!"), false);

// Normalize: trim + uppercase for pasaporte; trim for others
assert.equal(normalizeNumeroDocumento("DNI", "  12345678 "), "12345678");
assert.equal(normalizeNumeroDocumento("PASAPORTE", " abc123 "), "ABC123");

console.log("✓ document.ts tests pass");
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx prisma/_test-document.ts`
Expected: FAIL (`Cannot find module '../src/lib/socios/document'`)

- [ ] **Step 3: Write the implementation**

Create `src/lib/socios/document.ts`:

```ts
import type { TipoDocumento } from "@/generated/prisma/client";

export function validateNumeroDocumento(
  tipo: TipoDocumento,
  numero: string,
): boolean {
  const v = numero.trim();
  switch (tipo) {
    case "DNI":
      return /^\d{8}$/.test(v);
    case "RUC":
      return /^\d{11}$/.test(v);
    case "CE":
      return /^\d{9,12}$/.test(v);
    case "PASAPORTE":
      return /^[A-Za-z0-9]{6,12}$/.test(v);
  }
}

export function normalizeNumeroDocumento(
  tipo: TipoDocumento,
  numero: string,
): string {
  const trimmed = numero.trim();
  if (tipo === "PASAPORTE") return trimmed.toUpperCase();
  return trimmed;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx prisma/_test-document.ts`
Expected: `✓ document.ts tests pass`

- [ ] **Step 5: Commit**

```bash
git add src/lib/socios/document.ts
git commit -m "feat(socios): add document type validation helper"
```

(Leave `prisma/_test-document.ts` — it's deleted in Task 8.)

---

### Task 6: Codigo correlativo generator

**Files:**
- Create: `src/lib/socios/codigo.ts`
- Create: `prisma/_test-codigo.ts` (temporary)

- [ ] **Step 1: Write the test file**

Create `prisma/_test-codigo.ts`:

```ts
import assert from "node:assert/strict";
import { nextCodigo, formatCodigo, parseCodigo } from "../src/lib/socios/codigo";

assert.equal(formatCodigo(1), "SOC-000001");
assert.equal(formatCodigo(42), "SOC-000042");
assert.equal(formatCodigo(123456), "SOC-123456");

assert.equal(parseCodigo("SOC-000001"), 1);
assert.equal(parseCodigo("SOC-123456"), 123456);
assert.equal(parseCodigo("garbage"), null);

assert.equal(nextCodigo(null), "SOC-000001");
assert.equal(nextCodigo("SOC-000001"), "SOC-000002");
assert.equal(nextCodigo("SOC-000999"), "SOC-001000");

console.log("✓ codigo.ts tests pass");
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx prisma/_test-codigo.ts`
Expected: FAIL (`Cannot find module ...`)

- [ ] **Step 3: Write the implementation**

Create `src/lib/socios/codigo.ts`:

```ts
const PREFIX = "SOC-";
const PAD = 6;
const RE = /^SOC-(\d{6,})$/;

export function formatCodigo(n: number): string {
  return PREFIX + String(n).padStart(PAD, "0");
}

export function parseCodigo(codigo: string): number | null {
  const m = RE.exec(codigo);
  if (!m) return null;
  return parseInt(m[1], 10);
}

export function nextCodigo(lastCodigo: string | null): string {
  if (!lastCodigo) return formatCodigo(1);
  const n = parseCodigo(lastCodigo);
  if (n === null) return formatCodigo(1);
  return formatCodigo(n + 1);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx prisma/_test-codigo.ts`
Expected: `✓ codigo.ts tests pass`

- [ ] **Step 5: Commit**

```bash
git add src/lib/socios/codigo.ts
git commit -m "feat(socios): add correlative codigo generator"
```

---

### Task 7: Storage helper (filesystem)

**Files:**
- Create: `src/lib/socios/storage.ts`
- Create: `private-uploads/socios/.gitkeep`
- Modify: `.gitignore`

- [ ] **Step 1: Create gitkeep and update gitignore**

Create empty file `private-uploads/socios/.gitkeep`.

Append to `.gitignore`:

```
# Local file storage for socio adjuntos (served via auth API route)
/private-uploads/socios/*
!/private-uploads/socios/.gitkeep
```

- [ ] **Step 2: Write the storage helper**

Create `src/lib/socios/storage.ts`:

```ts
import "server-only";
import { mkdir, writeFile, unlink, rm, readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.join(process.cwd(), "private-uploads", "socios");

function safeSocioDir(socioId: string): string {
  if (!/^[a-z0-9]+$/i.test(socioId)) throw new Error("INVALID_SOCIO_ID");
  return path.join(ROOT, socioId);
}

function safeFile(socioId: string, fileName: string): string {
  if (!/^[a-z0-9._-]+$/i.test(fileName)) throw new Error("INVALID_FILENAME");
  return path.join(safeSocioDir(socioId), fileName);
}

export async function writeAdjunto(
  socioId: string,
  fileName: string,
  buffer: Buffer,
): Promise<string> {
  const dir = safeSocioDir(socioId);
  await mkdir(dir, { recursive: true });
  const full = safeFile(socioId, fileName);
  await writeFile(full, buffer);
  return `/api/uploads/socios/${socioId}/${fileName}`;
}

export async function readAdjunto(
  socioId: string,
  fileName: string,
): Promise<Buffer> {
  return await readFile(safeFile(socioId, fileName));
}

export async function removeAdjunto(
  socioId: string,
  fileName: string,
): Promise<void> {
  await unlink(safeFile(socioId, fileName)).catch(() => undefined);
}

export async function removeSocioDir(socioId: string): Promise<void> {
  await rm(safeSocioDir(socioId), { recursive: true, force: true }).catch(
    () => undefined,
  );
}

export const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

export const MAX_BYTES = 5 * 1024 * 1024;

export function extFromMime(mime: string): string {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "application/pdf":
      return "pdf";
    default:
      throw new Error("MIME_NOT_ALLOWED");
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/socios/storage.ts private-uploads/socios/.gitkeep .gitignore
git commit -m "feat(socios): add filesystem storage helper for adjuntos"
```

---

### Task 8: Clean up temporary test files

**Files:**
- Delete: `prisma/_test-document.ts`
- Delete: `prisma/_test-codigo.ts`

- [ ] **Step 1: Delete the temp test files**

```powershell
Remove-Item prisma/_test-document.ts, prisma/_test-codigo.ts
```

- [ ] **Step 2: Commit**

```bash
git add -A prisma/
git commit -m "chore(socios): remove tmp test runners (replaced by verify-socios)"
```

---

## Phase 3 — Server actions

### Task 9: Types file

**Files:**
- Create: `src/app/(admin)/socios/types.ts`

- [ ] **Step 1: Write the types**

```ts
import type {
  EstadoSocio,
  TipoDocumento,
  Sexo,
} from "@/generated/prisma/client";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | {
      ok: false;
      error: string;
      fieldErrors?: Partial<Record<string, string>>;
    };

export type SocioRow = {
  id: string;
  codigo: string;
  tipoDocumento: TipoDocumento;
  numeroDocumento: string;
  apellidoPaterno: string;
  apellidoMaterno: string | null;
  nombres: string;
  estado: EstadoSocio;
  fechaIngreso: string;
  fotoUrl: string | null;
};

export type SocioDetail = SocioRow & {
  fechaNacimiento: string | null;
  sexo: Sexo | null;
  estadoCivil: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  distrito: string | null;
  provincia: string | null;
  departamento: string | null;
  observaciones: string | null;
  portalEnabled: boolean;
  userId: string | null;
  createdAt: string;
  updatedAt: string;
  adjuntos: {
    id: string;
    tipo: string;
    url: string;
    mimeType: string;
    sizeBytes: number | null;
    createdAt: string;
  }[];
  estadoLog: {
    id: string;
    fromEstado: EstadoSocio;
    toEstado: EstadoSocio;
    motivo: string;
    createdAt: string;
    byUser: { id: string; name: string } | null;
  }[];
};

export type CreateSocioInput = {
  tipoDocumento: TipoDocumento;
  numeroDocumento: string;
  apellidoPaterno: string;
  apellidoMaterno?: string;
  nombres: string;
  fechaNacimiento?: string;
  sexo?: Sexo;
  estadoCivil?: string;
  telefono?: string;
  email?: string;
  direccion?: string;
  distrito?: string;
  provincia?: string;
  departamento?: string;
  fechaIngreso: string;
  observaciones?: string;
};

export type UpdateSocioPatch = Partial<Omit<CreateSocioInput, never>>;

export type ListSociosParams = {
  q?: string;
  estado?: EstadoSocio;
  tipoDocumento?: TipoDocumento;
  page?: number;
};

export type ListSociosResult = {
  items: SocioRow[];
  total: number;
  page: number;
  pageSize: number;
};

export type PermFlags = {
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
  canChangeState: boolean;
};
```

- [ ] **Step 2: Commit**

```bash
git add src/app/(admin)/socios/types.ts
git commit -m "feat(socios): add types for actions and views"
```

---

### Task 10: Server actions — list & get

**Files:**
- Create: `src/app/(admin)/socios/actions.ts`

- [ ] **Step 1: Write the file with shared helpers + list/get**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { Prisma, type EstadoSocio } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/server";
import type { PermissionKey } from "@/lib/auth/permissions";
import {
  validateNumeroDocumento,
  normalizeNumeroDocumento,
} from "@/lib/socios/document";
import { nextCodigo } from "@/lib/socios/codigo";
import {
  writeAdjunto,
  removeAdjunto,
  removeSocioDir,
  ALLOWED_MIME,
  MAX_BYTES,
  extFromMime,
} from "@/lib/socios/storage";
import type {
  ActionResult,
  CreateSocioInput,
  UpdateSocioPatch,
  ListSociosParams,
  ListSociosResult,
  SocioRow,
  SocioDetail,
} from "./types";

const PAGE_SIZE = 25;
const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const MOTIVO_MIN = 5;

class Denied extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Denied";
  }
}

async function authorize(perm: PermissionKey): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new Denied("No autenticado.");
  if (!user.permissions.has(perm)) {
    throw new Denied("No tienes permisos para esta acción.");
  }
  return user;
}

function fail(error: string, fieldErrors?: Record<string, string>): ActionResult {
  return { ok: false, error, fieldErrors };
}

function ok<T>(data?: T): ActionResult<T> {
  return { ok: true, data };
}

function refresh() {
  revalidatePath("/socios");
}

function isP2002(e: unknown): boolean {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002"
  );
}

function toSocioRow(s: {
  id: string;
  codigo: string;
  tipoDocumento: Prisma.$Enums.TipoDocumento;
  numeroDocumento: string;
  apellidoPaterno: string;
  apellidoMaterno: string | null;
  nombres: string;
  estado: EstadoSocio;
  fechaIngreso: Date;
  fotoUrl: string | null;
}): SocioRow {
  return {
    id: s.id,
    codigo: s.codigo,
    tipoDocumento: s.tipoDocumento,
    numeroDocumento: s.numeroDocumento,
    apellidoPaterno: s.apellidoPaterno,
    apellidoMaterno: s.apellidoMaterno,
    nombres: s.nombres,
    estado: s.estado,
    fechaIngreso: s.fechaIngreso.toISOString(),
    fotoUrl: s.fotoUrl,
  };
}

export async function listSocios(
  params: ListSociosParams,
): Promise<ActionResult<ListSociosResult>> {
  try {
    await authorize("socios.read");
    const page = Math.max(1, params.page ?? 1);
    const q = params.q?.trim() ?? "";

    const where: Prisma.SocioWhereInput = {};
    if (params.estado) where.estado = params.estado;
    if (params.tipoDocumento) where.tipoDocumento = params.tipoDocumento;
    if (q) {
      where.OR = [
        { numeroDocumento: { contains: q, mode: "insensitive" } },
        { apellidoPaterno: { contains: q, mode: "insensitive" } },
        { apellidoMaterno: { contains: q, mode: "insensitive" } },
        { nombres: { contains: q, mode: "insensitive" } },
        { codigo: { contains: q, mode: "insensitive" } },
      ];
    }

    const [total, rows] = await Promise.all([
      prisma.socio.count({ where }),
      prisma.socio.findMany({
        where,
        orderBy: [
          { apellidoPaterno: "asc" },
          { apellidoMaterno: "asc" },
          { nombres: "asc" },
        ],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          codigo: true,
          tipoDocumento: true,
          numeroDocumento: true,
          apellidoPaterno: true,
          apellidoMaterno: true,
          nombres: true,
          estado: true,
          fechaIngreso: true,
          fotoUrl: true,
        },
      }),
    ]);

    return ok({
      items: rows.map(toSocioRow),
      total,
      page,
      pageSize: PAGE_SIZE,
    });
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("listSocios", e);
    return fail("No se pudo cargar el padrón.");
  }
}

export async function getSocio(
  id: string,
): Promise<ActionResult<SocioDetail>> {
  try {
    await authorize("socios.read");
    const s = await prisma.socio.findUnique({
      where: { id },
      include: {
        adjuntos: { orderBy: { createdAt: "desc" } },
        estadoLog: {
          orderBy: { createdAt: "desc" },
          include: { byUser: { select: { id: true, name: true } } },
        },
      },
    });
    if (!s) return fail("Socio no encontrado.");

    return ok({
      ...toSocioRow(s),
      fechaNacimiento: s.fechaNacimiento?.toISOString() ?? null,
      sexo: s.sexo,
      estadoCivil: s.estadoCivil,
      telefono: s.telefono,
      email: s.email,
      direccion: s.direccion,
      distrito: s.distrito,
      provincia: s.provincia,
      departamento: s.departamento,
      observaciones: s.observaciones,
      portalEnabled: s.portalEnabled,
      userId: s.userId,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
      adjuntos: s.adjuntos.map((a) => ({
        id: a.id,
        tipo: a.tipo,
        url: a.url,
        mimeType: a.mimeType,
        sizeBytes: a.sizeBytes,
        createdAt: a.createdAt.toISOString(),
      })),
      estadoLog: s.estadoLog.map((l) => ({
        id: l.id,
        fromEstado: l.fromEstado,
        toEstado: l.toEstado,
        motivo: l.motivo,
        createdAt: l.createdAt.toISOString(),
        byUser: l.byUser,
      })),
    });
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("getSocio", e);
    return fail("No se pudo cargar el socio.");
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors related to `socios/actions.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/app/(admin)/socios/actions.ts
git commit -m "feat(socios): server actions listSocios and getSocio"
```

---

### Task 11: Server actions — createSocio + updateSocio + deleteSocio

**Files:**
- Modify: `src/app/(admin)/socios/actions.ts`

- [ ] **Step 1: Add input-validation helper at top of file (below imports)**

```ts
type FieldErrors = Record<string, string>;

function validateSocioInput(
  input: Partial<CreateSocioInput>,
  isCreate: boolean,
): { fieldErrors: FieldErrors; normalized: Partial<CreateSocioInput> } {
  const fe: FieldErrors = {};
  const out: Partial<CreateSocioInput> = {};

  if (isCreate || input.tipoDocumento !== undefined) {
    if (!input.tipoDocumento) fe.tipoDocumento = "Selecciona el tipo de documento.";
    else out.tipoDocumento = input.tipoDocumento;
  }

  if (isCreate || input.numeroDocumento !== undefined) {
    const tipo = (input.tipoDocumento ?? out.tipoDocumento)!;
    const num = (input.numeroDocumento ?? "").trim();
    if (!num) fe.numeroDocumento = "Número de documento requerido.";
    else if (tipo && !validateNumeroDocumento(tipo, num))
      fe.numeroDocumento = "Formato inválido para el tipo de documento.";
    else if (tipo) out.numeroDocumento = normalizeNumeroDocumento(tipo, num);
  }

  if (isCreate || input.apellidoPaterno !== undefined) {
    const ap = (input.apellidoPaterno ?? "").trim();
    if (!ap) fe.apellidoPaterno = "Apellido paterno requerido.";
    else out.apellidoPaterno = ap;
  }

  if (isCreate || input.nombres !== undefined) {
    const nom = (input.nombres ?? "").trim();
    if (!nom) fe.nombres = "Nombres requeridos.";
    else out.nombres = nom;
  }

  if (input.apellidoMaterno !== undefined) {
    const v = input.apellidoMaterno.trim();
    out.apellidoMaterno = v || undefined;
  }

  if (isCreate || input.fechaIngreso !== undefined) {
    const fi = input.fechaIngreso ?? "";
    const d = fi ? new Date(fi) : null;
    if (!d || isNaN(d.getTime())) fe.fechaIngreso = "Fecha de ingreso inválida.";
    else if (d.getTime() > Date.now())
      fe.fechaIngreso = "La fecha de ingreso no puede ser futura.";
    else out.fechaIngreso = d.toISOString();
  }

  if (input.fechaNacimiento !== undefined && input.fechaNacimiento !== "") {
    const d = new Date(input.fechaNacimiento);
    if (isNaN(d.getTime())) fe.fechaNacimiento = "Fecha de nacimiento inválida.";
    else if (d.getTime() > Date.now())
      fe.fechaNacimiento = "Fecha de nacimiento futura.";
    else out.fechaNacimiento = d.toISOString();
  }

  if (input.email !== undefined && input.email.trim() !== "") {
    const em = input.email.trim().toLowerCase();
    if (!EMAIL_RE.test(em)) fe.email = "Correo no válido.";
    else out.email = em;
  } else if (input.email !== undefined) {
    out.email = undefined;
  }

  for (const k of [
    "sexo",
    "estadoCivil",
    "telefono",
    "direccion",
    "distrito",
    "provincia",
    "departamento",
    "observaciones",
  ] as const) {
    const v = input[k];
    if (v !== undefined) {
      const t = String(v).trim();
      (out as Record<string, string | undefined>)[k] = t || undefined;
    }
  }

  return { fieldErrors: fe, normalized: out };
}
```

- [ ] **Step 2: Append `createSocio`**

```ts
export async function createSocio(
  input: CreateSocioInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const me = await authorize("socios.write");
    const { fieldErrors, normalized } = validateSocioInput(input, true);
    if (Object.keys(fieldErrors).length > 0) {
      return fail("Revisa los campos marcados.", fieldErrors);
    }

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const result = await prisma.$transaction(async (tx) => {
          const dup = await tx.socio.findFirst({
            where: {
              tipoDocumento: normalized.tipoDocumento!,
              numeroDocumento: normalized.numeroDocumento!,
            },
            select: { id: true },
          });
          if (dup) {
            return { duplicate: true as const };
          }
          const last = await tx.socio.findFirst({
            orderBy: { codigo: "desc" },
            select: { codigo: true },
          });
          const codigo = nextCodigo(last?.codigo ?? null);
          const created = await tx.socio.create({
            data: {
              codigo,
              tipoDocumento: normalized.tipoDocumento!,
              numeroDocumento: normalized.numeroDocumento!,
              apellidoPaterno: normalized.apellidoPaterno!,
              apellidoMaterno: normalized.apellidoMaterno ?? null,
              nombres: normalized.nombres!,
              fechaNacimiento: normalized.fechaNacimiento
                ? new Date(normalized.fechaNacimiento)
                : null,
              sexo: normalized.sexo ?? null,
              estadoCivil: normalized.estadoCivil ?? null,
              telefono: normalized.telefono ?? null,
              email: normalized.email ?? null,
              direccion: normalized.direccion ?? null,
              distrito: normalized.distrito ?? null,
              provincia: normalized.provincia ?? null,
              departamento: normalized.departamento ?? null,
              fechaIngreso: new Date(normalized.fechaIngreso!),
              observaciones: normalized.observaciones ?? null,
              createdById: me.id,
              updatedById: me.id,
            },
          });
          await tx.socioEstadoLog.create({
            data: {
              socioId: created.id,
              fromEstado: created.estado,
              toEstado: created.estado,
              motivo: "Alta del socio",
              byUserId: me.id,
            },
          });
          return { id: created.id };
        });

        if ("duplicate" in result) {
          return fail("Ya existe un socio con ese documento.", {
            numeroDocumento: "Documento en uso.",
          });
        }
        refresh();
        return ok(result);
      } catch (e) {
        if (isP2002(e)) {
          const target = (e as Prisma.PrismaClientKnownRequestError).meta
            ?.target as string[] | undefined;
          if (target?.includes("codigo")) continue; // retry on codigo race
          if (
            target?.includes("tipoDocumento") ||
            target?.includes("numeroDocumento")
          ) {
            return fail("Ya existe un socio con ese documento.", {
              numeroDocumento: "Documento en uso.",
            });
          }
          throw e;
        }
        throw e;
      }
    }
    return fail("Conflicto al generar el código del socio. Reintenta.");
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("createSocio", e);
    return fail("No se pudo crear el socio.");
  }
}
```

- [ ] **Step 3: Append `updateSocio`**

```ts
export async function updateSocio(
  id: string,
  patch: UpdateSocioPatch,
): Promise<ActionResult> {
  try {
    const me = await authorize("socios.write");

    const existing = await prisma.socio.findUnique({
      where: { id },
      select: { tipoDocumento: true },
    });
    if (!existing) return fail("Socio no encontrado.");

    const merged: Partial<CreateSocioInput> = {
      tipoDocumento: patch.tipoDocumento ?? existing.tipoDocumento,
      ...patch,
    };
    const { fieldErrors, normalized } = validateSocioInput(merged, false);
    if (Object.keys(fieldErrors).length > 0) {
      return fail("Revisa los campos marcados.", fieldErrors);
    }

    const data: Prisma.SocioUpdateInput = { updatedBy: { connect: { id: me.id } } };
    if (normalized.tipoDocumento) data.tipoDocumento = normalized.tipoDocumento;
    if (normalized.numeroDocumento) data.numeroDocumento = normalized.numeroDocumento;
    if (normalized.apellidoPaterno) data.apellidoPaterno = normalized.apellidoPaterno;
    if ("apellidoMaterno" in normalized)
      data.apellidoMaterno = normalized.apellidoMaterno ?? null;
    if (normalized.nombres) data.nombres = normalized.nombres;
    if (normalized.fechaNacimiento !== undefined)
      data.fechaNacimiento = normalized.fechaNacimiento
        ? new Date(normalized.fechaNacimiento)
        : null;
    if ("sexo" in normalized) data.sexo = normalized.sexo ?? null;
    if ("estadoCivil" in normalized)
      data.estadoCivil = normalized.estadoCivil ?? null;
    if ("telefono" in normalized) data.telefono = normalized.telefono ?? null;
    if ("email" in normalized) data.email = normalized.email ?? null;
    if ("direccion" in normalized) data.direccion = normalized.direccion ?? null;
    if ("distrito" in normalized) data.distrito = normalized.distrito ?? null;
    if ("provincia" in normalized) data.provincia = normalized.provincia ?? null;
    if ("departamento" in normalized)
      data.departamento = normalized.departamento ?? null;
    if (normalized.fechaIngreso)
      data.fechaIngreso = new Date(normalized.fechaIngreso);
    if ("observaciones" in normalized)
      data.observaciones = normalized.observaciones ?? null;

    try {
      await prisma.socio.update({ where: { id }, data });
    } catch (e) {
      if (isP2002(e)) {
        return fail("Ya existe un socio con ese documento.", {
          numeroDocumento: "Documento en uso.",
        });
      }
      throw e;
    }
    refresh();
    return ok();
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("updateSocio", e);
    return fail("No se pudo actualizar el socio.");
  }
}
```

- [ ] **Step 4: Append `deleteSocio`**

```ts
export async function deleteSocio(id: string): Promise<ActionResult> {
  try {
    await authorize("socios.delete");
    const existing = await prisma.socio.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) return fail("Socio no encontrado.");
    await prisma.socio.delete({ where: { id } });
    await removeSocioDir(id);
    refresh();
    return ok();
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("deleteSocio", e);
    return fail("No se pudo eliminar el socio.");
  }
}
```

- [ ] **Step 5: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors from `actions.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/app/(admin)/socios/actions.ts
git commit -m "feat(socios): server actions create/update/delete with validation"
```

---

### Task 12: Server actions — changeEstadoSocio + adjuntos

**Files:**
- Modify: `src/app/(admin)/socios/actions.ts`

- [ ] **Step 1: Append `changeEstadoSocio`**

```ts
export async function changeEstadoSocio(
  id: string,
  toEstado: EstadoSocio,
  motivo: string,
): Promise<ActionResult> {
  try {
    const me = await authorize("socios.change-state");
    const m = (motivo ?? "").trim();
    if (m.length < MOTIVO_MIN) {
      return fail("Motivo demasiado corto.", {
        motivo: `Mínimo ${MOTIVO_MIN} caracteres.`,
      });
    }

    await prisma.$transaction(async (tx) => {
      const cur = await tx.socio.findUnique({
        where: { id },
        select: { estado: true },
      });
      if (!cur) throw new Denied("Socio no encontrado.");
      if (cur.estado === toEstado) throw new Denied("El socio ya está en ese estado.");

      const updates: Prisma.SocioUpdateInput = {
        estado: toEstado,
        updatedBy: { connect: { id: me.id } },
      };
      if (toEstado === "fallecido") updates.portalEnabled = false;

      await tx.socio.update({ where: { id }, data: updates });
      await tx.socioEstadoLog.create({
        data: {
          socioId: id,
          fromEstado: cur.estado,
          toEstado,
          motivo: m,
          byUserId: me.id,
        },
      });
    });

    refresh();
    return ok();
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("changeEstadoSocio", e);
    return fail("No se pudo cambiar el estado del socio.");
  }
}
```

- [ ] **Step 2: Append `uploadAdjunto`**

```ts
export async function uploadAdjunto(
  socioId: string,
  tipo: string,
  file: File,
): Promise<ActionResult<{ id: string; url: string }>> {
  try {
    const me = await authorize("socios.write");
    if (!ALLOWED_MIME.has(file.type)) return fail("Tipo de archivo no permitido.");
    if (file.size > MAX_BYTES) return fail("Archivo demasiado grande (máx 5 MB).");
    const trimmedTipo = (tipo ?? "").trim() || "otro";

    const existing = await prisma.socio.findUnique({
      where: { id: socioId },
      select: { id: true },
    });
    if (!existing) return fail("Socio no encontrado.");

    const row = await prisma.socioAdjunto.create({
      data: {
        socioId,
        tipo: trimmedTipo,
        url: "",
        mimeType: file.type,
        sizeBytes: file.size,
        uploadedById: me.id,
      },
    });

    const ext = extFromMime(file.type);
    const fileName = `${row.id}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    let url: string;
    try {
      url = await writeAdjunto(socioId, fileName, buffer);
    } catch (e) {
      await prisma.socioAdjunto.delete({ where: { id: row.id } }).catch(() => undefined);
      console.error("uploadAdjunto write", e);
      return fail("No se pudo guardar el archivo.");
    }

    await prisma.socioAdjunto.update({
      where: { id: row.id },
      data: { url },
    });

    if (trimmedTipo === "foto") {
      await prisma.socio.update({
        where: { id: socioId },
        data: { fotoUrl: url, updatedBy: { connect: { id: me.id } } },
      });
    }

    refresh();
    return ok({ id: row.id, url });
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("uploadAdjunto", e);
    return fail("No se pudo subir el adjunto.");
  }
}
```

- [ ] **Step 3: Append `setFoto` (thin wrapper)**

```ts
export async function setFoto(
  socioId: string,
  file: File,
): Promise<ActionResult<{ url: string }>> {
  const r = await uploadAdjunto(socioId, "foto", file);
  if (!r.ok) return r;
  return ok({ url: r.data!.url });
}
```

- [ ] **Step 4: Append `removeAdjuntoAction`**

```ts
export async function removeAdjuntoAction(
  adjuntoId: string,
): Promise<ActionResult> {
  try {
    const me = await authorize("socios.write");
    const row = await prisma.socioAdjunto.findUnique({
      where: { id: adjuntoId },
      select: { id: true, socioId: true, url: true, tipo: true },
    });
    if (!row) return fail("Adjunto no encontrado.");

    await prisma.socioAdjunto.delete({ where: { id: row.id } });

    const fileName = row.url.split("/").pop();
    if (fileName) await removeAdjunto(row.socioId, fileName);

    if (row.tipo === "foto") {
      await prisma.socio.update({
        where: { id: row.socioId },
        data: { fotoUrl: null, updatedBy: { connect: { id: me.id } } },
      });
    }
    refresh();
    return ok();
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("removeAdjuntoAction", e);
    return fail("No se pudo eliminar el adjunto.");
  }
}
```

- [ ] **Step 5: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/(admin)/socios/actions.ts
git commit -m "feat(socios): server actions changeEstado, uploadAdjunto, removeAdjunto"
```

---

## Phase 4 — UI

### Task 13: Sidebar entry + icon

**Files:**
- Modify: `src/components/admin/data.ts`
- Modify: `src/components/admin/Icon.tsx`

- [ ] **Step 1: Inspect existing Icon component**

Run: `Read` `src/components/admin/Icon.tsx` to see how icons are declared. If a new icon `id-card` (or similar) needs to be added, add it as an SVG following the same pattern as other icons in that file. If `users` icon will suffice for now, you can reuse it — pick whichever is cleaner. Pick `id-card` and add it.

Add a new branch in the `switch (name)` of `Icon.tsx`:

```tsx
case "id-card":
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="11" r="2" />
      <path d="M5 17c1-2 3-3 4-3s3 1 4 3" />
      <line x1="15" y1="10" x2="19" y2="10" />
      <line x1="15" y1="13" x2="19" y2="13" />
    </svg>
  );
```

Also add `"id-card"` to the `IconName` union type at the top of the file.

- [ ] **Step 2: Add the sidebar entry**

In `src/components/admin/data.ts`, update `SIDEBAR_NAV`:

```ts
export const SIDEBAR_NAV: SidebarItem[] = [
  { id: "usuarios", label: "Usuarios", icon: "users", href: "/usuarios" },
  { id: "roles", label: "Roles", icon: "shield", href: "/roles" },
  { id: "socios", label: "Padrón de socios", icon: "id-card", href: "/socios" },
];
```

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/data.ts src/components/admin/Icon.tsx
git commit -m "feat(admin): add Padrón de socios entry to sidebar"
```

---

### Task 14: page.tsx (server, fetches initial query)

**Files:**
- Create: `src/app/(admin)/socios/page.tsx`

- [ ] **Step 1: Write page.tsx**

```tsx
import { requirePermission } from "@/lib/auth/server";
import { listSocios } from "./actions";
import { SociosClient } from "./SociosClient";
import type { EstadoSocio, TipoDocumento } from "@/generated/prisma/client";
import type { PermFlags } from "./types";

export const metadata = { title: "Padrón de socios · Admin" };
export const dynamic = "force-dynamic";

type SearchParams = {
  q?: string;
  estado?: string;
  tipoDocumento?: string;
  page?: string;
};

const ESTADOS: EstadoSocio[] = ["activo", "suspendido", "retirado", "fallecido"];
const TIPOS: TipoDocumento[] = ["DNI", "CE", "PASAPORTE", "RUC"];

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const me = await requirePermission("socios.read");
  const sp = await searchParams;

  const estado = sp.estado && (ESTADOS as string[]).includes(sp.estado)
    ? (sp.estado as EstadoSocio)
    : undefined;
  const tipoDocumento = sp.tipoDocumento && (TIPOS as string[]).includes(sp.tipoDocumento)
    ? (sp.tipoDocumento as TipoDocumento)
    : undefined;
  const page = sp.page ? Math.max(1, parseInt(sp.page, 10) || 1) : 1;

  const res = await listSocios({ q: sp.q, estado, tipoDocumento, page });
  if (!res.ok) {
    throw new Error(res.error);
  }

  const perms: PermFlags = {
    canRead: me.permissions.has("socios.read"),
    canWrite: me.permissions.has("socios.write"),
    canDelete: me.permissions.has("socios.delete"),
    canChangeState: me.permissions.has("socios.change-state"),
  };

  return (
    <SociosClient
      initial={res.data!}
      perms={perms}
      filters={{ q: sp.q ?? "", estado, tipoDocumento }}
    />
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/(admin)/socios/page.tsx
git commit -m "feat(socios): server page with filters from searchParams"
```

---

### Task 15: socios.css (base styles)

**Files:**
- Create: `src/app/(admin)/socios/socios.css`

- [ ] **Step 1: Write the CSS using existing tokens**

Inspect `src/app/(admin)/usuarios/users.css` first. Then create `socios.css` reusing the same design tokens. Minimum to start (extend as needed during UI tasks):

```css
.socios-page {
  padding: 24px;
  max-width: 1400px;
  margin: 0 auto;
}

.socios-toolbar {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
  margin-bottom: 16px;
}

.socios-toolbar__search {
  flex: 1 1 240px;
  padding: 8px 12px;
  border: 1px solid var(--border, #e2e2e2);
  border-radius: 8px;
  font-size: 14px;
}

.socios-toolbar__select {
  padding: 8px 12px;
  border: 1px solid var(--border, #e2e2e2);
  border-radius: 8px;
  font-size: 14px;
}

.socios-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}
.socios-table th,
.socios-table td {
  padding: 12px 16px;
  text-align: left;
  border-bottom: 1px solid var(--border, #eee);
}
.socios-table th {
  background: var(--bg-subtle, #f6f6f6);
  font-weight: 600;
}
.socios-table tr {
  cursor: pointer;
}
.socios-table tr:hover {
  background: var(--bg-hover, #fafafa);
}

.estado-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
}
.estado-badge--activo { background: #dcfce7; color: #166534; }
.estado-badge--suspendido { background: #fef3c7; color: #92400e; }
.estado-badge--retirado { background: #e5e7eb; color: #374151; }
.estado-badge--fallecido { background: #fee2e2; color: #991b1b; }

.socios-empty {
  text-align: center;
  padding: 64px 16px;
  color: var(--text-muted, #777);
}

.socios-pagination {
  display: flex;
  gap: 8px;
  margin-top: 16px;
  align-items: center;
  justify-content: flex-end;
  font-size: 14px;
}

@media (max-width: 720px) {
  .socios-table thead { display: none; }
  .socios-table, .socios-table tbody, .socios-table tr, .socios-table td {
    display: block;
    width: 100%;
  }
  .socios-table tr {
    border: 1px solid var(--border, #eee);
    border-radius: 12px;
    margin-bottom: 12px;
    padding: 12px;
  }
  .socios-table td { border: none; padding: 4px 0; }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/(admin)/socios/socios.css
git commit -m "feat(socios): base CSS for listing, toolbar, badges"
```

---

### Task 16: EstadoBadge and DocumentoInput components

**Files:**
- Create: `src/app/(admin)/socios/EstadoBadge.tsx`
- Create: `src/app/(admin)/socios/DocumentoInput.tsx`

- [ ] **Step 1: Write `EstadoBadge.tsx`**

```tsx
import type { EstadoSocio } from "@/generated/prisma/client";

const LABELS: Record<EstadoSocio, string> = {
  activo: "Activo",
  suspendido: "Suspendido",
  retirado: "Retirado",
  fallecido: "Fallecido",
};

export function EstadoBadge({ estado }: { estado: EstadoSocio }) {
  return (
    <span className={`estado-badge estado-badge--${estado}`}>
      {LABELS[estado]}
    </span>
  );
}
```

- [ ] **Step 2: Write `DocumentoInput.tsx`**

```tsx
"use client";

import type { TipoDocumento } from "@/generated/prisma/client";

const HINTS: Record<TipoDocumento, { inputMode: "numeric" | "text"; maxLength: number; placeholder: string }> = {
  DNI:       { inputMode: "numeric", maxLength: 8,  placeholder: "8 dígitos"           },
  RUC:       { inputMode: "numeric", maxLength: 11, placeholder: "11 dígitos"          },
  CE:        { inputMode: "numeric", maxLength: 12, placeholder: "9 a 12 dígitos"      },
  PASAPORTE: { inputMode: "text",    maxLength: 12, placeholder: "alfanumérico 6-12"   },
};

export function DocumentoInput({
  tipo,
  numero,
  onChange,
  fieldErrors,
}: {
  tipo: TipoDocumento;
  numero: string;
  onChange: (tipo: TipoDocumento, numero: string) => void;
  fieldErrors?: { tipoDocumento?: string; numeroDocumento?: string };
}) {
  const hint = HINTS[tipo];
  return (
    <div className="documento-input">
      <label className="documento-input__row">
        <span>Tipo</span>
        <select
          value={tipo}
          onChange={(e) => onChange(e.target.value as TipoDocumento, numero)}
        >
          <option value="DNI">DNI</option>
          <option value="CE">Carné de Extranjería</option>
          <option value="PASAPORTE">Pasaporte</option>
          <option value="RUC">RUC</option>
        </select>
        {fieldErrors?.tipoDocumento && (
          <span className="field-error">{fieldErrors.tipoDocumento}</span>
        )}
      </label>
      <label className="documento-input__row">
        <span>Número</span>
        <input
          type="text"
          inputMode={hint.inputMode}
          maxLength={hint.maxLength}
          placeholder={hint.placeholder}
          value={numero}
          onChange={(e) => onChange(tipo, e.target.value)}
        />
        {fieldErrors?.numeroDocumento && (
          <span className="field-error">{fieldErrors.numeroDocumento}</span>
        )}
      </label>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/(admin)/socios/EstadoBadge.tsx src/app/(admin)/socios/DocumentoInput.tsx
git commit -m "feat(socios): EstadoBadge and DocumentoInput components"
```

---

### Task 17: SociosClient (list view)

**Files:**
- Create: `src/app/(admin)/socios/SociosClient.tsx`

- [ ] **Step 1: Write SociosClient**

```tsx
"use client";

import "./socios.css";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import type { EstadoSocio, TipoDocumento } from "@/generated/prisma/client";
import { EstadoBadge } from "./EstadoBadge";
import { CreateSocioModal } from "./CreateSocioModal";
import { SocioDetailDrawer } from "./SocioDetailDrawer";
import type { ListSociosResult, PermFlags } from "./types";

export function SociosClient({
  initial,
  perms,
  filters,
}: {
  initial: ListSociosResult;
  perms: PermFlags;
  filters: { q: string; estado?: EstadoSocio; tipoDocumento?: TipoDocumento };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const updateParam = (key: string, value: string | undefined) => {
    const p = new URLSearchParams(searchParams);
    if (value && value !== "") p.set(key, value);
    else p.delete(key);
    if (key !== "page") p.delete("page");
    startTransition(() => router.push(`/socios?${p.toString()}`));
  };

  const totalPages = Math.max(1, Math.ceil(initial.total / initial.pageSize));

  return (
    <div className="socios-page">
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Padrón de socios</h1>
        {perms.canWrite && (
          <button onClick={() => setCreateOpen(true)} className="btn-primary">
            + Nuevo socio
          </button>
        )}
      </header>

      <div className="socios-toolbar">
        <input
          className="socios-toolbar__search"
          placeholder="Buscar por código, DNI, nombre…"
          defaultValue={filters.q}
          onKeyDown={(e) => {
            if (e.key === "Enter") updateParam("q", (e.target as HTMLInputElement).value);
          }}
        />
        <select
          className="socios-toolbar__select"
          value={filters.estado ?? ""}
          onChange={(e) => updateParam("estado", e.target.value || undefined)}
        >
          <option value="">Todos los estados</option>
          <option value="activo">Activo</option>
          <option value="suspendido">Suspendido</option>
          <option value="retirado">Retirado</option>
          <option value="fallecido">Fallecido</option>
        </select>
        <select
          className="socios-toolbar__select"
          value={filters.tipoDocumento ?? ""}
          onChange={(e) => updateParam("tipoDocumento", e.target.value || undefined)}
        >
          <option value="">Todos los documentos</option>
          <option value="DNI">DNI</option>
          <option value="CE">Carné de Extranjería</option>
          <option value="PASAPORTE">Pasaporte</option>
          <option value="RUC">RUC</option>
        </select>
      </div>

      {initial.items.length === 0 ? (
        <div className="socios-empty">
          <p>Aún no hay socios en el padrón.</p>
          {perms.canWrite && (
            <button onClick={() => setCreateOpen(true)} className="btn-primary">
              Crear primer socio
            </button>
          )}
        </div>
      ) : (
        <>
          <table className="socios-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Documento</th>
                <th>Apellidos, Nombres</th>
                <th>Ingreso</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {initial.items.map((s) => (
                <tr key={s.id} onClick={() => setOpenId(s.id)}>
                  <td>{s.codigo}</td>
                  <td>
                    {s.tipoDocumento} {s.numeroDocumento}
                  </td>
                  <td>
                    {s.apellidoPaterno} {s.apellidoMaterno ?? ""}, {s.nombres}
                  </td>
                  <td>{new Date(s.fechaIngreso).toLocaleDateString("es-PE")}</td>
                  <td>
                    <EstadoBadge estado={s.estado} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="socios-pagination">
            <span>
              {initial.total} socio{initial.total === 1 ? "" : "s"} · página {initial.page} de {totalPages}
            </span>
            <button disabled={pending || initial.page <= 1} onClick={() => updateParam("page", String(initial.page - 1))}>
              ‹
            </button>
            <button
              disabled={pending || initial.page >= totalPages}
              onClick={() => updateParam("page", String(initial.page + 1))}
            >
              ›
            </button>
          </div>
        </>
      )}

      {createOpen && (
        <CreateSocioModal
          onClose={() => setCreateOpen(false)}
          onCreated={(id) => {
            setCreateOpen(false);
            setOpenId(id);
            router.refresh();
          }}
        />
      )}

      {openId && (
        <SocioDetailDrawer
          socioId={openId}
          perms={perms}
          onClose={() => {
            setOpenId(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/(admin)/socios/SociosClient.tsx
git commit -m "feat(socios): list view with search, filters, pagination"
```

---

### Task 18: CreateSocioModal

**Files:**
- Create: `src/app/(admin)/socios/CreateSocioModal.tsx`

- [ ] **Step 1: Write the modal**

```tsx
"use client";

import { useState, useTransition } from "react";
import type { TipoDocumento, Sexo } from "@/generated/prisma/client";
import { DocumentoInput } from "./DocumentoInput";
import { createSocio } from "./actions";
import type { CreateSocioInput } from "./types";

export function CreateSocioModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [tipo, setTipo] = useState<TipoDocumento>("DNI");
  const [numero, setNumero] = useState("");
  const [apellidoPaterno, setAP] = useState("");
  const [apellidoMaterno, setAM] = useState("");
  const [nombres, setNombres] = useState("");
  const [fechaNacimiento, setFN] = useState("");
  const [sexo, setSexo] = useState<Sexo | "">("");
  const [estadoCivil, setEC] = useState("");
  const [telefono, setTel] = useState("");
  const [email, setEmail] = useState("");
  const [direccion, setDir] = useState("");
  const [distrito, setDis] = useState("");
  const [provincia, setProv] = useState("");
  const [departamento, setDept] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const [fechaIngreso, setFI] = useState(today);
  const [observaciones, setObs] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    const input: CreateSocioInput = {
      tipoDocumento: tipo,
      numeroDocumento: numero,
      apellidoPaterno,
      apellidoMaterno: apellidoMaterno || undefined,
      nombres,
      fechaNacimiento: fechaNacimiento || undefined,
      sexo: (sexo as Sexo) || undefined,
      estadoCivil: estadoCivil || undefined,
      telefono: telefono || undefined,
      email: email || undefined,
      direccion: direccion || undefined,
      distrito: distrito || undefined,
      provincia: provincia || undefined,
      departamento: departamento || undefined,
      fechaIngreso,
      observaciones: observaciones || undefined,
    };
    startTransition(async () => {
      const res = await createSocio(input);
      if (!res.ok) {
        setError(res.error);
        setFieldErrors((res.fieldErrors as Record<string, string>) ?? {});
        return;
      }
      onCreated(res.data!.id);
    });
  }

  return (
    <div role="dialog" aria-modal="true" className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal__header">
          <h2>Nuevo socio</h2>
          <button onClick={onClose} aria-label="Cerrar">✕</button>
        </header>

        <form className="modal__body" onSubmit={submit}>
          <fieldset>
            <legend>Identificación</legend>
            <DocumentoInput
              tipo={tipo}
              numero={numero}
              onChange={(t, n) => { setTipo(t); setNumero(n); }}
              fieldErrors={fieldErrors}
            />
            <label>Apellido paterno
              <input value={apellidoPaterno} onChange={(e) => setAP(e.target.value)} required />
              {fieldErrors.apellidoPaterno && <span className="field-error">{fieldErrors.apellidoPaterno}</span>}
            </label>
            <label>Apellido materno
              <input value={apellidoMaterno} onChange={(e) => setAM(e.target.value)} />
            </label>
            <label>Nombres
              <input value={nombres} onChange={(e) => setNombres(e.target.value)} required />
              {fieldErrors.nombres && <span className="field-error">{fieldErrors.nombres}</span>}
            </label>
            <label>Fecha de nacimiento
              <input type="date" value={fechaNacimiento} onChange={(e) => setFN(e.target.value)} max={today} />
            </label>
            <label>Sexo
              <select value={sexo} onChange={(e) => setSexo(e.target.value as Sexo | "")}>
                <option value="">—</option><option value="M">M</option><option value="F">F</option>
              </select>
            </label>
            <label>Estado civil
              <input value={estadoCivil} onChange={(e) => setEC(e.target.value)} />
            </label>
          </fieldset>

          <fieldset>
            <legend>Contacto</legend>
            <label>Teléfono
              <input value={telefono} onChange={(e) => setTel(e.target.value)} />
            </label>
            <label>Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              {fieldErrors.email && <span className="field-error">{fieldErrors.email}</span>}
            </label>
            <label>Dirección
              <input value={direccion} onChange={(e) => setDir(e.target.value)} />
            </label>
            <label>Distrito
              <input value={distrito} onChange={(e) => setDis(e.target.value)} />
            </label>
            <label>Provincia
              <input value={provincia} onChange={(e) => setProv(e.target.value)} />
            </label>
            <label>Departamento
              <input value={departamento} onChange={(e) => setDept(e.target.value)} />
            </label>
          </fieldset>

          <fieldset>
            <legend>Asociación</legend>
            <label>Fecha de ingreso
              <input type="date" value={fechaIngreso} onChange={(e) => setFI(e.target.value)} max={today} required />
              {fieldErrors.fechaIngreso && <span className="field-error">{fieldErrors.fechaIngreso}</span>}
            </label>
            <label>Observaciones
              <textarea rows={3} value={observaciones} onChange={(e) => setObs(e.target.value)} />
            </label>
          </fieldset>

          {error && <p className="form-error" role="alert" aria-live="polite">{error}</p>}

          <footer className="modal__footer">
            <button type="button" onClick={onClose} disabled={pending}>Cancelar</button>
            <button type="submit" disabled={pending} className="btn-primary">
              {pending ? "Creando…" : "Crear socio"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/(admin)/socios/CreateSocioModal.tsx
git commit -m "feat(socios): CreateSocioModal with all required + optional fields"
```

---

### Task 19: SocioDetailDrawer + ChangeEstadoModal + AdjuntosPanel

**Files:**
- Create: `src/app/(admin)/socios/SocioDetailDrawer.tsx`
- Create: `src/app/(admin)/socios/ChangeEstadoModal.tsx`
- Create: `src/app/(admin)/socios/AdjuntosPanel.tsx`

- [ ] **Step 1: Write `AdjuntosPanel.tsx`**

```tsx
"use client";

import { useRef, useState, useTransition } from "react";
import type { SocioDetail } from "./types";
import { uploadAdjunto, removeAdjuntoAction, setFoto } from "./actions";

const TIPOS = [
  { value: "dni_scan", label: "DNI escaneado" },
  { value: "ficha_inscripcion", label: "Ficha de inscripción" },
  { value: "carnet", label: "Carné" },
  { value: "otro", label: "Otro" },
];

export function AdjuntosPanel({
  socio,
  canWrite,
  onChanged,
}: {
  socio: SocioDetail;
  canWrite: boolean;
  onChanged: () => void;
}) {
  const [tipo, setTipo] = useState("dni_scan");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const fotoRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);

  function onFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setError(null);
    startTransition(async () => {
      const r = await setFoto(socio.id, f);
      if (!r.ok) setError(r.error);
      onChanged();
    });
  }

  function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setError(null);
    startTransition(async () => {
      const r = await uploadAdjunto(socio.id, tipo, f);
      if (!r.ok) setError(r.error);
      onChanged();
    });
  }

  function onRemove(id: string) {
    startTransition(async () => {
      const r = await removeAdjuntoAction(id);
      if (!r.ok) setError(r.error);
      onChanged();
    });
  }

  return (
    <div className="adjuntos-panel">
      <section>
        <h3>Foto del socio</h3>
        <div className="adjuntos-panel__foto">
          {socio.fotoUrl ? (
            <img src={socio.fotoUrl} alt={`Foto de ${socio.nombres}`} />
          ) : (
            <div className="placeholder">Sin foto</div>
          )}
          {canWrite && (
            <>
              <button onClick={() => fotoRef.current?.click()} disabled={pending}>
                {socio.fotoUrl ? "Reemplazar foto" : "Subir foto"}
              </button>
              <input ref={fotoRef} type="file" accept="image/*" hidden onChange={onFoto} />
            </>
          )}
        </div>
      </section>

      <section>
        <h3>Documentos</h3>
        <ul className="adjuntos-panel__list">
          {socio.adjuntos.filter((a) => a.tipo !== "foto").map((a) => (
            <li key={a.id}>
              <span>{a.tipo}</span>
              <a href={a.url} target="_blank" rel="noreferrer">Ver</a>
              <span>{a.mimeType}</span>
              <span>{a.sizeBytes ? `${Math.ceil(a.sizeBytes / 1024)} KB` : "—"}</span>
              {canWrite && (
                <button onClick={() => onRemove(a.id)} disabled={pending} aria-label="Eliminar">✕</button>
              )}
            </li>
          ))}
        </ul>
        {canWrite && (
          <div className="adjuntos-panel__upload">
            <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
              {TIPOS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <button onClick={() => docRef.current?.click()} disabled={pending}>
              Subir documento
            </button>
            <input
              ref={docRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              hidden
              onChange={onUpload}
            />
          </div>
        )}
      </section>

      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Write `ChangeEstadoModal.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import type { EstadoSocio } from "@/generated/prisma/client";
import { changeEstadoSocio } from "./actions";

const OPTS: { v: EstadoSocio; label: string }[] = [
  { v: "activo", label: "Activo" },
  { v: "suspendido", label: "Suspendido" },
  { v: "retirado", label: "Retirado" },
  { v: "fallecido", label: "Fallecido" },
];

export function ChangeEstadoModal({
  socioId,
  current,
  onClose,
  onDone,
}: {
  socioId: string;
  current: EstadoSocio;
  onClose: () => void;
  onDone: () => void;
}) {
  const [toEstado, setToEstado] = useState<EstadoSocio>(
    OPTS.find((o) => o.v !== current)!.v,
  );
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const r = await changeEstadoSocio(socioId, toEstado, motivo);
      if (!r.ok) {
        setError(r.error);
        setFieldErrors((r.fieldErrors as Record<string, string>) ?? {});
        return;
      }
      onDone();
    });
  }

  return (
    <div role="dialog" aria-modal="true" className="modal-overlay" onClick={onClose}>
      <div className="modal modal--sm" onClick={(e) => e.stopPropagation()}>
        <header className="modal__header">
          <h2>Cambiar estado</h2>
          <button onClick={onClose} aria-label="Cerrar">✕</button>
        </header>
        <form className="modal__body" onSubmit={submit}>
          <label>Estado actual<input value={current} disabled /></label>
          <label>Nuevo estado
            <select value={toEstado} onChange={(e) => setToEstado(e.target.value as EstadoSocio)}>
              {OPTS.filter((o) => o.v !== current).map((o) => (
                <option key={o.v} value={o.v}>{o.label}</option>
              ))}
            </select>
          </label>
          <label>Motivo (mínimo 5 caracteres)
            <textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} required minLength={5} />
            {fieldErrors.motivo && <span className="field-error">{fieldErrors.motivo}</span>}
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <footer className="modal__footer">
            <button type="button" onClick={onClose} disabled={pending}>Cancelar</button>
            <button type="submit" disabled={pending} className="btn-primary">
              {pending ? "Aplicando…" : "Confirmar cambio"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write `SocioDetailDrawer.tsx`**

```tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { getSocio, updateSocio, deleteSocio } from "./actions";
import { EstadoBadge } from "./EstadoBadge";
import { DocumentoInput } from "./DocumentoInput";
import { AdjuntosPanel } from "./AdjuntosPanel";
import { ChangeEstadoModal } from "./ChangeEstadoModal";
import type { SocioDetail, PermFlags } from "./types";
import type { TipoDocumento, Sexo } from "@/generated/prisma/client";

type Tab = "datos" | "adjuntos" | "historial";

export function SocioDetailDrawer({
  socioId,
  perms,
  onClose,
}: {
  socioId: string;
  perms: PermFlags;
  onClose: () => void;
}) {
  const [socio, setSocio] = useState<SocioDetail | null>(null);
  const [tab, setTab] = useState<Tab>("datos");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const [changeOpen, setChangeOpen] = useState(false);

  async function reload() {
    const r = await getSocio(socioId);
    if (r.ok) setSocio(r.data!);
    else setError(r.error);
  }

  useEffect(() => {
    reload();
  }, [socioId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!socio) {
    return (
      <div className="drawer-overlay" onClick={onClose}>
        <div className="drawer" onClick={(e) => e.stopPropagation()}>
          <p style={{ padding: 24 }}>Cargando…</p>
        </div>
      </div>
    );
  }

  function save(patch: Partial<SocioDetail>) {
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const r = await updateSocio(socio!.id, patch as any);
      if (!r.ok) {
        setError(r.error);
        setFieldErrors((r.fieldErrors as Record<string, string>) ?? {});
        return;
      }
      await reload();
    });
  }

  function handleDelete() {
    if (!confirm("¿Eliminar este socio? Esta acción no se puede deshacer.")) return;
    startTransition(async () => {
      const r = await deleteSocio(socio!.id);
      if (!r.ok) setError(r.error);
      else onClose();
    });
  }

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <header className="drawer__header">
          <div>
            <div className="drawer__codigo">{socio.codigo}</div>
            <h2>{socio.apellidoPaterno} {socio.apellidoMaterno ?? ""}, {socio.nombres}</h2>
            <EstadoBadge estado={socio.estado} />
          </div>
          <div className="drawer__actions">
            {perms.canChangeState && (
              <button onClick={() => setChangeOpen(true)}>Cambiar estado</button>
            )}
            {perms.canDelete && (
              <button onClick={handleDelete} className="btn-danger">Eliminar</button>
            )}
            <button onClick={onClose} aria-label="Cerrar">✕</button>
          </div>
        </header>

        <nav className="drawer__tabs" role="tablist">
          <button role="tab" aria-selected={tab === "datos"} onClick={() => setTab("datos")}>Datos</button>
          <button role="tab" aria-selected={tab === "adjuntos"} onClick={() => setTab("adjuntos")}>Adjuntos</button>
          <button role="tab" aria-selected={tab === "historial"} onClick={() => setTab("historial")}>Historial</button>
        </nav>

        <div className="drawer__body">
          {tab === "datos" && (
            <DatosForm socio={socio} canWrite={perms.canWrite} fieldErrors={fieldErrors} pending={pending} onSave={save} />
          )}
          {tab === "adjuntos" && (
            <AdjuntosPanel socio={socio} canWrite={perms.canWrite} onChanged={reload} />
          )}
          {tab === "historial" && (
            <ol className="historial">
              {socio.estadoLog.map((l) => (
                <li key={l.id}>
                  <time>{new Date(l.createdAt).toLocaleString("es-PE")}</time>
                  <strong>{l.fromEstado} → {l.toEstado}</strong>
                  <span>por {l.byUser?.name ?? "—"}</span>
                  <p>{l.motivo}</p>
                </li>
              ))}
            </ol>
          )}
          {error && <p className="form-error" role="alert">{error}</p>}
        </div>

        {changeOpen && (
          <ChangeEstadoModal
            socioId={socio.id}
            current={socio.estado}
            onClose={() => setChangeOpen(false)}
            onDone={() => { setChangeOpen(false); reload(); }}
          />
        )}
      </div>
    </div>
  );
}

function DatosForm({
  socio,
  canWrite,
  fieldErrors,
  pending,
  onSave,
}: {
  socio: SocioDetail;
  canWrite: boolean;
  fieldErrors: Record<string, string>;
  pending: boolean;
  onSave: (patch: Partial<SocioDetail>) => void;
}) {
  const [tipo, setTipo] = useState<TipoDocumento>(socio.tipoDocumento);
  const [numero, setNumero] = useState(socio.numeroDocumento);
  const [ap, setAP] = useState(socio.apellidoPaterno);
  const [am, setAM] = useState(socio.apellidoMaterno ?? "");
  const [nombres, setNombres] = useState(socio.nombres);
  const [tel, setTel] = useState(socio.telefono ?? "");
  const [email, setEmail] = useState(socio.email ?? "");
  const [obs, setObs] = useState(socio.observaciones ?? "");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      tipoDocumento: tipo,
      numeroDocumento: numero,
      apellidoPaterno: ap,
      apellidoMaterno: am || undefined,
      nombres,
      telefono: tel || undefined,
      email: email || undefined,
      observaciones: obs || undefined,
    });
  }

  return (
    <form onSubmit={submit}>
      <DocumentoInput
        tipo={tipo}
        numero={numero}
        onChange={(t, n) => { setTipo(t); setNumero(n); }}
        fieldErrors={fieldErrors}
      />
      <label>Apellido paterno
        <input value={ap} onChange={(e) => setAP(e.target.value)} disabled={!canWrite} />
        {fieldErrors.apellidoPaterno && <span className="field-error">{fieldErrors.apellidoPaterno}</span>}
      </label>
      <label>Apellido materno
        <input value={am} onChange={(e) => setAM(e.target.value)} disabled={!canWrite} />
      </label>
      <label>Nombres
        <input value={nombres} onChange={(e) => setNombres(e.target.value)} disabled={!canWrite} />
      </label>
      <label>Teléfono
        <input value={tel} onChange={(e) => setTel(e.target.value)} disabled={!canWrite} />
      </label>
      <label>Email
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!canWrite} />
        {fieldErrors.email && <span className="field-error">{fieldErrors.email}</span>}
      </label>
      <label>Observaciones
        <textarea rows={3} value={obs} onChange={(e) => setObs(e.target.value)} disabled={!canWrite} />
      </label>
      <p className="drawer__hint">Para cambiar el estado del socio, usa el botón “Cambiar estado” arriba.</p>
      {canWrite && (
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Guardando…" : "Guardar cambios"}
        </button>
      )}
    </form>
  );
}
```

- [ ] **Step 4: Add drawer CSS**

Append to `src/app/(admin)/socios/socios.css`:

```css
.drawer-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.35);
  display: flex; justify-content: flex-end;
  z-index: 50;
}
.drawer {
  width: 560px; max-width: 100%;
  background: #fff; height: 100%;
  display: flex; flex-direction: column;
  box-shadow: -8px 0 24px rgba(0,0,0,0.1);
}
.drawer__header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border, #eee);
  display: flex; justify-content: space-between; align-items: flex-start; gap: 16px;
}
.drawer__codigo { font-size: 12px; color: var(--text-muted, #666); }
.drawer__actions { display: flex; gap: 8px; }
.drawer__tabs { display: flex; border-bottom: 1px solid var(--border, #eee); }
.drawer__tabs button {
  padding: 10px 16px; background: none; border: none; cursor: pointer;
  border-bottom: 2px solid transparent;
}
.drawer__tabs button[aria-selected="true"] {
  border-bottom-color: var(--accent, #2563eb);
  font-weight: 600;
}
.drawer__body { padding: 16px 20px; overflow-y: auto; flex: 1; }
.drawer__hint { font-size: 12px; color: var(--text-muted, #666); margin-top: 8px; }
.historial { list-style: none; padding: 0; }
.historial li { padding: 12px 0; border-bottom: 1px solid var(--border, #eee); }
.historial time { font-size: 12px; color: var(--text-muted, #666); display: block; }
.historial strong { display: block; margin: 4px 0; }
.historial p { margin: 4px 0 0; color: var(--text-muted, #444); }
.adjuntos-panel section { margin-bottom: 24px; }
.adjuntos-panel__foto { display: flex; align-items: center; gap: 12px; }
.adjuntos-panel__foto img { width: 96px; height: 96px; object-fit: cover; border-radius: 8px; }
.adjuntos-panel__foto .placeholder {
  width: 96px; height: 96px; border-radius: 8px;
  background: var(--bg-subtle, #f3f3f3);
  display: flex; align-items: center; justify-content: center;
  color: var(--text-muted, #888); font-size: 12px;
}
.adjuntos-panel__list { list-style: none; padding: 0; }
.adjuntos-panel__list li {
  display: grid; grid-template-columns: 1fr auto auto auto auto;
  gap: 12px; align-items: center; padding: 8px 0;
  border-bottom: 1px solid var(--border, #eee);
}
.field-error { display: block; color: #b91c1c; font-size: 12px; margin-top: 4px; }
.form-error { color: #b91c1c; }
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.35);
  display: flex; align-items: center; justify-content: center;
  z-index: 60;
}
.modal { background: #fff; width: 560px; max-width: 100%; border-radius: 12px; max-height: 90vh; display: flex; flex-direction: column; }
.modal--sm { width: 420px; }
.modal__header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border, #eee);
  display: flex; justify-content: space-between; align-items: center;
}
.modal__body { padding: 16px; overflow-y: auto; flex: 1; }
.modal__body fieldset { border: none; padding: 0; margin: 0 0 16px; }
.modal__body legend { font-weight: 600; margin-bottom: 8px; }
.modal__body label { display: block; margin-bottom: 8px; font-size: 14px; }
.modal__body input, .modal__body select, .modal__body textarea {
  width: 100%; padding: 8px 10px; border: 1px solid var(--border, #ddd);
  border-radius: 6px; font-size: 14px;
}
.modal__footer {
  padding: 12px 16px;
  border-top: 1px solid var(--border, #eee);
  display: flex; justify-content: flex-end; gap: 8px;
}
.btn-primary {
  background: var(--accent, #2563eb); color: #fff;
  border: none; padding: 8px 14px; border-radius: 6px; cursor: pointer;
}
.btn-primary:disabled { opacity: .6; cursor: not-allowed; }
.btn-danger {
  background: #b91c1c; color: #fff;
  border: none; padding: 6px 10px; border-radius: 6px; cursor: pointer;
}
```

- [ ] **Step 5: Commit**

```bash
git add src/app/(admin)/socios/SocioDetailDrawer.tsx src/app/(admin)/socios/ChangeEstadoModal.tsx src/app/(admin)/socios/AdjuntosPanel.tsx src/app/(admin)/socios/socios.css
git commit -m "feat(socios): detail drawer, change-state modal, adjuntos panel"
```

---

## Phase 5 — API route for serving adjuntos

### Task 20: GET route for uploaded files

**Files:**
- Create: `src/app/api/uploads/socios/[socioId]/[file]/route.ts`

- [ ] **Step 1: Write the route**

```ts
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/server";
import { readAdjunto } from "@/lib/socios/storage";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ socioId: string; file: string }> },
) {
  await requirePermission("socios.read");
  const { socioId, file } = await params;

  let buffer: Buffer;
  try {
    buffer = await readAdjunto(socioId, file);
  } catch (e) {
    return new NextResponse("Not found", { status: 404 });
  }

  const ext = file.split(".").pop()?.toLowerCase();
  const ct = ext === "pdf" ? "application/pdf"
    : ext === "png" ? "image/png"
    : ext === "webp" ? "image/webp"
    : ext === "jpg" || ext === "jpeg" ? "image/jpeg"
    : "application/octet-stream";

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": ct,
      "Cache-Control": "private, max-age=300",
    },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add "src/app/api/uploads/socios/[socioId]/[file]/route.ts"
git commit -m "feat(socios): auth-checked GET route for adjuntos"
```

---

## Phase 6 — Integrity tests

### Task 21: verify-socios.ts

**Files:**
- Create: `prisma/verify-socios.ts`

- [ ] **Step 1: Write the script**

```ts
import "dotenv/config";
import assert from "node:assert/strict";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function cleanup(prefix: string) {
  await prisma.socio.deleteMany({
    where: { OR: [{ numeroDocumento: { startsWith: prefix } }] },
  });
}

async function main() {
  const stamp = Date.now().toString().slice(-7);
  const dni1 = "7" + stamp;
  const dni2 = "8" + stamp;
  await cleanup("7" + stamp.slice(0, 4));
  await cleanup("8" + stamp.slice(0, 4));

  console.log("→ Creating two socios sequentially");
  const socio1 = await prisma.$transaction(async (tx) => {
    const last = await tx.socio.findFirst({ orderBy: { codigo: "desc" }, select: { codigo: true } });
    const lastN = last ? parseInt(last.codigo.slice(4), 10) : 0;
    const codigo = `SOC-${String(lastN + 1).padStart(6, "0")}`;
    return tx.socio.create({
      data: {
        codigo,
        tipoDocumento: "DNI",
        numeroDocumento: dni1,
        apellidoPaterno: "Test",
        nombres: "Uno",
        fechaIngreso: new Date(),
      },
    });
  });
  assert.match(socio1.codigo, /^SOC-\d{6}$/);
  console.log("  ✓ socio1.codigo =", socio1.codigo);

  await prisma.socioEstadoLog.create({
    data: {
      socioId: socio1.id,
      fromEstado: "activo",
      toEstado: "activo",
      motivo: "Alta del socio",
    },
  });

  console.log("→ Duplicate DNI rejected");
  let dup = false;
  try {
    await prisma.socio.create({
      data: {
        codigo: "SOC-DUP-TEST",
        tipoDocumento: "DNI",
        numeroDocumento: dni1,
        apellidoPaterno: "Test",
        nombres: "Dup",
        fechaIngreso: new Date(),
      },
    });
  } catch (e) {
    dup = e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
  }
  assert.equal(dup, true, "duplicate DNI must be rejected");
  console.log("  ✓ duplicate DNI rejected by unique constraint");

  console.log("→ Cambio de estado + log");
  await prisma.$transaction(async (tx) => {
    await tx.socio.update({ where: { id: socio1.id }, data: { estado: "suspendido" } });
    await tx.socioEstadoLog.create({
      data: {
        socioId: socio1.id,
        fromEstado: "activo",
        toEstado: "suspendido",
        motivo: "Test de verificación",
      },
    });
  });
  const logs = await prisma.socioEstadoLog.findMany({ where: { socioId: socio1.id } });
  assert.ok(logs.length >= 2, "should have at least 2 log entries");
  console.log("  ✓ log written");

  console.log("→ Delete cascades to log");
  await prisma.socio.delete({ where: { id: socio1.id } });
  const orphan = await prisma.socioEstadoLog.count({ where: { socioId: socio1.id } });
  assert.equal(orphan, 0, "log entries must cascade-delete with socio");
  console.log("  ✓ cascade works");

  console.log("\n✅ All padrón integrity tests pass.");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("✗", e);
  await prisma.$disconnect();
  process.exit(1);
});
```

- [ ] **Step 2: Run the test**

Run: `npx tsx prisma/verify-socios.ts`
Expected: ends with `✅ All padrón integrity tests pass.`

- [ ] **Step 3: Commit**

```bash
git add prisma/verify-socios.ts
git commit -m "test(socios): integrity tests for codigo, dup, estado log, cascade"
```

---

## Phase 7 — Wire-up verification

### Task 22: End-to-end smoke

**Files:** None modified, manual verification.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Expected: server up on http://localhost:3000.

- [ ] **Step 2: Log in**

Open http://localhost:3000/login, sign in as `apenam@unamad.edu.pe` / `954040025`.

- [ ] **Step 3: Open /socios**

Navigate to /socios via the sidebar. Confirm:
- Sidebar shows "Padrón de socios" with the id-card icon.
- Page loads, table is empty, empty-state shows "Crear primer socio" button.

- [ ] **Step 4: Create a socio**

Click "Crear primer socio". Fill: DNI 71234567, Apellido paterno "Peña", Nombres "Alberto", fecha de ingreso = hoy. Submit.
Expected: modal closes, table shows the new socio with code `SOC-000001`, drawer opens with detail.

- [ ] **Step 5: Upload an adjunto**

In the drawer, go to tab Adjuntos. Click "Subir foto" with a small JPG/PNG. Confirm the foto appears, that `private-uploads/socios/<id>/<adjuntoId>.jpg` exists on disk, and that the API route at `/api/uploads/socios/<id>/<file>` serves the image (open URL in a logged-in tab).

- [ ] **Step 6: Change state**

Click "Cambiar estado", pick "Suspendido", motivo "Atraso 2 cuotas (test)". Confirm.
Expected: badge changes, tab "Historial" lists the transition with your name.

- [ ] **Step 7: Search & filter**

Close drawer. Type "Peña" in search, press Enter. Verify URL becomes `/socios?q=Pe%C3%B1a` and the row stays. Filter by estado=Suspendido and verify the row is still there; switch to Activo and verify it disappears.

- [ ] **Step 8: Delete (only if superadmin)**

Re-open the socio, hit Eliminar, confirm. Verify the socio disappears from the table and the folder `private-uploads/socios/<id>/` is gone.

- [ ] **Step 9: Final commit (if any fixes made during smoke)**

If any UI bugs were found and fixed during the smoke test, group those fixes into a single commit:

```bash
git add -A
git commit -m "fix(socios): smoke-test fixes"
```

If nothing needed fixing, skip this step.

---

## Self-review checklist (already applied during writing)

- ✓ Spec coverage: every section of the spec maps to a task here.
- ✓ No placeholders: each code step shows the actual code.
- ✓ Type consistency: `EstadoSocio`/`TipoDocumento`/`Sexo` from `@/generated/prisma/client` used uniformly; `ActionResult<T>` shape consistent.
- ✓ Function names consistent: `nextCodigo`, `formatCodigo`, `parseCodigo`, `validateNumeroDocumento`, `normalizeNumeroDocumento`, `writeAdjunto`, `readAdjunto`, `removeAdjunto`, `removeSocioDir`.
- ✓ Storage paths: spec says `private-uploads/socios/{socioId}/`; plan uses the same.
- ✓ Permission keys match seeded values: `socios.read`, `socios.write`, `socios.delete`, `socios.change-state`.
