# Autoservicio "Actualizar mis datos" (DNI + apidatos) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un socio del portal ingrese su DNI, autollene sus datos desde apidatos, los edite y envíe una solicitud que un admin aprueba/rechaza; al aprobar, se aplica al padrón de forma atómica y auditada.

**Architecture:** Modelo `SolicitudActualizacionDatos` (estado pendiente/aprobada/rechazada, snapshot JSON de los valores propuestos). El socio crea la solicitud desde `/portal/perfil/actualizar`. El admin la revisa en `/socios/solicitudes`. La aprobación reutiliza la ruta validada de `updateSocio` (refactorizada a `lib/socios/update.ts`) dentro de una sola transacción.

**Tech Stack:** Next.js 16.2.6 (App Router, Server Actions), React 19, Prisma 7 (Postgres), TypeScript, Tailwind 4. apidatos UNAMAD vía `lookupDniUnamad`.

## Global Constraints

- **Next.js 16.2.6** — Server Actions con `"use server"`; un módulo `"use server"` SOLO puede exportar funciones async (por eso la validación pura va en un módulo aparte). `cookies()/headers()` son async (ya encapsulados en `getCurrentUser`).
- **Sin test runner** — verificación = `npx tsc --noEmit` + `npm run lint` (script `lint` = `eslint`) + scripts `prisma/verify-*.ts` + prueba manual. NO crear jest/vitest.
- **No auto-commit** — los commits los decide el usuario; cada tarea cierra con gate de tipos+lint, no con `git commit`.
- **Auth portal** — las acciones del socio derivan el socio del usuario logueado vía `getSocioActual()`; IGNORAN cualquier id que venga del cliente. Las acciones admin usan `authorize("socios.write")`.
- **Whitelist de campos editables** (única fuente): `tipoDocumento, numeroDocumento, apellidoPaterno, apellidoMaterno, nombres, fechaNacimiento, sexo, estadoCivil, telefono, email, direccion, distrito, provincia, departamento`. Nunca: `codigo, numeroPadron, estado, fechaIngreso, saldoAFavor, observaciones, portalEnabled, userId, fotoUrl`.
- **Convención fechas** — fechas de calendario en UTC medianoche; "no futura" se mide contra hoy-Perú (ya lo hace `validateSocioInput`).
- **Estilos** — portal: `pt-panel, pt-field, pt-field__err, pt-btn, pt-back, pt-hello`. Admin: clases existentes del área socios. Feedback: `useToast` de `@/components/admin/toast` (disponible en el shell del socio).

---

## File Structure

**Crear**
- `prisma/migrations/<ts>_solicitud_actualizacion_datos/migration.sql` — enum + tabla + índice parcial único.
- `src/lib/socios/update.ts` — `validateSocioInput`, `buildSocioUpdateData`, `EMAIL_RE` (extraídos de `(admin)/socios/actions.ts`).
- `src/app/(socio)/portal/perfil/actualizar/page.tsx` — Server Component (carga datos + estado de solicitud).
- `src/app/(socio)/portal/perfil/ActualizarDatosForm.tsx` — Client Component (DNI→autollenar→editar→enviar).
- `src/app/(admin)/socios/solicitudes/page.tsx` — Server Component (lista de pendientes con diff).
- `src/app/(admin)/socios/solicitudes/SolicitudesList.tsx` — Client Component (aprobar/rechazar).
- `src/app/(admin)/socios/solicitudes/actions.ts` — `listSolicitudesPendientes`, `aprobarSolicitud`, `rechazarSolicitud`.
- `prisma/verify-solicitudes.ts` — script de verificación.

**Modificar**
- `prisma/schema.prisma` — enum `EstadoSolicitudActualizacion` + modelo `SolicitudActualizacionDatos` + relaciones inversas en `Socio` y `User`.
- `src/app/(admin)/socios/actions.ts` — quitar `validateSocioInput`/`EMAIL_RE` inline; importar de `lib/socios/update.ts`; `updateSocio` delega en `buildSocioUpdateData`.
- `src/lib/portal/data.ts` — `getMisDatosCompletos`, `getMiSolicitudActiva`.
- `src/app/(socio)/portal/actions.ts` — `lookupDniPortal`, `crearSolicitudActualizacion`, `cancelarMiSolicitud`.
- `src/app/(socio)/portal/perfil/page.tsx` — tarjeta "Actualizar mis datos" + aviso de solicitud activa.
- `src/app/(admin)/socios/page.tsx` + `SociosClient.tsx` — chip con contador de solicitudes pendientes → `/socios/solicitudes`.

---

## Task 1: Modelo `SolicitudActualizacionDatos` + migración

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<ts>_solicitud_actualizacion_datos/migration.sql` (vía Prisma)

**Interfaces:**
- Produces: tabla `SolicitudActualizacionDatos` (cols: `id, socioId, datos Json, estado, motivoRechazo, creadoEn, revisadoPorId, revisadoEn`), enum `EstadoSolicitudActualizacion`, índice parcial único `SolicitudActualizacion_unica_pendiente_por_socio`. Cliente Prisma `prisma.solicitudActualizacionDatos`.

- [ ] **Step 1: Añadir enum + modelo al schema**

En `prisma/schema.prisma`, tras el bloque `SocioEstadoLog` (línea ~249):

```prisma
enum EstadoSolicitudActualizacion {
  pendiente
  aprobada
  rechazada
}

// Solicitud de actualización de datos hecha por el propio socio desde el portal.
// `datos` es el snapshot JSON de los valores propuestos (solo campos de la
// whitelist del autoservicio). El admin la revisa y al APROBAR se aplica al
// padrón por la misma ruta validada que updateSocio. Un índice parcial único
// (ver migración) garantiza máximo UNA pendiente por socio.
model SolicitudActualizacionDatos {
  id            String                       @id @default(cuid())
  socioId       String
  datos         Json
  estado        EstadoSolicitudActualizacion @default(pendiente)
  motivoRechazo String?
  creadoEn      DateTime                     @default(now())
  revisadoPorId String?
  revisadoEn    DateTime?

  socio       Socio @relation(fields: [socioId], references: [id], onDelete: Cascade)
  revisadoPor User? @relation("SolicitudRevisadaPor", fields: [revisadoPorId], references: [id], onDelete: SetNull)

  @@index([socioId])
  @@index([estado])
}
```

- [ ] **Step 2: Añadir relaciones inversas**

En `model Socio` (junto a `estadoLog SocioEstadoLog[]`, ~línea 201):

```prisma
  solicitudesActualizacion SolicitudActualizacionDatos[]
```

En `model User` (junto a `socioEstadoLogs ... @relation("SocioEstadoLogBy")`, ~línea 33):

```prisma
  solicitudesRevisadas SolicitudActualizacionDatos[] @relation("SolicitudRevisadaPor")
```

- [ ] **Step 3: Crear la migración SIN aplicarla**

Run: `npx prisma migrate dev --create-only --name solicitud_actualizacion_datos`
Expected: crea `prisma/migrations/<ts>_solicitud_actualizacion_datos/migration.sql` con el `CREATE TYPE` + `CREATE TABLE` + índices + FKs. NO aplica todavía.

- [ ] **Step 4: Añadir el índice parcial único a la migración**

Al final de ese `migration.sql`, añadir (mismo patrón que `20260620130000_cuota_nro_operacion`):

```sql
-- Máximo UNA solicitud pendiente por socio (Prisma no expresa índices parciales).
CREATE UNIQUE INDEX "SolicitudActualizacion_unica_pendiente_por_socio"
  ON "SolicitudActualizacionDatos"("socioId")
  WHERE estado = 'pendiente';
```

- [ ] **Step 5: Aplicar la migración y regenerar el cliente**

Run: `npx prisma migrate dev`
Expected: aplica la migración sin errores.
Run: `npx prisma generate`
Expected: regenera `src/generated/prisma` (ya incluye `SolicitudActualizacionDatos`).

- [ ] **Step 6: Gate de tipos**

Run: `npx tsc --noEmit`
Expected: PASS (el nuevo modelo no rompe nada).

---

## Task 2: Refactor — extraer `validateSocioInput` + `buildSocioUpdateData`

Necesario porque un módulo `"use server"` solo puede exportar funciones async; la validación (sync) debe vivir fuera para reutilizarse en aprobación y portal.

**Files:**
- Create: `src/lib/socios/update.ts`
- Modify: `src/app/(admin)/socios/actions.ts` (eliminar inline, importar, delegar)

**Interfaces:**
- Produces:
  - `validateSocioInput(input: Partial<CreateSocioInput>, isCreate: boolean): { fieldErrors: Record<string,string>; normalized: Partial<CreateSocioInput> }`
  - `buildSocioUpdateData(normalized: Partial<CreateSocioInput>, existing: SocioUpdateBase): { data: Prisma.SocioUpdateInput; docCambia: boolean }`
  - `type SocioUpdateBase = { codigo: string; numeroPadron: number|null; numeroDocumento: string; apellidoPaterno: string; apellidoMaterno: string|null; nombres: string; tipoDocumento: TipoDocumento }`
  - `EMAIL_RE: RegExp`

- [ ] **Step 1: Crear `src/lib/socios/update.ts`**

```ts
// Validación y mapeo a Prisma de los datos de un socio. Vive fuera de los
// módulos "use server" para poder reutilizarse desde varias acciones (creación,
// edición admin, aprobación de solicitudes del portal). NO toca la BD.
import { Prisma, type TipoDocumento } from "@/generated/prisma/client";
import {
  validateNumeroDocumento,
  normalizeNumeroDocumento,
  esDocumentoPendiente,
} from "@/lib/socios/document";
import { buildSocioSearchKey } from "@/lib/socios/normalize";
import { inicioDiaUTC, hoyISOPeru } from "@/lib/fecha";
import type { CreateSocioInput } from "@/app/(admin)/socios/types";

export const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

type FieldErrors = Record<string, string>;

export function validateSocioInput(
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
    const tipo = input.tipoDocumento ?? out.tipoDocumento;
    const num = (input.numeroDocumento ?? "").trim();
    if (!num) fe.numeroDocumento = "Número de documento requerido.";
    else if (esDocumentoPendiente(num)) out.numeroDocumento = num;
    else if (tipo && !validateNumeroDocumento(tipo, num))
      fe.numeroDocumento = "Formato inválido para el tipo de documento.";
    else if (tipo) out.numeroDocumento = normalizeNumeroDocumento(tipo, num);
  }

  if (input.numeroPadron !== undefined) {
    const v = input.numeroPadron;
    if (v === null || v === 0) out.numeroPadron = null;
    else if (!Number.isInteger(v) || v < 0 || v > 100000)
      fe.numeroPadron = "Nº de padrón inválido (entero positivo).";
    else out.numeroPadron = v;
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

  const hoyUTC = inicioDiaUTC(hoyISOPeru()).getTime();

  if (isCreate || input.fechaIngreso !== undefined) {
    const fi = input.fechaIngreso ?? "";
    const d = fi ? new Date(fi) : null;
    if (!d || isNaN(d.getTime())) fe.fechaIngreso = "Fecha de ingreso inválida.";
    else if (d.getTime() > hoyUTC)
      fe.fechaIngreso = "La fecha de ingreso no puede ser futura.";
    else out.fechaIngreso = d.toISOString();
  }

  if (input.fechaNacimiento !== undefined && input.fechaNacimiento !== "") {
    const d = new Date(input.fechaNacimiento);
    if (isNaN(d.getTime())) fe.fechaNacimiento = "Fecha de nacimiento inválida.";
    else if (d.getTime() > hoyUTC)
      fe.fechaNacimiento = "Fecha de nacimiento futura.";
    else out.fechaNacimiento = d.toISOString();
  } else if (input.fechaNacimiento === "") {
    out.fechaNacimiento = undefined;
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

export type SocioUpdateBase = {
  codigo: string;
  numeroPadron: number | null;
  numeroDocumento: string;
  apellidoPaterno: string;
  apellidoMaterno: string | null;
  nombres: string;
  tipoDocumento: TipoDocumento;
};

// Mapea un patch normalizado a Prisma.SocioUpdateInput (incl. searchKey
// recomputado). NO setea updatedBy: lo añade el caller. Devuelve docCambia para
// que el caller propague el documento al User si corresponde.
export function buildSocioUpdateData(
  normalized: Partial<CreateSocioInput>,
  existing: SocioUpdateBase,
): { data: Prisma.SocioUpdateInput; docCambia: boolean } {
  const data: Prisma.SocioUpdateInput = {};
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
  if ("estadoCivil" in normalized) data.estadoCivil = normalized.estadoCivil ?? null;
  if ("telefono" in normalized) data.telefono = normalized.telefono ?? null;
  if ("email" in normalized) data.email = normalized.email ?? null;
  if ("direccion" in normalized) data.direccion = normalized.direccion ?? null;
  if ("distrito" in normalized) data.distrito = normalized.distrito ?? null;
  if ("provincia" in normalized) data.provincia = normalized.provincia ?? null;
  if ("departamento" in normalized)
    data.departamento = normalized.departamento ?? null;
  if (normalized.fechaIngreso) data.fechaIngreso = new Date(normalized.fechaIngreso);
  if ("observaciones" in normalized)
    data.observaciones = normalized.observaciones ?? null;
  if ("numeroPadron" in normalized) data.numeroPadron = normalized.numeroPadron ?? null;

  const finalAM =
    "apellidoMaterno" in normalized
      ? normalized.apellidoMaterno ?? null
      : existing.apellidoMaterno;
  const finalPadron =
    "numeroPadron" in normalized
      ? normalized.numeroPadron ?? null
      : existing.numeroPadron;
  data.searchKey = buildSocioSearchKey({
    codigo: existing.codigo,
    numeroDocumento: normalized.numeroDocumento ?? existing.numeroDocumento,
    numeroPadron: finalPadron,
    apellidoPaterno: normalized.apellidoPaterno ?? existing.apellidoPaterno,
    apellidoMaterno: finalAM,
    nombres: normalized.nombres ?? existing.nombres,
  });

  const docCambia =
    normalized.tipoDocumento !== undefined ||
    normalized.numeroDocumento !== undefined;
  return { data, docCambia };
}
```

- [ ] **Step 2: Quitar el inline en `actions.ts` e importar**

En `src/app/(admin)/socios/actions.ts`:
- Borrar la constante `EMAIL_RE` (línea ~55) y la función `validateSocioInput` (líneas ~94-195).
- Añadir a los imports del top:

```ts
import {
  validateSocioInput,
  buildSocioUpdateData,
  EMAIL_RE,
} from "@/lib/socios/update";
```

(Si tras quitar `validateSocioInput` quedan imports ahora sin uso —`validateNumeroDocumento`, `normalizeNumeroDocumento`, `inicioDiaUTC`, `hoyISOPeru`— quitarlos solo si ya no se usan en otras partes del archivo; `esDocumentoPendiente`, `buildSocioSearchKey`, `normalizeToken` probablemente siguen en uso. Dejar que el gate de lint marque los no usados.)

- [ ] **Step 3: Refactor de `updateSocio` para delegar**

En `updateSocio` (src/app/(admin)/socios/actions.ts ~824-873), reemplazar el bloque que arma `data` + `searchKey` por:

```ts
    const { data, docCambia } = buildSocioUpdateData(normalized, existing);
    data.updatedBy = { connect: { id: me.id } };
```

y en la transacción usar `docCambia` en lugar de recomputarlo:

```ts
        if (existing.userId && docCambia) {
          await tx.user.update({
            where: { id: existing.userId },
            data: {
              tipoDocumento: normalized.tipoDocumento ?? existing.tipoDocumento,
              numeroDocumento:
                normalized.numeroDocumento ?? existing.numeroDocumento,
            },
          });
        }
```

(El resto de `updateSocio` —authorize, findUnique de `existing` con `userId`, validate, P2002, refresh— queda igual.)

- [ ] **Step 4: Gate de tipos + lint**

Run: `npx tsc --noEmit`
Expected: PASS (mismas firmas, comportamiento idéntico).
Run: `npm run lint`
Expected: sin errores (corregir imports no usados si los marca).

---

## Task 3: Datos del portal (`getMisDatosCompletos`, `getMiSolicitudActiva`)

**Files:**
- Modify: `src/lib/portal/data.ts`

**Interfaces:**
- Consumes: `prisma`, `esDocumentoPendiente` de `@/lib/socios/document`.
- Produces:
  - `type MisDatosActuales` (whitelist + `documentoPendiente: boolean`)
  - `getMisDatosCompletos(socioId: string): Promise<MisDatosActuales>`
  - `type EstadoMiSolicitud = { estado: "ninguna" } | { estado: "pendiente"; id: string; creadoEn: string } | { estado: "rechazada"; id: string; motivoRechazo: string | null; revisadoEn: string | null }`
  - `getMiSolicitudActiva(socioId: string): Promise<EstadoMiSolicitud>`

- [ ] **Step 1: Añadir tipos + funciones a `data.ts`**

Al final de `src/lib/portal/data.ts` (asegurar imports `Sexo, TipoDocumento` desde `@/generated/prisma/client` y `esDocumentoPendiente` desde `@/lib/socios/document`):

```ts
export type MisDatosActuales = {
  tipoDocumento: TipoDocumento;
  numeroDocumento: string;
  apellidoPaterno: string;
  apellidoMaterno: string | null;
  nombres: string;
  fechaNacimiento: string | null; // yyyy-mm-dd
  sexo: Sexo | null;
  estadoCivil: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  distrito: string | null;
  provincia: string | null;
  departamento: string | null;
  documentoPendiente: boolean; // SIN-DNI-#### → invita a regularizar
};

export async function getMisDatosCompletos(
  socioId: string,
): Promise<MisDatosActuales> {
  const s = await prisma.socio.findUniqueOrThrow({
    where: { id: socioId },
    select: {
      tipoDocumento: true,
      numeroDocumento: true,
      apellidoPaterno: true,
      apellidoMaterno: true,
      nombres: true,
      fechaNacimiento: true,
      sexo: true,
      estadoCivil: true,
      telefono: true,
      email: true,
      direccion: true,
      distrito: true,
      provincia: true,
      departamento: true,
    },
  });
  return {
    ...s,
    fechaNacimiento: s.fechaNacimiento
      ? s.fechaNacimiento.toISOString().slice(0, 10)
      : null,
    documentoPendiente: esDocumentoPendiente(s.numeroDocumento),
  };
}

export type EstadoMiSolicitud =
  | { estado: "ninguna" }
  | { estado: "pendiente"; id: string; creadoEn: string }
  | {
      estado: "rechazada";
      id: string;
      motivoRechazo: string | null;
      revisadoEn: string | null;
    };

export async function getMiSolicitudActiva(
  socioId: string,
): Promise<EstadoMiSolicitud> {
  // La pendiente manda; si no hay, mostramos la última rechazada (con motivo)
  // para que el socio sepa por qué y pueda reenviar.
  const pendiente = await prisma.solicitudActualizacionDatos.findFirst({
    where: { socioId, estado: "pendiente" },
    select: { id: true, creadoEn: true },
  });
  if (pendiente)
    return {
      estado: "pendiente",
      id: pendiente.id,
      creadoEn: pendiente.creadoEn.toISOString(),
    };
  const rechazada = await prisma.solicitudActualizacionDatos.findFirst({
    where: { socioId, estado: "rechazada" },
    orderBy: { revisadoEn: "desc" },
    select: { id: true, motivoRechazo: true, revisadoEn: true },
  });
  if (rechazada)
    return {
      estado: "rechazada",
      id: rechazada.id,
      motivoRechazo: rechazada.motivoRechazo,
      revisadoEn: rechazada.revisadoEn?.toISOString() ?? null,
    };
  return { estado: "ninguna" };
}
```

- [ ] **Step 2: Gate de tipos**

Run: `npx tsc --noEmit`
Expected: PASS.

---

## Task 4: Acciones del portal (lookup, crear, cancelar)

**Files:**
- Modify: `src/app/(socio)/portal/actions.ts`

**Interfaces:**
- Consumes: `getSocioActual`, `validateSocioInput` (Task 2), `lookupDniUnamad`, `DniLookupResult`, `ActionResult` (de `@/app/(admin)/socios/types`).
- Produces:
  - `type PerfilSelfInput` (whitelist como strings opcionales + `tipoDocumento`)
  - `lookupDniPortal(dni: string): Promise<ActionResult<DniLookupResult>>`
  - `crearSolicitudActualizacion(input: PerfilSelfInput): Promise<ActionResult<{ id: string }>>`
  - `cancelarMiSolicitud(): Promise<ActionResult>`

- [ ] **Step 1: Añadir imports y helpers a `portal/actions.ts`**

En el top de `src/app/(socio)/portal/actions.ts` (ya tiene `"use server"`, `prisma`, `getSocioActual`, `revalidatePath`):

```ts
import { Prisma, type TipoDocumento } from "@/generated/prisma/client";
import { lookupDniUnamad, type DniLookupResult } from "@/lib/socios/dni-lookup";
import { validateSocioInput } from "@/lib/socios/update";
import type { ActionResult } from "@/app/(admin)/socios/types";
import type { CreateSocioInput } from "@/app/(admin)/socios/types";
```

- [ ] **Step 2: `lookupDniPortal`**

```ts
export async function lookupDniPortal(
  dni: string,
): Promise<ActionResult<DniLookupResult>> {
  const r = await getSocioActual();
  if (!r) return { ok: false, error: "Debes iniciar sesión como socio." };
  const clean = (dni ?? "").trim();
  if (!/^\d{8}$/.test(clean))
    return { ok: false, error: "El DNI debe tener exactamente 8 dígitos." };
  let data: DniLookupResult | null;
  try {
    data = await lookupDniUnamad(clean);
  } catch (e) {
    console.error("lookupDniPortal fetch", e);
    const err = e as { name?: string };
    if (err?.name === "AbortError")
      return { ok: false, error: "La consulta al servicio de DNI tardó demasiado." };
    return { ok: false, error: "No se pudo consultar el servicio de DNI." };
  }
  if (!data) return { ok: false, error: "No se encontró información para este DNI." };
  return { ok: true, data };
}
```

- [ ] **Step 3: `PerfilSelfInput` + `crearSolicitudActualizacion`**

```ts
export type PerfilSelfInput = {
  tipoDocumento: TipoDocumento;
  numeroDocumento: string;
  apellidoPaterno: string;
  apellidoMaterno?: string;
  nombres: string;
  fechaNacimiento?: string;
  sexo?: "M" | "F";
  estadoCivil?: string;
  telefono?: string;
  email?: string;
  direccion?: string;
  distrito?: string;
  provincia?: string;
  departamento?: string;
};

// Solo los campos de la whitelist del autoservicio (defensa contra inyección de
// campos como estado/numeroPadron).
const SELF_FIELDS = [
  "tipoDocumento",
  "numeroDocumento",
  "apellidoPaterno",
  "apellidoMaterno",
  "nombres",
  "fechaNacimiento",
  "sexo",
  "estadoCivil",
  "telefono",
  "email",
  "direccion",
  "distrito",
  "provincia",
  "departamento",
] as const;

export async function crearSolicitudActualizacion(
  input: PerfilSelfInput,
): Promise<ActionResult<{ id: string }>> {
  const r = await getSocioActual();
  if (!r) return { ok: false, error: "Debes iniciar sesión como socio." };

  // Filtrar a la whitelist antes de validar.
  const clean: Partial<CreateSocioInput> = {};
  for (const k of SELF_FIELDS) {
    const v = (input as Record<string, unknown>)[k];
    if (v !== undefined) (clean as Record<string, unknown>)[k] = v;
  }

  const { fieldErrors, normalized } = validateSocioInput(clean, false);
  if (Object.keys(fieldErrors).length > 0)
    return { ok: false, error: "Revisa los campos marcados.", fieldErrors };

  // Debe quedar al menos un cambio significativo (evita solicitudes vacías).
  if (Object.keys(normalized).length === 0)
    return { ok: false, error: "No hay datos para enviar." };

  const yaPendiente = await prisma.solicitudActualizacionDatos.findFirst({
    where: { socioId: r.socio.id, estado: "pendiente" },
    select: { id: true },
  });
  if (yaPendiente)
    return {
      ok: false,
      error: "Ya tienes una solicitud pendiente de revisión.",
    };

  try {
    const s = await prisma.solicitudActualizacionDatos.create({
      data: {
        socioId: r.socio.id,
        datos: normalized as Prisma.InputJsonValue,
        estado: "pendiente",
      },
      select: { id: true },
    });
    revalidatePath("/portal/perfil");
    revalidatePath("/portal/perfil/actualizar");
    return { ok: true, data: { id: s.id } };
  } catch (e) {
    // El índice parcial único puede chocar si hubo carrera de doble-submit.
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    )
      return { ok: false, error: "Ya tienes una solicitud pendiente de revisión." };
    console.error("crearSolicitudActualizacion", e);
    return { ok: false, error: "No se pudo enviar la solicitud." };
  }
}
```

- [ ] **Step 4: `cancelarMiSolicitud`**

```ts
export async function cancelarMiSolicitud(): Promise<ActionResult> {
  const r = await getSocioActual();
  if (!r) return { ok: false, error: "Debes iniciar sesión como socio." };
  // Solo borra la pendiente del PROPIO socio (deleteMany acotado por socioId).
  await prisma.solicitudActualizacionDatos.deleteMany({
    where: { socioId: r.socio.id, estado: "pendiente" },
  });
  revalidatePath("/portal/perfil");
  revalidatePath("/portal/perfil/actualizar");
  return { ok: true };
}
```

- [ ] **Step 5: Gate de tipos + lint**

Run: `npx tsc --noEmit`
Expected: PASS.
Run: `npm run lint`
Expected: sin errores.

---

## Task 5: UI del portal (formulario + entrada en perfil)

**Files:**
- Create: `src/app/(socio)/portal/perfil/ActualizarDatosForm.tsx`
- Create: `src/app/(socio)/portal/perfil/actualizar/page.tsx`
- Modify: `src/app/(socio)/portal/perfil/page.tsx`

**Interfaces:**
- Consumes: `getMisDatosCompletos`, `getMiSolicitudActiva` (Task 3), `lookupDniPortal`, `crearSolicitudActualizacion`, `cancelarMiSolicitud` (Task 4), `requireSocio`, `useToast`.

- [ ] **Step 1: `ActualizarDatosForm.tsx` (client)**

```tsx
"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/admin/toast";
import {
  lookupDniPortal,
  crearSolicitudActualizacion,
  cancelarMiSolicitud,
  type PerfilSelfInput,
} from "@/app/(socio)/portal/actions";
import type { MisDatosActuales } from "@/lib/portal/data";

type Props = { datos: MisDatosActuales; tienePendiente: boolean };

type Form = {
  tipoDocumento: string;
  numeroDocumento: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
  nombres: string;
  fechaNacimiento: string;
  sexo: string;
  estadoCivil: string;
  telefono: string;
  email: string;
  direccion: string;
  distrito: string;
  provincia: string;
  departamento: string;
};

function toForm(d: MisDatosActuales): Form {
  return {
    tipoDocumento: d.tipoDocumento,
    numeroDocumento: d.documentoPendiente ? "" : d.numeroDocumento,
    apellidoPaterno: d.apellidoPaterno,
    apellidoMaterno: d.apellidoMaterno ?? "",
    nombres: d.nombres,
    fechaNacimiento: d.fechaNacimiento ?? "",
    sexo: d.sexo ?? "",
    estadoCivil: d.estadoCivil ?? "",
    telefono: d.telefono ?? "",
    email: d.email ?? "",
    direccion: d.direccion ?? "",
    distrito: d.distrito ?? "",
    provincia: d.provincia ?? "",
    departamento: d.departamento ?? "",
  };
}

export function ActualizarDatosForm({ datos, tienePendiente }: Props) {
  const toast = useToast();
  const router = useRouter();
  const [form, setForm] = useState<Form>(() => toForm(datos));
  const [fe, setFe] = useState<Record<string, string>>({});
  const [dniState, setDniState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [saving, startSaving] = useTransition();
  const [, startLookup] = useTransition();

  // Snapshot de lo autollenado: solo se sobrescribe un campo si el socio no lo
  // editó (sigue igual al último autollenado) o está vacío. Preserva ediciones.
  const autoRef = useRef<Partial<Form>>({});
  const lookedUpRef = useRef<string>("");
  const reqIdRef = useRef(0);

  function set<K extends keyof Form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  // Lookup con debounce 450ms cuando hay DNI de 8 dígitos distinto al anterior.
  useEffect(() => {
    if (form.tipoDocumento !== "DNI") return;
    const dni = form.numeroDocumento.trim();
    if (!/^\d{8}$/.test(dni)) {
      setDniState("idle");
      return;
    }
    if (dni === lookedUpRef.current) return;
    const id = ++reqIdRef.current;
    setDniState("loading");
    const t = setTimeout(() => {
      startLookup(async () => {
        const res = await lookupDniPortal(dni);
        if (id !== reqIdRef.current) return; // respuesta obsoleta
        if (!res.ok) {
          setDniState("error");
          return;
        }
        lookedUpRef.current = dni;
        setDniState("ok");
        const d = res.data!;
        const next: Partial<Form> = {
          apellidoPaterno: d.apellidoPaterno,
          apellidoMaterno: d.apellidoMaterno,
          nombres: d.nombres,
          fechaNacimiento: d.fechaNacimiento ?? "",
          sexo: d.sexo ?? "",
          estadoCivil: d.estadoCivil ?? "",
          direccion: d.direccion ?? "",
        };
        setForm((f) => {
          const merged = { ...f };
          (Object.keys(next) as (keyof Form)[]).forEach((k) => {
            const prevAuto = autoRef.current[k];
            const cur = f[k];
            if (cur === "" || cur === prevAuto) {
              merged[k] = next[k] as string;
            }
          });
          return merged;
        });
        autoRef.current = { ...autoRef.current, ...next };
      });
    }, 450);
    return () => clearTimeout(t);
  }, [form.tipoDocumento, form.numeroDocumento]);

  function buildInput(): PerfilSelfInput {
    return {
      tipoDocumento: form.tipoDocumento as PerfilSelfInput["tipoDocumento"],
      numeroDocumento: form.numeroDocumento,
      apellidoPaterno: form.apellidoPaterno,
      apellidoMaterno: form.apellidoMaterno || undefined,
      nombres: form.nombres,
      fechaNacimiento: form.fechaNacimiento || undefined,
      sexo: (form.sexo || undefined) as PerfilSelfInput["sexo"],
      estadoCivil: form.estadoCivil || undefined,
      telefono: form.telefono || undefined,
      email: form.email || undefined,
      direccion: form.direccion || undefined,
      distrito: form.distrito || undefined,
      provincia: form.provincia || undefined,
      departamento: form.departamento || undefined,
    };
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (saving || tienePendiente) return;
    setFe({});
    startSaving(async () => {
      const res = await crearSolicitudActualizacion(buildInput());
      if (!res.ok) {
        toast.error(res.error);
        if (res.fieldErrors) setFe(res.fieldErrors as Record<string, string>);
        return;
      }
      toast.success("Solicitud enviada. Quedó en revisión.");
      router.refresh();
    });
  }

  function cancelar() {
    startSaving(async () => {
      const res = await cancelarMiSolicitud();
      if (!res.ok) return toast.error(res.error);
      toast.success("Solicitud cancelada.");
      router.refresh();
    });
  }

  if (tienePendiente) {
    return (
      <div className="pt-panel">
        <p>Tu solicitud está en revisión. No puedes enviar otra hasta que se resuelva.</p>
        <button className="pt-btn" onClick={cancelar} disabled={saving}>
          {saving ? "Cancelando…" : "Cancelar solicitud"}
        </button>
      </div>
    );
  }

  const txt = (k: keyof Form, label: string, extra?: { type?: string; inputMode?: "numeric" | "text" | "email"; maxLength?: number }) => (
    <div className="pt-field">
      <label htmlFor={`f-${k}`}>{label}</label>
      <input
        id={`f-${k}`}
        type={extra?.type ?? "text"}
        inputMode={extra?.inputMode}
        maxLength={extra?.maxLength}
        value={form[k]}
        onChange={(e) => set(k, e.target.value)}
        aria-invalid={!!fe[k]}
        disabled={saving}
      />
      {fe[k] && <span className="pt-field__err">{fe[k]}</span>}
    </div>
  );

  return (
    <form onSubmit={submit}>
      <div className="pt-field">
        <label htmlFor="f-tipo">Tipo de documento</label>
        <select
          id="f-tipo"
          value={form.tipoDocumento}
          onChange={(e) => set("tipoDocumento", e.target.value)}
          disabled={saving}
        >
          <option value="DNI">DNI</option>
          <option value="CE">CE</option>
          <option value="PASAPORTE">Pasaporte</option>
          <option value="RUC">RUC</option>
        </select>
      </div>

      <div className="pt-field">
        <label htmlFor="f-doc">Número de documento</label>
        <input
          id="f-doc"
          inputMode={form.tipoDocumento === "DNI" ? "numeric" : "text"}
          maxLength={form.tipoDocumento === "DNI" ? 8 : 20}
          value={form.numeroDocumento}
          onChange={(e) => set("numeroDocumento", e.target.value)}
          aria-invalid={!!fe.numeroDocumento}
          disabled={saving}
          placeholder={form.tipoDocumento === "DNI" ? "8 dígitos" : ""}
        />
        {form.tipoDocumento === "DNI" && dniState === "loading" && (
          <span className="pt-field__err" style={{ color: "var(--muted, #888)" }}>
            Consultando RENIEC…
          </span>
        )}
        {form.tipoDocumento === "DNI" && dniState === "ok" && (
          <span className="pt-field__err" style={{ color: "green" }}>
            Datos encontrados. Revísalos y corrige lo que falte.
          </span>
        )}
        {form.tipoDocumento === "DNI" && dniState === "error" && (
          <span className="pt-field__err">
            No se pudo autollenar. Puedes escribir tus datos a mano.
          </span>
        )}
        {fe.numeroDocumento && <span className="pt-field__err">{fe.numeroDocumento}</span>}
      </div>

      {txt("apellidoPaterno", "Apellido paterno")}
      {txt("apellidoMaterno", "Apellido materno")}
      {txt("nombres", "Nombres")}
      {txt("fechaNacimiento", "Fecha de nacimiento", { type: "date" })}

      <div className="pt-field">
        <label htmlFor="f-sexo">Sexo</label>
        <select id="f-sexo" value={form.sexo} onChange={(e) => set("sexo", e.target.value)} disabled={saving}>
          <option value="">—</option>
          <option value="M">Masculino</option>
          <option value="F">Femenino</option>
        </select>
      </div>

      {txt("estadoCivil", "Estado civil")}
      {txt("telefono", "Teléfono", { inputMode: "numeric", maxLength: 20 })}
      {txt("email", "Correo", { type: "email", inputMode: "email" })}
      {txt("direccion", "Dirección")}
      {txt("distrito", "Distrito")}
      {txt("provincia", "Provincia")}
      {txt("departamento", "Departamento")}

      <button type="submit" className="pt-btn" disabled={saving}>
        {saving ? "Enviando…" : "Enviar para revisión"}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: `actualizar/page.tsx` (server)**

```tsx
import Link from "next/link";
import { requireSocio } from "@/lib/portal/socio";
import { getMisDatosCompletos, getMiSolicitudActiva } from "@/lib/portal/data";
import { Icon } from "@/components/admin/Icon";
import { ActualizarDatosForm } from "../ActualizarDatosForm";

export const metadata = { title: "Actualizar mis datos · Gran Feria Mayorista Internacional" };
export const dynamic = "force-dynamic";

export default async function ActualizarDatosPage() {
  const { socio } = await requireSocio();
  const [datos, solicitud] = await Promise.all([
    getMisDatosCompletos(socio.id),
    getMiSolicitudActiva(socio.id),
  ]);

  return (
    <>
      <Link href="/portal/perfil" className="pt-back">
        <Icon name="chevron-right" size={15} style={{ transform: "rotate(180deg)" }} />
        Volver
      </Link>

      <div className="pt-hello">
        <h1>Actualizar mis datos</h1>
        <p>
          Ingresa tu DNI para autollenar tus datos, corrige lo que falte y envía.
          Un administrador revisará y aprobará los cambios.
        </p>
      </div>

      {solicitud.estado === "rechazada" && (
        <section className="pt-panel">
          <p>
            Tu última solicitud fue rechazada
            {solicitud.motivoRechazo ? `: ${solicitud.motivoRechazo}` : "."} Puedes
            corregir y volver a enviar.
          </p>
        </section>
      )}

      <section className="pt-panel">
        <ActualizarDatosForm
          datos={datos}
          tienePendiente={solicitud.estado === "pendiente"}
        />
      </section>
    </>
  );
}
```

- [ ] **Step 3: Entrada en `perfil/page.tsx`**

En `src/app/(socio)/portal/perfil/page.tsx`, añadir `getMiSolicitudActiva` al import de `@/lib/portal/data`, cargar el estado, y añadir una nueva sección antes de "Seguridad":

```tsx
// arriba, junto a getMisPuestos:
import { getMisPuestos } from "@/lib/portal/data";
import { getMiSolicitudActiva } from "@/lib/portal/data";
// ...
  const puestos = await getMisPuestos(socio.id);
  const solicitud = await getMiSolicitudActiva(socio.id);
```

Sección nueva (antes de `<section className="pt-panel"><h2>Seguridad</h2>`):

```tsx
      <section className="pt-panel">
        <h2>Actualizar mis datos</h2>
        {solicitud.estado === "pendiente" ? (
          <p className="pt-empty">Tienes una solicitud en revisión.</p>
        ) : (
          <p className="pt-empty">
            ¿Cambiaron tus datos o te falta tu DNI? Actualízalos para revisión.
          </p>
        )}
        <Link href="/portal/perfil/actualizar" className="pt-btn">
          {solicitud.estado === "pendiente" ? "Ver mi solicitud" : "Actualizar mis datos"}
        </Link>
      </section>
```

- [ ] **Step 4: Gate de tipos + lint**

Run: `npx tsc --noEmit`
Expected: PASS.
Run: `npm run lint`
Expected: sin errores.

---

## Task 6: Acciones admin (listar, aprobar, rechazar)

**Files:**
- Create: `src/app/(admin)/socios/solicitudes/actions.ts`

**Interfaces:**
- Consumes: `authorize` pattern (replicar el de socios/actions.ts: `getCurrentUser` + `permissions.has("socios.write")`), `validateSocioInput`, `buildSocioUpdateData` (Task 2), `prisma`, `revalidatePath`.
- Produces:
  - `type SolicitudPendiente` (id, socio mínimo, datos propuestos, actuales para diff, creadoEn)
  - `listSolicitudesPendientes(): Promise<ActionResult<SolicitudPendiente[]>>`
  - `aprobarSolicitud(id: string): Promise<ActionResult>`
  - `rechazarSolicitud(id: string, motivo: string): Promise<ActionResult>`
  - `contarSolicitudesPendientes(): Promise<number>`

- [ ] **Step 1: Crear `solicitudes/actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/server";
import {
  validateSocioInput,
  buildSocioUpdateData,
} from "@/lib/socios/update";
import type { ActionResult, CreateSocioInput } from "@/app/(admin)/socios/types";

async function requireReview() {
  const user = await getCurrentUser();
  if (!user || !user.permissions.has("socios.write")) return null;
  return user;
}

export type SolicitudPendiente = {
  id: string;
  creadoEn: string;
  socio: {
    id: string;
    codigo: string;
    nombre: string;
    tipoDocumento: string;
    numeroDocumento: string;
  };
  // valores propuestos (whitelist) y los actuales, para pintar el diff en la UI.
  propuesto: Record<string, unknown>;
  actual: Record<string, unknown>;
};

const DIFF_FIELDS = [
  "tipoDocumento",
  "numeroDocumento",
  "apellidoPaterno",
  "apellidoMaterno",
  "nombres",
  "fechaNacimiento",
  "sexo",
  "estadoCivil",
  "telefono",
  "email",
  "direccion",
  "distrito",
  "provincia",
  "departamento",
] as const;

export async function listSolicitudesPendientes(): Promise<
  ActionResult<SolicitudPendiente[]>
> {
  const me = await requireReview();
  if (!me) return { ok: false, error: "No tienes permisos para esta acción." };

  const rows = await prisma.solicitudActualizacionDatos.findMany({
    where: { estado: "pendiente" },
    orderBy: { creadoEn: "asc" },
    select: {
      id: true,
      creadoEn: true,
      datos: true,
      socio: {
        select: {
          id: true,
          codigo: true,
          apellidoPaterno: true,
          apellidoMaterno: true,
          nombres: true,
          tipoDocumento: true,
          numeroDocumento: true,
          fechaNacimiento: true,
          sexo: true,
          estadoCivil: true,
          telefono: true,
          email: true,
          direccion: true,
          distrito: true,
          provincia: true,
          departamento: true,
        },
      },
    },
  });

  const items: SolicitudPendiente[] = rows.map((r) => {
    const datos = (r.datos ?? {}) as Record<string, unknown>;
    const s = r.socio;
    const actual: Record<string, unknown> = {};
    const propuesto: Record<string, unknown> = {};
    for (const k of DIFF_FIELDS) {
      const cur =
        k === "fechaNacimiento"
          ? s.fechaNacimiento
            ? s.fechaNacimiento.toISOString().slice(0, 10)
            : null
          : (s as Record<string, unknown>)[k] ?? null;
      // solo incluir en el diff los campos que la solicitud trae
      if (k in datos) {
        const prop =
          k === "fechaNacimiento" && typeof datos[k] === "string"
            ? (datos[k] as string).slice(0, 10)
            : datos[k] ?? null;
        if (String(prop ?? "") !== String(cur ?? "")) {
          actual[k] = cur;
          propuesto[k] = prop;
        }
      }
    }
    return {
      id: r.id,
      creadoEn: r.creadoEn.toISOString(),
      socio: {
        id: s.id,
        codigo: s.codigo,
        nombre: `${s.apellidoPaterno} ${s.apellidoMaterno ?? ""}, ${s.nombres}`.replace(/\s+,/, ","),
        tipoDocumento: s.tipoDocumento,
        numeroDocumento: s.numeroDocumento,
      },
      propuesto,
      actual,
    };
  });

  return { ok: true, data: items };
}

export async function contarSolicitudesPendientes(): Promise<number> {
  const me = await requireReview();
  if (!me) return 0;
  return prisma.solicitudActualizacionDatos.count({ where: { estado: "pendiente" } });
}

export async function aprobarSolicitud(id: string): Promise<ActionResult> {
  const me = await requireReview();
  if (!me) return { ok: false, error: "No tienes permisos para esta acción." };

  try {
    const sol = await prisma.solicitudActualizacionDatos.findUnique({
      where: { id },
      select: { id: true, socioId: true, estado: true, datos: true },
    });
    if (!sol) return { ok: false, error: "Solicitud no encontrada." };
    if (sol.estado !== "pendiente")
      return { ok: false, error: "La solicitud ya fue resuelta." };

    const existing = await prisma.socio.findUnique({
      where: { id: sol.socioId },
      select: {
        tipoDocumento: true,
        codigo: true,
        numeroPadron: true,
        numeroDocumento: true,
        apellidoPaterno: true,
        apellidoMaterno: true,
        nombres: true,
        userId: true,
      },
    });
    if (!existing) return { ok: false, error: "Socio no encontrado." };

    const datos = (sol.datos ?? {}) as Partial<CreateSocioInput>;
    const merged: Partial<CreateSocioInput> = {
      tipoDocumento: datos.tipoDocumento ?? existing.tipoDocumento,
      ...datos,
    };
    const { fieldErrors, normalized } = validateSocioInput(merged, false);
    if (Object.keys(fieldErrors).length > 0)
      return { ok: false, error: "Los datos de la solicitud no son válidos.", fieldErrors };

    const { data, docCambia } = buildSocioUpdateData(normalized, existing);
    data.updatedBy = { connect: { id: me.id } };

    try {
      await prisma.$transaction(async (tx) => {
        // Guard contra doble-aprobación: solo si sigue pendiente.
        const upd = await tx.solicitudActualizacionDatos.updateMany({
          where: { id: sol.id, estado: "pendiente" },
          data: { estado: "aprobada", revisadoPorId: me.id, revisadoEn: new Date() },
        });
        if (upd.count === 0) throw new Prisma.PrismaClientKnownRequestError(
          "ya resuelta", { code: "P2025", clientVersion: "x" },
        );
        await tx.socio.update({ where: { id: sol.socioId }, data });
        if (existing.userId && docCambia) {
          await tx.user.update({
            where: { id: existing.userId },
            data: {
              tipoDocumento: normalized.tipoDocumento ?? existing.tipoDocumento,
              numeroDocumento: normalized.numeroDocumento ?? existing.numeroDocumento,
            },
          });
        }
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
        return { ok: false, error: "Ya existe un socio con ese documento; no se aplicó." };
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025")
        return { ok: false, error: "La solicitud ya fue resuelta." };
      throw e;
    }

    revalidatePath("/socios");
    revalidatePath("/socios/solicitudes");
    return { ok: true };
  } catch (e) {
    console.error("aprobarSolicitud", e);
    return { ok: false, error: "No se pudo aprobar la solicitud." };
  }
}

export async function rechazarSolicitud(
  id: string,
  motivo: string,
): Promise<ActionResult> {
  const me = await requireReview();
  if (!me) return { ok: false, error: "No tienes permisos para esta acción." };
  const m = (motivo ?? "").trim();
  if (m.length < 5)
    return { ok: false, error: "Indica un motivo (mínimo 5 caracteres)." };

  const upd = await prisma.solicitudActualizacionDatos.updateMany({
    where: { id, estado: "pendiente" },
    data: { estado: "rechazada", motivoRechazo: m, revisadoPorId: me.id, revisadoEn: new Date() },
  });
  if (upd.count === 0)
    return { ok: false, error: "La solicitud no existe o ya fue resuelta." };

  revalidatePath("/socios/solicitudes");
  return { ok: true };
}
```

- [ ] **Step 2: Gate de tipos + lint**

Run: `npx tsc --noEmit`
Expected: PASS. (Si el constructor de `PrismaClientKnownRequestError` marca tipos por `clientVersion`, usar el `Prisma.prismaVersion.client` o un throw de `Error` propio capturado como P2025 — ajustar para que compile.)
Run: `npm run lint`
Expected: sin errores.

---

## Task 7: UI admin (bandeja de solicitudes + entrada en /socios)

**Files:**
- Create: `src/app/(admin)/socios/solicitudes/page.tsx`
- Create: `src/app/(admin)/socios/solicitudes/SolicitudesList.tsx`
- Modify: `src/app/(admin)/socios/page.tsx` + `src/app/(admin)/socios/SociosClient.tsx`

**Interfaces:**
- Consumes: `listSolicitudesPendientes`, `aprobarSolicitud`, `rechazarSolicitud`, `contarSolicitudesPendientes` (Task 6), `requirePermission`, `useToast`.

- [ ] **Step 1: `solicitudes/page.tsx` (server)**

```tsx
import Link from "next/link";
import { requirePermission } from "@/lib/auth/server";
import { listSolicitudesPendientes } from "./actions";
import { SolicitudesList } from "./SolicitudesList";

export const metadata = { title: "Solicitudes de actualización · Admin" };
export const dynamic = "force-dynamic";

export default async function Page() {
  await requirePermission("socios.write");
  const res = await listSolicitudesPendientes();
  const items = res.ok ? res.data! : [];

  return (
    <div className="page">
      <div className="page__head">
        <h1>Solicitudes de actualización de datos</h1>
        <Link href="/socios" className="btn btn--ghost">Volver al padrón</Link>
      </div>
      {items.length === 0 ? (
        <p className="empty">No hay solicitudes pendientes.</p>
      ) : (
        <SolicitudesList items={items} />
      )}
    </div>
  );
}
```

(Nota: usar las clases reales del proyecto. Si `page`/`page__head`/`btn--ghost`/`empty` no existen en el área admin, replicar las clases que usan otras páginas admin —p. ej. el header de `puestos`/`transferencias`— al implementar. Verificar abriendo una página admin existente.)

- [ ] **Step 2: `SolicitudesList.tsx` (client)**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/admin/toast";
import { aprobarSolicitud, rechazarSolicitud, type SolicitudPendiente } from "./actions";

const LABEL: Record<string, string> = {
  tipoDocumento: "Tipo doc.",
  numeroDocumento: "N° documento",
  apellidoPaterno: "Ap. paterno",
  apellidoMaterno: "Ap. materno",
  nombres: "Nombres",
  fechaNacimiento: "Fecha nac.",
  sexo: "Sexo",
  estadoCivil: "Estado civil",
  telefono: "Teléfono",
  email: "Correo",
  direccion: "Dirección",
  distrito: "Distrito",
  provincia: "Provincia",
  departamento: "Departamento",
};

export function SolicitudesList({ items }: { items: SolicitudPendiente[] }) {
  const toast = useToast();
  const router = useRouter();
  const [busy, start] = useTransition();
  const [rechazandoId, setRechazandoId] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");

  function aprobar(id: string) {
    start(async () => {
      const res = await aprobarSolicitud(id);
      if (!res.ok) return toast.error(res.error);
      toast.success("Solicitud aprobada y aplicada al padrón.");
      router.refresh();
    });
  }

  function confirmarRechazo(id: string) {
    start(async () => {
      const res = await rechazarSolicitud(id, motivo);
      if (!res.ok) return toast.error(res.error);
      toast.success("Solicitud rechazada.");
      setRechazandoId(null);
      setMotivo("");
      router.refresh();
    });
  }

  return (
    <div className="sol-list">
      {items.map((it) => {
        const campos = Object.keys(it.propuesto);
        return (
          <div key={it.id} className="card sol-card">
            <div className="sol-card__head">
              <strong>{it.socio.nombre}</strong>
              <span className="muted">
                {it.socio.codigo} · {it.socio.tipoDocumento} {it.socio.numeroDocumento}
              </span>
            </div>

            {campos.length === 0 ? (
              <p className="muted">Sin cambios respecto a los datos actuales.</p>
            ) : (
              <table className="sol-diff">
                <thead>
                  <tr><th>Campo</th><th>Actual</th><th>Propuesto</th></tr>
                </thead>
                <tbody>
                  {campos.map((k) => (
                    <tr key={k}>
                      <td>{LABEL[k] ?? k}</td>
                      <td className="muted">{String(it.actual[k] ?? "—")}</td>
                      <td><strong>{String(it.propuesto[k] ?? "—")}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {rechazandoId === it.id ? (
              <div className="sol-card__reject">
                <input
                  type="text"
                  placeholder="Motivo del rechazo"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  disabled={busy}
                />
                <button className="btn" onClick={() => confirmarRechazo(it.id)} disabled={busy}>
                  Confirmar rechazo
                </button>
                <button className="btn btn--ghost" onClick={() => setRechazandoId(null)} disabled={busy}>
                  Cancelar
                </button>
              </div>
            ) : (
              <div className="sol-card__actions">
                <button className="btn btn--primary" onClick={() => aprobar(it.id)} disabled={busy}>
                  Aprobar
                </button>
                <button className="btn btn--ghost" onClick={() => { setRechazandoId(it.id); setMotivo(""); }} disabled={busy}>
                  Rechazar
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

(Las clases `card/btn/muted/sol-*` deben alinearse con el CSS del área admin; añadir reglas mínimas en `socios.css` si hace falta —seguir el estilo existente.)

- [ ] **Step 3: Entrada con contador en `/socios`**

En `src/app/(admin)/socios/page.tsx`: importar y contar pendientes, pasar a `SociosClient`:

```ts
import { contarSolicitudesPendientes } from "./solicitudes/actions";
// dentro de Page, junto a los otros await:
  const solicitudesPendientes = await contarSolicitudesPendientes();
// y en el JSX:
  return (
    <SociosClient
      initial={res.data!}
      stats={stats}
      perms={perms}
      filters={{ q: sp.q ?? "", estado, tipoDocumento }}
      solicitudesPendientes={solicitudesPendientes}
    />
  );
```

En `src/app/(admin)/socios/SociosClient.tsx`: añadir `solicitudesPendientes?: number` a las props y, en la barra de cabecera (junto al botón "Nuevo socio"), renderizar el chip:

```tsx
{!!solicitudesPendientes && (
  <Link href="/socios/solicitudes" className="btn btn--ghost">
    Solicitudes pendientes
    <span className="badge">{solicitudesPendientes}</span>
  </Link>
)}
```

(Importar `Link` de `next/link` si no está. Si `solicitudesPendientes` es 0, igual conviene un enlace discreto a `/socios/solicitudes`; opcional.)

- [ ] **Step 4: Gate de tipos + lint**

Run: `npx tsc --noEmit`
Expected: PASS.
Run: `npm run lint`
Expected: sin errores.

---

## Task 8: Script de verificación + verificación manual

**Files:**
- Create: `prisma/verify-solicitudes.ts`

- [ ] **Step 1: Script `prisma/verify-solicitudes.ts`**

Seguir el patrón de los otros `prisma/verify-*.ts` (instanciar PrismaClient, correr aserciones, log). Mínimo:

```ts
import { PrismaClient } from "../src/generated/prisma/client";
const prisma = new PrismaClient();

async function main() {
  const total = await prisma.solicitudActualizacionDatos.count();
  const pend = await prisma.solicitudActualizacionDatos.count({ where: { estado: "pendiente" } });
  console.log(`Solicitudes: ${total} total, ${pend} pendientes`);

  // Invariante: a lo sumo 1 pendiente por socio (índice parcial).
  const grupos = await prisma.solicitudActualizacionDatos.groupBy({
    by: ["socioId"],
    where: { estado: "pendiente" },
    _count: { _all: true },
  });
  const violaciones = grupos.filter((g) => g._count._all > 1);
  if (violaciones.length) {
    console.error("✗ Socios con >1 pendiente:", violaciones);
    process.exitCode = 1;
  } else {
    console.log("✓ Máximo 1 pendiente por socio");
  }
}

main().finally(() => prisma.$disconnect());
```

Run: `npx tsx prisma/verify-solicitudes.ts` (o el runner que usen los demás verify; revisar cómo se ejecutan).
Expected: imprime conteos y la invariante en ✓.

- [ ] **Step 2: Gates finales del proyecto**

Run: `npx tsc --noEmit`
Expected: PASS.
Run: `npm run lint`
Expected: sin errores.
Run: `npm run build`
Expected: build OK (valida server actions y rutas en Next 16).

- [ ] **Step 3: Verificación manual (checklist)**

1. Como socio (portalEnabled) ir a `/portal/perfil` → "Actualizar mis datos" → `/portal/perfil/actualizar`.
2. Ingresar un DNI válido de 8 dígitos → se autollenan apellidos/nombres; editar teléfono y correo.
3. Enviar → toast "en revisión"; volver a `/portal/perfil/actualizar` muestra "en revisión" + "Cancelar".
4. Reenvío bloqueado (no permite 2 pendientes).
5. Como admin (socios.write) ir a `/socios` → chip "Solicitudes pendientes (N)" → `/socios/solicitudes`.
6. Ver diff actual→propuesto → Aprobar → el padrón refleja los cambios (revisar `/socios/[id]`); el socio sigue pudiendo iniciar sesión (documento propagado).
7. Crear otra solicitud y Rechazar con motivo → el socio ve el motivo en `/portal/perfil/actualizar` y puede reenviar.
8. Caso colisión: dos socios proponen el mismo DNI; aprobar el segundo falla con mensaje claro y NO altera nada.

---

## Self-Review (cobertura del spec)

- §4 modelo+migración+índice parcial → Task 1. ✅
- §5 permisos (reusa `socios.write`, sin tocar catálogo) → Tasks 4/6 (`getSocioActual` / `requireReview`). ✅
- §6 whitelist → `SELF_FIELDS` (Task 4), `DIFF_FIELDS` (Task 6), `SocioUpdateBase` (Task 2). ✅
- §7 archivos → Tasks 2-7 cubren cada uno. ✅
- §8 contratos de acciones → Tasks 4 y 6 (firmas idénticas). ✅
- §9 flujo → Tasks 5 (socio) + 7 (admin). ✅
- §10 UX/estilos/Next16 → Task 5/7 (useTransition, no useActionState; pt-* / admin classes; useToast). ✅
- §11 reuso/validación → Task 2. ✅
- §12 casos borde (1 pendiente, doble-aprobación, P2002, inyección socioId, email no cambia login) → Tasks 1/4/6. ✅
- §13 verificación → Task 8. ✅

**Riesgos conocidos a vigilar durante ejecución:**
- El constructor de `Prisma.PrismaClientKnownRequestError` para forzar P2025 puede no tipar bien; si molesta, lanzar un `Error` propio y mapearlo. (Task 6 Step 2.)
- Clases CSS admin (`btn`, `card`, `page__head`) deben confirmarse contra una página admin real antes de dar por buena la Task 7; añadir reglas a `socios.css` si faltan.
- Confirmar el runner de los `verify-*.ts` (¿`tsx`?) antes de Task 8.
