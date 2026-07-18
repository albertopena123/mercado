# Firmas de la junta directiva — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir subir imágenes de firma del presidente y demás miembros de la junta directiva desde el módulo `organos`, y renderizarlas sobre las líneas de firma de la constancia según el cargo.

**Architecture:** La firma es un atributo del modelo `Directivo` existente (`firmaUrl` + auditoría). Se sube por server action con validación por magic-bytes, se guarda en disco privado (`private-uploads/organos/`), y se sirve por una ruta protegida (`/api/uploads/organos/[id]/[file]`) igual que `transferencias`. La constancia resuelve, por cargo del `consejo_directivo` vigente, la URL de firma y la pinta sobre la línea.

**Tech Stack:** Next.js (App Router, server actions), Prisma + adapter-pg (Postgres), TypeScript, filesystem privado.

## Global Constraints

- **No hay framework de tests unitarios** en este repo. La verificación de cada tarea es: `npx tsc --noEmit` filtrando el ruido stale de `.next`, `npx eslint`, y verificación manual del flujo en la app. NO inventar pytest/vitest.
  - Comando typecheck: `npx tsc --noEmit 2>&1 | grep -vE '^\.next' | grep -E 'error TS' ; echo "exit: ${PIPESTATUS[0]}"` — se espera **sin líneas `error TS`** fuera de `.next`.
  - Comando lint: `npx eslint` — se espera exit 0.
- **Prisma client** se importa siempre de `@/lib/prisma`; los tipos generados de `@/generated/prisma/client`. Tras tocar `schema.prisma` hay que regenerar el cliente.
- **Storage** siempre guarda **URL string** en la BD, nunca bytes. Archivos privados servidos por ruta con permiso.
- **Validación de subida** es fuente única en `src/lib/socios/limits.ts`. Firmas = solo imágenes → `validateUpload(file, "foto", sniffed)`. `MAX_UPLOAD_MB = 10`.
- **Permisos**: reutilizar `organos.read` (leer/servir) y `organos.write` (subir/eliminar). No crear permisos nuevos.
- **No datos ficticios**: si un directivo no tiene firma, mostrar placeholder / dejar la línea en blanco. Nunca sembrar imágenes de ejemplo.
- **Anti path-traversal**: `id` valida `/^[a-z0-9]+$/i`, `fileName` valida `/^[a-z0-9._-]+$/i` (copiado de `transferencias/storage.ts`). Nota: los ids de `Directivo` usan `@default(cuid())` (alfanuméricos), compatibles con el regex.
- **Commits frecuentes**, uno por tarea. Formato de mensaje del repo (español, `feat(organos): …`). Terminar cada commit con:
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01RBS5YbhnmUJMWtygqp2fHh
  ```

---

## File Structure

| Acción | Archivo | Responsabilidad |
|---|---|---|
| Modify | `prisma/schema.prisma` | Campos `firmaUrl/firmaUploadedAt/firmaUploadedById` en `Directivo` |
| Create | `prisma/migrations/<ts>_directivo_firma/migration.sql` | Migración (la genera `prisma migrate dev`) |
| Create | `src/lib/organos/storage.ts` | Escribir/leer/borrar firma en disco privado |
| Create | `src/app/api/uploads/organos/[id]/[file]/route.ts` | Servir firma con permiso `organos.read` |
| Create | `src/lib/organos/firmas.ts` | Resolver `{ presidente?, tesorero?, secretario? }` del consejo vigente |
| Modify | `src/app/(admin)/organos/actions.ts` | `subirFirma`, `eliminarFirma` |
| Modify | `src/app/(admin)/organos/types.ts` | `firmaUrl` en `DirectivoRow` |
| Modify | `src/app/(admin)/organos/page.tsx` | `firmaUrl` en `SELECT`/`toRow` |
| Modify | `src/app/(admin)/organos/OrganosClient.tsx` | UI subir/preview/eliminar firma |
| Create | `src/app/(admin)/organos/FirmaUploader.tsx` | Componente de carga de firma (aislado) |
| Modify | `src/app/(admin)/organos/organos.css` | Estilos del uploader/preview |
| Modify | `src/app/(admin)/socios/[id]/constancia/page.tsx` | Pasar `firmas` a la vista |
| Modify | `src/app/(admin)/socios/[id]/constancia/ConstanciaView.tsx` | Prop `firmas` + `<img>` sobre la línea |
| Modify | `src/app/(admin)/socios/[id]/constancia/constancia.css` | Estilo `.constancia__firma-img` |

---

## Task 1: Campo de firma en el modelo Directivo

**Files:**
- Modify: `prisma/schema.prisma` (bloque `model Directivo`, ~línea 335-359)
- Create: `prisma/migrations/<ts>_directivo_firma/migration.sql` (generado)

**Interfaces:**
- Produces: `Directivo.firmaUrl: string | null`, `Directivo.firmaUploadedAt: Date | null`, `Directivo.firmaUploadedById: string | null` en el cliente generado.

- [ ] **Step 1: Añadir los campos al modelo `Directivo`**

En `prisma/schema.prisma`, dentro de `model Directivo`, después de `observaciones String?` y antes de `byUserId String?`, insertar:

```prisma
  // Firma escaneada del directivo (imagen). URL a la ruta protegida
  // /api/uploads/organos/<id>/<file>. Se renderiza en documentos por cargo.
  firmaUrl          String?
  firmaUploadedAt   DateTime?
  firmaUploadedById String?
```

- [ ] **Step 2: Crear y aplicar la migración + regenerar el cliente**

Run:
```bash
npx prisma migrate dev --name directivo_firma
```
Expected: crea `prisma/migrations/<ts>_directivo_firma/migration.sql` con tres `ALTER TABLE "Directivo" ADD COLUMN ...`, la aplica, y regenera el cliente en `src/generated/prisma`. Salida termina en `✔ Generated Prisma Client`.

Nota (memory `inventario-migration-drift`): si hay drift previo, NO usar `--force-reset`. Si `migrate dev` reporta drift no relacionado, detente y reporta — no borres datos.

- [ ] **Step 3: Verificar typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -vE '^\.next' | grep -E 'error TS'`
Expected: sin salida (los nuevos campos existen en el cliente generado).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(organos): campo de firma en modelo Directivo

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RBS5YbhnmUJMWtygqp2fHh"
```

---

## Task 2: Storage helper de firmas

**Files:**
- Create: `src/lib/organos/storage.ts`

**Interfaces:**
- Consumes: nada de tareas previas.
- Produces:
  - `writeFirma(id: string, fileName: string, buffer: Buffer): Promise<string>` → devuelve `/api/uploads/organos/<id>/<fileName>`
  - `readFirma(id: string, fileName: string): Promise<Buffer>`
  - `removeFirma(id: string, fileName: string): Promise<void>`
  - `extFromMime(mime: string): string` (solo imágenes)

- [ ] **Step 1: Crear el archivo**

Create `src/lib/organos/storage.ts`:

```ts
import "server-only";
import { mkdir, writeFile, rm, readFile } from "node:fs/promises";
import path from "node:path";

// Firmas escaneadas de los directivos. Privadas: se sirven solo con permiso
// organos.read vía /api/uploads/organos/<id>/<file>.
const ROOT = path.join(process.cwd(), "private-uploads", "organos");

function safeDir(id: string): string {
  if (!/^[a-z0-9]+$/i.test(id)) throw new Error("INVALID_ID");
  return path.join(ROOT, id);
}
function safeFile(id: string, fileName: string): string {
  if (!/^[a-z0-9._-]+$/i.test(fileName)) throw new Error("INVALID_FILENAME");
  return path.join(safeDir(id), fileName);
}

export async function writeFirma(
  id: string,
  fileName: string,
  buffer: Buffer,
): Promise<string> {
  await mkdir(safeDir(id), { recursive: true });
  await writeFile(safeFile(id, fileName), buffer);
  return `/api/uploads/organos/${id}/${fileName}`;
}

export async function readFirma(id: string, fileName: string): Promise<Buffer> {
  return await readFile(safeFile(id, fileName));
}

export async function removeFirma(id: string, fileName: string): Promise<void> {
  await rm(safeFile(id, fileName), { force: true }).catch(() => undefined);
}

// Solo imágenes: la firma nunca es un PDF.
export function extFromMime(mime: string): string {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      throw new Error("MIME_NOT_ALLOWED");
  }
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -vE '^\.next' | grep -E 'error TS'`
Expected: sin salida.

- [ ] **Step 3: Commit**

```bash
git add src/lib/organos/storage.ts
git commit -m "feat(organos): storage privado de firmas de directivos

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RBS5YbhnmUJMWtygqp2fHh"
```

---

## Task 3: Ruta protegida para servir la firma

**Files:**
- Create: `src/app/api/uploads/organos/[id]/[file]/route.ts`

**Interfaces:**
- Consumes: `readFirma` de `@/lib/organos/storage` (Task 2).
- Produces: endpoint `GET /api/uploads/organos/<id>/<file>` que devuelve la imagen `inline` con permiso `organos.read`.

- [ ] **Step 1: Crear la ruta**

Create `src/app/api/uploads/organos/[id]/[file]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/server";
import { readFirma } from "@/lib/organos/storage";

export const dynamic = "force-dynamic";

// Servido PRIVADO de las firmas de directivos (solo con permiso organos.read).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; file: string }> },
) {
  await requirePermission("organos.read");
  const { id, file } = await params;

  let buffer: Buffer;
  try {
    buffer = await readFirma(id, file);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }

  const ext = file.split(".").pop()?.toLowerCase();
  const ct =
    ext === "png"
      ? "image/png"
      : ext === "webp"
        ? "image/webp"
        : ext === "jpg" || ext === "jpeg"
          ? "image/jpeg"
          : "application/octet-stream";

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": ct,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `inline; filename="${file}"`,
    },
  });
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -vE '^\.next' | grep -E 'error TS'`
Expected: sin salida.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/uploads/organos"
git commit -m "feat(organos): ruta protegida para servir firmas

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RBS5YbhnmUJMWtygqp2fHh"
```

---

## Task 4: Server actions subirFirma / eliminarFirma

**Files:**
- Modify: `src/app/(admin)/organos/actions.ts`

**Interfaces:**
- Consumes: `writeFirma`, `removeFirma`, `extFromMime` de `@/lib/organos/storage`; `validateUpload`, `sniffMime`, `SNIFF_BYTES` de `@/lib/socios/limits`; helpers locales `authorize`, `ok`, `fail`, `refresh`.
- Produces:
  - `subirFirma(directivoId: string, file: File): Promise<ActionResult<{ firmaUrl: string }>>`
  - `eliminarFirma(directivoId: string): Promise<ActionResult>`

- [ ] **Step 1: Añadir imports**

En `src/app/(admin)/organos/actions.ts`, tras los imports existentes (después de la línea `import { normalizeToken } from "@/lib/socios/normalize";`), añadir:

```ts
import { SNIFF_BYTES, sniffMime, validateUpload } from "@/lib/socios/limits";
import { writeFirma, removeFirma, extFromMime } from "@/lib/organos/storage";
```

- [ ] **Step 2: Añadir un helper para extraer el nombre de archivo de una URL**

Al final de `actions.ts`, añadir las dos server actions. Primero un helper local (no exportado) para obtener el basename de una `firmaUrl` guardada:

```ts
// Extrae "<file>" de "/api/uploads/organos/<id>/<file>" para poder borrarlo.
function firmaFileName(url: string | null): string | null {
  if (!url) return null;
  const parts = url.split("/");
  return parts[parts.length - 1] || null;
}

// Sube (o reemplaza) la firma escaneada de un directivo. Solo imágenes.
export async function subirFirma(
  directivoId: string,
  file: File,
): Promise<ActionResult<{ firmaUrl: string }>> {
  try {
    const me = await authorize("organos.write");

    const directivo = await prisma.directivo.findUnique({
      where: { id: directivoId },
      select: { id: true, firmaUrl: true },
    });
    if (!directivo) return fail("Directivo no encontrado.");

    const head = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
    const sniffed = sniffMime(head);
    const err = validateUpload(file, "foto", sniffed);
    if (err) return fail(err);
    if (!sniffed)
      return fail(
        "No se reconoció el contenido del archivo. Sube una imagen JPG, PNG o WebP.",
      );

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = `firma-${Date.now()}.${extFromMime(sniffed)}`;
    const url = await writeFirma(directivoId, fileName, buffer);

    await prisma.directivo.update({
      where: { id: directivoId },
      data: {
        firmaUrl: url,
        firmaUploadedAt: new Date(),
        firmaUploadedById: me.id,
      },
    });

    // Borra el archivo anterior (si existía y cambió de nombre) para no dejar huérfanos.
    const prev = firmaFileName(directivo.firmaUrl);
    if (prev && prev !== fileName) await removeFirma(directivoId, prev);

    refresh();
    return ok({ firmaUrl: url });
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof Denied) return fail(e.message);
    console.error("subirFirma", e);
    return fail("No se pudo subir la firma.");
  }
}

// Elimina la firma del directivo (archivo + campos).
export async function eliminarFirma(
  directivoId: string,
): Promise<ActionResult> {
  try {
    await authorize("organos.write");
    const directivo = await prisma.directivo.findUnique({
      where: { id: directivoId },
      select: { id: true, firmaUrl: true },
    });
    if (!directivo) return fail("Directivo no encontrado.");

    const prev = firmaFileName(directivo.firmaUrl);
    if (prev) await removeFirma(directivoId, prev);

    await prisma.directivo.update({
      where: { id: directivoId },
      data: { firmaUrl: null, firmaUploadedAt: null, firmaUploadedById: null },
    });
    refresh();
    return ok();
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof Denied) return fail(e.message);
    console.error("eliminarFirma", e);
    return fail("No se pudo eliminar la firma.");
  }
}
```

- [ ] **Step 3: Verificar typecheck y lint**

Run: `npx tsc --noEmit 2>&1 | grep -vE '^\.next' | grep -E 'error TS' ; npx eslint "src/app/(admin)/organos/actions.ts"`
Expected: sin líneas `error TS`; eslint exit 0.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(admin)/organos/actions.ts"
git commit -m "feat(organos): actions subir/eliminar firma de directivo

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RBS5YbhnmUJMWtygqp2fHh"
```

---

## Task 5: Exponer firmaUrl en la página y tipos de organos

**Files:**
- Modify: `src/app/(admin)/organos/types.ts`
- Modify: `src/app/(admin)/organos/page.tsx`

**Interfaces:**
- Consumes: `Directivo.firmaUrl` del cliente (Task 1).
- Produces: `DirectivoRow.firmaUrl: string | null` disponible en el cliente.

- [ ] **Step 1: Añadir `firmaUrl` a `DirectivoRow`**

En `src/app/(admin)/organos/types.ts`, en el type `DirectivoRow`, después de `observaciones: string | null;` añadir:

```ts
  firmaUrl: string | null;
```

- [ ] **Step 2: Incluir `firmaUrl` en el `toRow` y en el `findMany`**

En `src/app/(admin)/organos/page.tsx`:

1. En la firma del parámetro de `toRow`, añadir el campo tras `observaciones: string | null;`:

```ts
  observaciones: string | null;
  firmaUrl: string | null;
```

2. En el objeto que devuelve `toRow`, tras `observaciones: d.observaciones,` añadir:

```ts
    observaciones: d.observaciones,
    firmaUrl: d.firmaUrl,
```

`firmaUrl` viene incluido por defecto en el resultado de `prisma.directivo.findMany` (no usa `select` a nivel de directivo, solo `include` del socio), así que no hay que tocar la query.

- [ ] **Step 3: Verificar typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -vE '^\.next' | grep -E 'error TS'`
Expected: sin salida.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(admin)/organos/types.ts" "src/app/(admin)/organos/page.tsx"
git commit -m "feat(organos): exponer firmaUrl en DirectivoRow

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RBS5YbhnmUJMWtygqp2fHh"
```

---

## Task 6: Componente FirmaUploader

**Files:**
- Create: `src/app/(admin)/organos/FirmaUploader.tsx`
- Modify: `src/app/(admin)/organos/organos.css`

**Interfaces:**
- Consumes: `subirFirma`, `eliminarFirma` de `./actions` (Task 4); `FOTO_ACCEPT`, `validateUpload`, `sniffMime`, `SNIFF_BYTES` de `@/lib/socios/limits`; `useToast`, `Icon`.
- Produces: `<FirmaUploader directivoId firmaUrl canWrite onChange />` componente cliente.

- [ ] **Step 1: Crear el componente**

Create `src/app/(admin)/organos/FirmaUploader.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import { Icon } from "@/components/admin/Icon";
import { useToast } from "@/components/admin/toast";
import { FOTO_ACCEPT, SNIFF_BYTES, sniffMime, validateUpload } from "@/lib/socios/limits";
import { subirFirma, eliminarFirma } from "./actions";

export function FirmaUploader({
  directivoId,
  firmaUrl,
  canWrite,
  onChange,
}: {
  directivoId: string;
  firmaUrl: string | null;
  canWrite: boolean;
  onChange: () => void;
}) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite re-elegir el mismo archivo
    if (!file) return;

    // Validación local (rápida) antes de subir: tamaño + contenido por magic bytes.
    const head = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
    const sniffed = sniffMime(head);
    const err = validateUpload(file, "foto", sniffed);
    if (err) {
      toast.error(err);
      return;
    }

    setBusy(true);
    const res = await subirFirma(directivoId, file);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Firma actualizada.");
    onChange();
  }

  async function onDelete() {
    setBusy(true);
    const res = await eliminarFirma(directivoId);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Firma eliminada.");
    onChange();
  }

  return (
    <div className="org-firma">
      {firmaUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="org-firma__img" src={firmaUrl} alt="Firma del directivo" />
      ) : (
        <div className="org-firma__empty">
          <Icon name="edit" size={16} />
          <span>Sin firma</span>
        </div>
      )}
      {canWrite && (
        <div className="org-firma__actions">
          <input
            ref={inputRef}
            type="file"
            accept={FOTO_ACCEPT}
            hidden
            onChange={onPick}
          />
          <button
            className="iconbtn"
            title={firmaUrl ? "Reemplazar firma" : "Subir firma"}
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            <Icon name="upload" size={16} />
          </button>
          {firmaUrl && (
            <button
              className="iconbtn iconbtn--danger"
              title="Eliminar firma"
              disabled={busy}
              onClick={onDelete}
            >
              <Icon name="trash" size={16} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
```

Nota: si algún `name` de `Icon` usado aquí (`edit`, `upload`) no existe en `@/components/admin/Icon`, sustituir por uno que sí exista (revisar el set de iconos disponible en ese archivo). `trash`, `settings`, `clock`, `plus`, `user` sí se usan ya en `OrganosClient.tsx`.

- [ ] **Step 2: Añadir estilos**

En `src/app/(admin)/organos/organos.css`, al final del archivo, añadir:

```css
/* Firma del directivo (subida/preview) */
.org-firma {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}
.org-firma__img {
  height: 40px;
  max-width: 160px;
  object-fit: contain;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 2px 4px;
}
.org-firma__empty {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #9ca3af;
}
.org-firma__actions {
  display: inline-flex;
  gap: 4px;
}
```

- [ ] **Step 3: Verificar typecheck y lint**

Run: `npx tsc --noEmit 2>&1 | grep -vE '^\.next' | grep -E 'error TS' ; npx eslint "src/app/(admin)/organos/FirmaUploader.tsx"`
Expected: sin líneas `error TS`; eslint exit 0.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(admin)/organos/FirmaUploader.tsx" "src/app/(admin)/organos/organos.css"
git commit -m "feat(organos): componente FirmaUploader

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RBS5YbhnmUJMWtygqp2fHh"
```

---

## Task 7: Integrar FirmaUploader en la lista de órganos

**Files:**
- Modify: `src/app/(admin)/organos/OrganosClient.tsx`

**Interfaces:**
- Consumes: `<FirmaUploader>` (Task 6); `DirectivoRow.firmaUrl` (Task 5); `router.refresh` (ya presente).
- Produces: firma editable en cada fila vigente.

- [ ] **Step 1: Importar el componente**

En `src/app/(admin)/organos/OrganosClient.tsx`, tras `import { CrearDirectivoModal } from "./CrearDirectivoModal";` añadir:

```ts
import { FirmaUploader } from "./FirmaUploader";
```

- [ ] **Step 2: Renderizar el uploader dentro de cada `org-item__main` de la lista de vigentes**

En el `<li>` de la lista de vigentes (el `map((d) => ...)` que empieza en la línea ~133), dentro de `<div className="org-item__main">`, después del `<span className="org-meta">…</span>` de cierre (línea ~147) y antes de cerrar el `</div>` de `org-item__main`, insertar:

```tsx
                    <FirmaUploader
                      directivoId={d.id}
                      firmaUrl={d.firmaUrl}
                      canWrite={perms.canWrite}
                      onChange={() => router.refresh()}
                    />
```

(No añadir el uploader en la lista de `historial`: las firmas solo se gestionan para cargos vigentes.)

- [ ] **Step 3: Verificar typecheck y lint**

Run: `npx tsc --noEmit 2>&1 | grep -vE '^\.next' | grep -E 'error TS' ; npx eslint "src/app/(admin)/organos/OrganosClient.tsx"`
Expected: sin líneas `error TS`; eslint exit 0.

- [ ] **Step 4: Verificación manual del flujo de gestión**

Run: `npm run dev` (o el dev server ya corriendo).
1. Ir a `/organos` autenticado con permiso `organos.write`.
2. En un cargo vigente, click en "Subir firma", elegir un PNG/JPG → aparece el preview, toast "Firma actualizada".
3. Recargar la página → el preview persiste.
4. Probar un archivo no-imagen (p. ej. `.pdf` renombrado a `.png`) → toast de error "No se reconoció el contenido..." o "Formato no permitido".
5. Click en eliminar (papelera) → vuelve a "Sin firma".
Expected: todos los pasos se comportan como se describe. Confirmar que en `private-uploads/organos/<id>/` se creó/borró el archivo.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(admin)/organos/OrganosClient.tsx"
git commit -m "feat(organos): gestionar firma en la lista de la junta directiva

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RBS5YbhnmUJMWtygqp2fHh"
```

---

## Task 8: Helper de resolución de firmas por cargo

**Files:**
- Create: `src/lib/organos/firmas.ts`

**Interfaces:**
- Consumes: `prisma` de `@/lib/prisma`.
- Produces:
  - `type FirmasConsejo = { presidente: string | null; tesorero: string | null; secretario: string | null }`
  - `resolveFirmasConsejo(): Promise<FirmasConsejo>` — firma del titular vigente de cada cargo en `consejo_directivo`.

- [ ] **Step 1: Crear el helper**

Create `src/lib/organos/firmas.ts`:

```ts
import "server-only";
import { prisma } from "@/lib/prisma";
import type { CargoDirectivo } from "@/generated/prisma/client";

// Firmas del Consejo Directivo vigente, por cargo, para renderizar en documentos.
export type FirmasConsejo = {
  presidente: string | null;
  tesorero: string | null;
  secretario: string | null;
};

const CARGOS: CargoDirectivo[] = ["presidente", "tesorero", "secretario"];

// Devuelve la URL de firma del titular vigente (hasta = null) de cada cargo del
// Consejo Directivo. null si el cargo está vacante o su titular no tiene firma.
export async function resolveFirmasConsejo(): Promise<FirmasConsejo> {
  const rows = await prisma.directivo.findMany({
    where: {
      organo: "consejo_directivo",
      cargo: { in: CARGOS },
      hasta: null,
      firmaUrl: { not: null },
    },
    select: { cargo: true, firmaUrl: true },
  });
  const out: FirmasConsejo = {
    presidente: null,
    tesorero: null,
    secretario: null,
  };
  for (const r of rows) {
    if (r.cargo === "presidente") out.presidente = r.firmaUrl;
    else if (r.cargo === "tesorero") out.tesorero = r.firmaUrl;
    else if (r.cargo === "secretario") out.secretario = r.firmaUrl;
  }
  return out;
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -vE '^\.next' | grep -E 'error TS'`
Expected: sin salida.

- [ ] **Step 3: Commit**

```bash
git add src/lib/organos/firmas.ts
git commit -m "feat(organos): resolver firmas del consejo directivo por cargo

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RBS5YbhnmUJMWtygqp2fHh"
```

---

## Task 9: Renderizar firmas en la constancia

**Files:**
- Modify: `src/app/(admin)/socios/[id]/constancia/page.tsx`
- Modify: `src/app/(admin)/socios/[id]/constancia/ConstanciaView.tsx`
- Modify: `src/app/(admin)/socios/[id]/constancia/constancia.css`

**Interfaces:**
- Consumes: `resolveFirmasConsejo`, `FirmasConsejo` de `@/lib/organos/firmas` (Task 8).
- Produces: la constancia pinta `<img>` sobre la línea de firma del cargo cuando existe.

- [ ] **Step 1: Resolver firmas en la página y pasarlas a la vista**

En `src/app/(admin)/socios/[id]/constancia/page.tsx`:

1. Añadir el import tras `import { contarInasistenciasInjustificadas } from "./asistencia";`:

```ts
import { resolveFirmasConsejo } from "@/lib/organos/firmas";
```

2. Después de `const inasistencias = await contarInasistenciasInjustificadas(socio.id);`, añadir:

```ts
  const firmas = await resolveFirmasConsejo();
```

3. En el JSX `<ConstanciaView ... />`, añadir la prop tras `inasistencias={inasistencias}`:

```tsx
      inasistencias={inasistencias}
      firmas={firmas}
```

- [ ] **Step 2: Aceptar la prop en ConstanciaView y renderizar las imágenes**

En `src/app/(admin)/socios/[id]/constancia/ConstanciaView.tsx`:

1. Añadir el import de tipo tras `import { DIMENSION_LABEL } from "@/lib/puestos/giro";`:

```ts
import type { FirmasConsejo } from "@/lib/organos/firmas";
```

2. En la lista de props del componente (después de `inasistencias,`), añadir `firmas,`; y en el type de props, tras `inasistencias: number;`, añadir:

```ts
  firmas: FirmasConsejo;
```

3. Reemplazar el bloque `<div className="constancia__firmas">…</div>` (líneas ~332-360) por la versión con imágenes. Cada slot pinta su `<img>` (si hay URL) por encima de la línea. Mapeo: Tesorería→`firmas.tesorero`, Presidencia→`firmas.presidente`, Secretaría→`firmas.secretario`:

```tsx
        <div className="constancia__firmas">
          {noAdeudo ? (
            <>
              <div className="constancia__firma">
                {firmas.tesorero && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="constancia__firma-img" src={firmas.tesorero} alt="Firma de Tesorería" />
                )}
                <div className="constancia__firma-line" />
                <div className="constancia__firma-label">Tesorería</div>
                <div className="constancia__firma-sub">Junta Directiva</div>
              </div>
              <div className="constancia__firma">
                {firmas.presidente && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="constancia__firma-img" src={firmas.presidente} alt="Firma de Presidencia" />
                )}
                <div className="constancia__firma-line" />
                <div className="constancia__firma-label">Presidencia</div>
                <div className="constancia__firma-sub">Junta Directiva</div>
              </div>
            </>
          ) : (
            <>
              <div className="constancia__firma">
                {firmas.presidente && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="constancia__firma-img" src={firmas.presidente} alt="Firma de Presidencia" />
                )}
                <div className="constancia__firma-line" />
                <div className="constancia__firma-label">Presidencia</div>
                <div className="constancia__firma-sub">Junta Directiva</div>
              </div>
              <div className="constancia__firma">
                {firmas.secretario && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="constancia__firma-img" src={firmas.secretario} alt="Firma de Secretaría" />
                )}
                <div className="constancia__firma-line" />
                <div className="constancia__firma-label">Secretaría</div>
                <div className="constancia__firma-sub">Junta Directiva</div>
              </div>
            </>
          )}
        </div>
```

- [ ] **Step 3: Estilo de la imagen de firma**

En `src/app/(admin)/socios/[id]/constancia/constancia.css`, tras el bloque `.constancia__firma-line { … }` (línea ~204), añadir:

```css
.constancia__firma-img {
  display: block;
  height: 56px;
  max-width: 100%;
  margin: 0 auto -4px;
  object-fit: contain;
}
```

Y dentro del bloque `@media print` (que empieza en ~línea 380 con `.constancia__firmas`), asegurar que la imagen imprima sus colores; añadir dentro de ese bloque:

```css
  .constancia__firma-img {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
```

- [ ] **Step 4: Verificar typecheck y lint**

Run: `npx tsc --noEmit 2>&1 | grep -vE '^\.next' | grep -E 'error TS' ; npx eslint "src/app/(admin)/socios/[id]/constancia/ConstanciaView.tsx" "src/app/(admin)/socios/[id]/constancia/page.tsx"`
Expected: sin líneas `error TS`; eslint exit 0.

- [ ] **Step 5: Verificación manual end-to-end**

1. Con una firma cargada al `presidente` vigente del `consejo_directivo` (Task 7), abrir la constancia de un socio activo: `/socios/<id>/constancia`.
2. La firma del presidente debe verse por encima de la línea de "Presidencia". Cargos sin firma → línea en blanco (sin regresión).
3. Cambiar el tipo a "no adeudo" (si el socio califica) → verificar que Tesorería y Presidencia muestran sus firmas respectivas.
4. Vista previa de impresión (Ctrl+P) → la firma aparece correctamente posicionada.
Expected: firmas renderizadas por cargo; sin firma = línea en blanco.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(admin)/socios/[id]/constancia/page.tsx" "src/app/(admin)/socios/[id]/constancia/ConstanciaView.tsx" "src/app/(admin)/socios/[id]/constancia/constancia.css"
git commit -m "feat(constancia): renderizar firmas de la junta directiva por cargo

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RBS5YbhnmUJMWtygqp2fHh"
```

---

## Task 10: Verificación final integral

**Files:** ninguno (solo verificación).

- [ ] **Step 1: Typecheck completo**

Run: `npx tsc --noEmit 2>&1 | grep -vE '^\.next' | grep -E 'error TS' ; echo "done"`
Expected: sin líneas `error TS` antes de `done`.

- [ ] **Step 2: Lint completo**

Run: `npx eslint`
Expected: exit 0.

- [ ] **Step 3: Build de producción (opcional pero recomendado)**

Run: `npx next build`
Expected: build exitoso, sin errores de tipo ni de rutas.

- [ ] **Step 4: Repaso de seguridad**

Confirmar manualmente:
- La ruta `/api/uploads/organos/[id]/[file]` exige `organos.read` (un usuario sin permiso recibe 401/403 vía `requirePermission`).
- `subirFirma`/`eliminarFirma` exigen `organos.write`.
- Un `directivoId` con caracteres inválidos hace fallar `safeDir` (Error controlado → `fail`).
- `.gitignore` ignora `private-uploads/` (verificar; si no, añadirlo — las firmas no deben commitearse). Run: `grep -n "private-uploads" .gitignore || echo "FALTA: añadir private-uploads/ a .gitignore"`.

- [ ] **Step 5: Commit si hubo ajustes (p. ej. .gitignore)**

```bash
git add -A
git commit -m "chore(organos): ajustes finales de verificación de firmas

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RBS5YbhnmUJMWtygqp2fHh"
```

---

## Notas de diseño / decisiones

- **Permiso de la imagen en la constancia:** el `<img src="/api/uploads/organos/...">` se carga con la sesión del usuario que ve la constancia. Si ese usuario no tiene `organos.read`, la imagen no carga y la línea queda en blanco (degradación aceptable). La constancia hoy exige `socios.read`.
- **Firma vinculada al titular vigente:** el documento usa la firma del titular vigente del cargo al momento de generarse; no congela histórico.
- **Alcance del render:** solo la constancia en este plan (es la que tiene slots claros de Presidencia/Tesorería/Secretaría). Contrato y comprobante quedan fuera salvo que se confirme que tienen slots equivalentes; extender es trivial reutilizando `resolveFirmasConsejo`.
