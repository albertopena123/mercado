# Módulo de firmas de la junta directiva — Diseño

**Fecha:** 2026-07-18
**Estado:** Aprobado (diseño), pendiente de plan de implementación

## Objetivo

Permitir subir imágenes de firma (PNG/JPG/WEBP) del presidente y demás miembros de
la junta directiva, y que esas firmas se rendericen automáticamente sobre las líneas
de firma de los documentos generados (constancia, y donde apliquen contrato y
comprobante), casando por cargo.

## Concepto central

La firma es un **atributo del `Directivo` existente** (no un modelo nuevo, no una lista
paralela por cargo). Los documentos siguen renderizando **por cargo**: al generar un
documento, para cada slot de firma se resuelve el **Directivo activo** (`hasta = null`)
de ese cargo y se pinta su `firmaUrl` sobre la línea. Si no hay firma, queda la línea en
blanco (comportamiento actual, sin regresión).

## 1. Datos (Prisma)

Nueva migración timestamped en `prisma/migrations/` que añade a `model Directivo`
(`prisma/schema.prisma`):

- `firmaUrl String?`
- `firmaUploadedAt DateTime?`
- `firmaUploadedById String?`

Mismo patrón de auditoría que `Transferencia.renunciaUrl` / `...UploadedById` /
`...UploadedAt`. El cliente Prisma se regenera (`@/generated/prisma/client`).

## 2. Almacenamiento

`src/lib/organos/storage.ts` (`server-only`), copiando el patrón de
`src/lib/transferencias/storage.ts`:

- Root: `path.join(process.cwd(), "private-uploads", "organos")`.
- `writeFirma(directivoId, fileName, buffer)` → devuelve URL relativa
  `/api/uploads/organos/<directivoId>/<fileName>`.
- `readFirma(id, file)`, `removeFirma(id, file)`, `extFromMime(mime)`.
- Valida `id` con `/^[a-z0-9]+$/i` y `fileName` con `/^[a-z0-9._-]+$/i` (anti path-traversal).
- Nombre de archivo: `firma-<timestamp>.<ext>` (timestamp pasado desde la action, no
  `Date.now()` en helper para mantener el helper puro/testeable — el timestamp lo genera
  la action).

Validación reutilizando `src/lib/socios/limits.ts` (fuente única cliente+servidor):
- `validateUpload(file, "foto", sniffedType)` — solo imágenes (`FOTO_MIME`:
  jpeg/png/webp), `MAX_UPLOAD_MB = 10`.
- `sniffMime(head)` sobre `SNIFF_BYTES` (magic bytes; NO confía en `file.type`).
- `FOTO_ACCEPT` para el `<input accept>`.

## 3. Ruta protegida de servido

`src/app/api/uploads/organos/[id]/[file]/route.ts`, copiando
`src/app/api/uploads/transferencias/[id]/[file]/route.ts`:

- `await requirePermission("organos.read")`.
- `Content-Type` por extensión, `X-Content-Type-Options: nosniff`,
  `Content-Disposition: inline` (son imágenes), `Cache-Control: private`.

## 4. Server actions

En `src/app/(admin)/organos/actions.ts` (`"use server"`), gated con el `authorize`
local por `organos.write`:

- `subirFirma(directivoId: string, file: File): Promise<ActionResult<{ firmaUrl: string }>>`
  1. `authorize("organos.write")`.
  2. Sniff de los primeros `SNIFF_BYTES`; `validateUpload(file, "foto", sniffed)`.
  3. Rechaza si `sniffed` es null ("No se reconoció el contenido...").
  4. `buffer = Buffer.from(await file.arrayBuffer())`.
  5. `fileName = \`firma-${Date.now()}.${extFromMime(sniffed)}\``.
  6. `url = await writeFirma(directivoId, fileName, buffer)`.
  7. Lee `firmaUrl` previa; si existe, borra el archivo anterior (evita huérfanos).
  8. `prisma.directivo.update({ data: { firmaUrl: url, firmaUploadedAt: new Date(),
     firmaUploadedById: me.id }})`.
  9. `revalidatePath("/organos")`.
- `eliminarFirma(directivoId: string): Promise<ActionResult>` — borra archivo + limpia
  los 3 campos + revalida.
- Ambas: `try/catch` con `unstable_rethrow(e)` primero, `ActionResult` vía `ok()`/`fail()`.

## 5. UI (gestión)

En `src/app/(admin)/organos/` (`OrganosClient.tsx` y/o la fila/tarjeta del directivo):

- Preview de la firma actual (`<img>` a la ruta protegida) o placeholder "Sin firma"
  cuando `firmaUrl` es null. **Sin datos ficticios.**
- Botón "Subir firma" / "Reemplazar" (input `accept={FOTO_ACCEPT}`) y "Eliminar",
  visibles solo con `perms.canWrite`.
- `page.tsx` incluye `firmaUrl` en el DTO serializable que pasa al cliente.
- Estados de carga/error consistentes con el resto del módulo (`ActionResult`).

## 6. Render en documentos

- Helper (p. ej. en `src/app/(admin)/socios/[id]/constancia/shared.ts` o un
  `src/lib/organos/firmas.ts`) que resuelve `{ presidente?: url, tesorero?: url,
  secretario?: url }` consultando los `Directivo` activos (`hasta = null`,
  `organo = consejo_directivo`) de esos cargos.
- El componente servidor del documento (`ConstanciaView` y donde apliquen
  `ContratoView` / `ComprobanteView`) recibe ese mapa por props.
- En la vista, sobre cada `constancia__firma-line`, si hay URL para ese cargo se inserta
  `<img class="constancia__firma-img" src={url} alt="Firma" />`. Casado:
  **Presidencia→presidente, Tesorería→tesorero, Secretaría→secretario**.
- Si no hay firma para el cargo, no se renderiza `<img>` y queda la línea en blanco.
- CSS en `constancia.css` (y equivalentes): tamaño/alto máximo, `object-fit: contain`,
  posicionada sobre la línea sin romper el layout de impresión (`@media print`).

## Decisiones tomadas (autónomas)

- Permisos: se reutilizan `organos.read` / `organos.write`. No se crean permisos nuevos.
- Render solo donde ya existen slots de firma y hay un cargo mapeable.
- La firma se vincula al Directivo activo del cargo **al momento de generar** el documento
  (no se congela histórico en el documento).

## Fuera de alcance (YAGNI)

- Recorte/edición de imagen en el navegador.
- Versionado/histórico de firmas.
- Firma digital criptográfica / validez legal de firma electrónica.
- Firmas para órganos distintos a `consejo_directivo` en documentos (el módulo de
  gestión sí permite subir firma a cualquier Directivo; el render solo usa los 3 cargos
  con slot).

## Archivos afectados (resumen)

| Acción | Archivo |
|---|---|
| Crear | `prisma/migrations/<ts>_directivo_firma/migration.sql` |
| Editar | `prisma/schema.prisma` (modelo `Directivo`) |
| Crear | `src/lib/organos/storage.ts` |
| Crear | `src/app/api/uploads/organos/[id]/[file]/route.ts` |
| Editar | `src/app/(admin)/organos/actions.ts` (subirFirma, eliminarFirma) |
| Editar | `src/app/(admin)/organos/page.tsx` (firmaUrl en DTO) |
| Editar | `src/app/(admin)/organos/OrganosClient.tsx` (+ tipos) |
| Editar | `src/app/(admin)/organos/types.ts` |
| Crear/Editar | helper de resolución de firmas por cargo |
| Editar | `ConstanciaView.tsx` (+ contrato/comprobante donde apliquen) y sus `.css` |
