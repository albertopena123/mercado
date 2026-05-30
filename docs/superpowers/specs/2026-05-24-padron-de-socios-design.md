# Padrón de socios — Spec de diseño

**Fecha:** 2026-05-24
**Estado:** aprobado para implementación
**Sub-proyecto:** #1 de la suite "Gestión de asociación de mercado"

## Contexto

El proyecto (rama `main`, package `conadis`) originalmente era un admin para reporte de incidentes de accesibilidad (CONADIS). Se reusa la base RBAC (User/Role/Permission/Session) y el shell de admin (`src/app/(admin)/`, sidebar, login) para construir un sistema de gestión de una asociación de comerciantes de mercado.

El módulo `Incident*` del schema original se elimina (no se usa en el dominio mercado). El módulo "Padrón de socios" es el primer sub-proyecto de una suite que incluirá: Puestos, Cuotas, Asambleas/asistencia, Sanciones, Beneficiarios. Cada uno tendrá su propio spec.

## Objetivos del módulo

1. Registrar a cada socio (comerciante) de la asociación con sus datos personales, identificación oficial y estado dentro de la asociación.
2. Mantener historial de cambios de estado (activo → suspendido → retirado → fallecido) con motivo y responsable.
3. Guardar foto del socio y documentos adjuntos (DNI escaneado, ficha de inscripción, etc.).
4. Dejar la base lista para un futuro "Portal del Socio" (login del socio por DNI + email) sin migración fuerte: campo `userId?` opcional + `portalEnabled`.

No-objetivos (van en sub-proyectos futuros):
- Puestos, cuotas, asambleas, sanciones, beneficiarios.
- Flujo de auth del socio (login DNI+email, recuperación, portal de auto-servicio).
- Reportes/exportación a Excel/PDF.

## Decisiones tomadas

| Decisión | Elegido | Por qué |
|---|---|---|
| Identidad del socio | `Socio` independiente con `userId?` único opcional | No todos los socios tendrán cuenta; permite enlazar a `User` cuando se habilite portal sin migración mayor |
| Tipos de documento | DNI / CE / Pasaporte / RUC (enum) + número | Cubre extranjeros y socios que facturen con RUC |
| Estados | activo / suspendido / retirado / fallecido | Estados típicos en asociaciones peruanas |
| Foto / adjuntos | Foto en `Socio.fotoUrl` + tabla 1:N `SocioAdjunto` con `tipo` libre | Patrón similar a `IncidentAttachment` que el equipo ya conocía |
| Auditoría | `createdBy`/`updatedBy` + tabla `SocioEstadoLog` para cambios de estado | Auditoría completa de todos los campos sería sobre-ingeniería para esta fase |
| Storage de archivos | Filesystem local en `private-uploads/socios/{socioId}/` (fuera de `public/`), servido por API route con auth | Sin dependencias externas; intercambiable después (S3/Supabase) por interfaz en `src/lib/socios/storage.ts`. No se pone bajo `public/` porque Next.js sirve esa carpeta como estática sin auth |
| Schema Incident original | Eliminar (migración destructiva) | No aplica al dominio mercado |

## Modelo de datos (Prisma)

```prisma
enum TipoDocumento { DNI  CE  PASAPORTE  RUC }
enum EstadoSocio   { activo  suspendido  retirado  fallecido }
enum Sexo          { M  F }

model Socio {
  id              String         @id @default(cuid())
  codigo          String         @unique          // "SOC-000001", correlativo
  tipoDocumento   TipoDocumento
  numeroDocumento String
  apellidoPaterno String
  apellidoMaterno String?
  nombres         String
  fechaNacimiento DateTime?
  sexo            Sexo?
  estadoCivil     String?

  telefono        String?
  email           String?
  direccion       String?
  distrito        String?
  provincia       String?
  departamento    String?

  fechaIngreso    DateTime
  estado          EstadoSocio    @default(activo)
  observaciones   String?

  fotoUrl         String?

  userId          String?        @unique
  portalEnabled   Boolean        @default(false)

  createdById     String?
  updatedById     String?
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt

  user      User?  @relation("SocioUser", fields: [userId],      references: [id], onDelete: SetNull)
  createdBy User?  @relation("SocioCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)
  updatedBy User?  @relation("SocioUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull)
  adjuntos  SocioAdjunto[]
  estadoLog SocioEstadoLog[]

  @@unique([tipoDocumento, numeroDocumento])
  @@index([estado])
  @@index([apellidoPaterno, apellidoMaterno, nombres])
}

model SocioAdjunto {
  id           String   @id @default(cuid())
  socioId      String
  tipo         String                          // "dni_scan" | "ficha_inscripcion" | "carnet" | "otro" | "foto"
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

Cambios necesarios en `User`: agregar relaciones inversas
`socioAccount Socio? @relation("SocioUser")`,
`sociosCreated Socio[] @relation("SocioCreatedBy")`,
`sociosUpdated Socio[] @relation("SocioUpdatedBy")`,
`socioAdjuntos SocioAdjunto[] @relation("SocioAdjuntoUploader")`,
`socioEstadoLogs SocioEstadoLog[] @relation("SocioEstadoLogBy")`.

Y eliminar del schema: `Incident`, `IncidentCategory`, `IncidentAttachment`, `IncidentComment`, `IncidentStatusLog` con sus enums y las relaciones inversas en `User`.

## Estructura de archivos

```
src/app/(admin)/socios/
├── page.tsx                  Server: query inicial + auth + permisos
├── SociosClient.tsx          Vista principal: tabla, búsqueda, filtros, paginación
├── CreateSocioModal.tsx      Modal de alta con formulario completo
├── SocioDetailDrawer.tsx     Drawer con 3 tabs: Datos / Adjuntos / Historial
├── ChangeEstadoModal.tsx     Modal para cambio de estado + motivo
├── DocumentoInput.tsx        Input compuesto tipo + número, valida por tipo
├── AdjuntosPanel.tsx         Sub-componente del drawer (foto + lista + upload)
├── EstadoBadge.tsx           Chip de color por estado del socio
├── Toasts.tsx                Reusable (mismo patrón que usuarios/)
├── actions.ts                Server actions con "use server"
├── types.ts                  DTOs e interfaces locales
└── socios.css                Estilos locales

src/lib/socios/
├── document.ts               Validación DNI/CE/Pasaporte/RUC
├── codigo.ts                 Generación correlativa
└── storage.ts                Interfaz para guardar/eliminar adjuntos (filesystem por ahora)

src/app/api/uploads/socios/[socioId]/[file]/route.ts
                              GET adjunto con verificación de sesión + socios.read

src/components/admin/data.ts  + entrada "Padrón de socios" en SIDEBAR_NAV (icono id-card)

src/lib/auth/permissions.ts   + permisos socios.* (read, write, delete, change-state)
                              − permisos incidents.*

prisma/schema.prisma          Cambios arriba descritos
prisma/seed.ts                Quitar INCIDENT_CATEGORIES y su sincronización
private-uploads/socios/.gitkeep
.gitignore                    + /private-uploads/socios/* (con !.gitkeep)
```

## Server actions

Todas en `src/app/(admin)/socios/actions.ts`, marcadas `"use server"`, validan sesión + permiso con `requirePermission(...)` (helper existente en `src/lib/auth/server.ts`). Devuelven `{ ok: true, ... }` o `{ ok: false, error: "<CODE>" }`.

| Acción | Permiso |
|---|---|
| `listSocios({ q, estado, tipoDocumento, page })` | `socios.read` |
| `getSocio(id)` | `socios.read` |
| `createSocio(input)` | `socios.write` |
| `updateSocio(id, patch)` | `socios.write` |
| `deleteSocio(id)` | `socios.delete` |
| `changeEstadoSocio(id, toEstado, motivo)` | `socios.change-state` |
| `uploadAdjunto(socioId, tipo, file)` | `socios.write` |
| `setFoto(socioId, file)` | `socios.write` |
| `removeAdjunto(adjuntoId)` | `socios.write` |

### Códigos de error

`DOC_INVALID`, `DOC_DUPLICATE`, `EMAIL_INVALID`, `NOT_FOUND`, `SAME_STATE`, `MOTIVO_REQUIRED`, `FILE_TOO_LARGE`, `MIME_NOT_ALLOWED`, `CODIGO_RACE`, `FORBIDDEN`, `INTERNAL_ERROR`.

### Flujos críticos

**createSocio** corre en `prisma.$transaction`:
1. Validar entrada server-side.
2. Verificar `(tipoDocumento, numeroDocumento)` no duplicado en la misma tx.
3. Leer `MAX(codigo)`, incrementar, padear a 6 dígitos (`SOC-000001`).
4. Insertar `Socio` con `createdById`/`updatedById = actor.id`.
5. Insertar `SocioEstadoLog` inicial (transición `activo → activo`, motivo "Alta del socio").

El `@unique(codigo)` actúa como red de seguridad ante race conditions: si dos tx generan el mismo correlativo, una falla con `P2002` y el código reintenta hasta 3 veces.

**changeEstadoSocio** corre en `prisma.$transaction`:
1. Leer estado actual; rechazar si igual al nuevo (`SAME_STATE`).
2. Validar `motivo.length >= 5` (`MOTIVO_REQUIRED`).
3. Update `Socio.estado` + `updatedById`.
4. Insertar `SocioEstadoLog` con from/to/motivo/byUserId.
5. Si `toEstado === fallecido`, también marcar `portalEnabled = false`.

**uploadAdjunto** (patrón "DB primero, archivo después"):
1. Validar MIME ∈ {`image/jpeg`, `image/png`, `image/webp`, `application/pdf`} y `size <= 5 MB`.
2. Crear `SocioAdjunto` con `url = ""`.
3. Escribir archivo a `private-uploads/socios/{socioId}/{adjuntoId}.{ext}`.
4. Si falla escritura, borrar la fila y propagar error.
5. Update fila con `url` real. Si `tipo === "foto"`, además update `socio.fotoUrl`.

**deleteSocio**: Cascade en BD borra adjuntos y logs; luego `storage.removeDir(private-uploads/socios/{id})` (no crítico si falla, se loggea).

**listSocios**: filtros vía `searchParams` (no estado cliente); ordenación default `apellidoPaterno asc`; `pageSize = 25` constante.

## UI (resumen)

- **Listado**: tabla (mobile: cards) con código, documento, nombre completo, estado, menú de acciones. Búsqueda + filtros en URL.
- **Crear**: modal con secciones Identificación / Contacto / Asociación.
- **Detalle**: drawer 560px con tabs Datos / Adjuntos / Historial. Estado solo modificable vía `ChangeEstadoModal`.
- **Adjuntos**: foto principal arriba + lista 1:N debajo, upload con select de tipo.
- **Historial**: timeline cronológico inverso desde `SocioEstadoLog`.

Accesibilidad: Esc cierra modales (`useEscClose`), focus trap, `aria-live="polite"` para errores, labels asociados.

## Validación

| Campo | Regla |
|---|---|
| `numeroDocumento` (DNI) | `/^\d{8}$/` |
| `numeroDocumento` (RUC) | `/^\d{11}$/` |
| `numeroDocumento` (CE) | `/^\d{9,12}$/` |
| `numeroDocumento` (PASAPORTE) | `/^[A-Za-z0-9]{6,12}$/` |
| `apellidoPaterno`, `nombres`, `fechaIngreso` | requeridos |
| `email` | opcional; si viene, parser de email válido |
| `fechaIngreso`, `fechaNacimiento` | ≤ hoy |
| `portalEnabled = true` | requiere `email` no vacío |
| `motivo` (cambio de estado) | ≥ 5 caracteres |
| `file` adjunto | MIME en lista blanca, `size <= 5 MB` |

Validación tanto en cliente (UX) como en server (autoridad).

## Permisos nuevos

```ts
{ key: "socios.read",         name: "Ver padrón",       category: "Padrón de socios" }
{ key: "socios.write",        name: "Gestionar socios", category: "Padrón de socios" }
{ key: "socios.delete",       name: "Eliminar socios",  category: "Padrón de socios" }
{ key: "socios.change-state", name: "Cambiar estado",   category: "Padrón de socios" }
```

Asignación a roles del sistema:
- `superadmin`: todos.
- `admin`: `socios.read`, `socios.write`, `socios.change-state` (no `delete`).
- `viewer`: `socios.read`.
- `editor` y `reporter`: ninguno (se quedan como están, ahora sin permisos `incidents.*` por eliminación del módulo).

## Plan de migración

1. **Migración `drop_incident`**: elimina tablas y enums del módulo Incident; quita relaciones inversas en `User`; quita permisos `incidents.*` en `permissions.ts`; limpia `seed.ts`.
2. **Migración `add_socio`**: crea enums `TipoDocumento`/`EstadoSocio`/`Sexo`; crea tablas `Socio`/`SocioAdjunto`/`SocioEstadoLog` con índices; agrega relaciones inversas en `User`; agrega permisos `socios.*` y los asigna a roles.

Comandos:
```bash
npx prisma migrate dev --name drop_incident
npx prisma migrate dev --name add_socio
npx tsx prisma/seed.ts
```

El admin existente (`apenam@unamad.edu.pe`) sigue funcionando; al ser `superadmin` gana automáticamente los nuevos permisos.

## Testing

Crear `prisma/verify-socios.ts` (mismo estilo que `verify-users.ts`) que ejercite contra BD real:

1. `createSocio` → verificar `codigo` autogenerado correctamente y `SocioEstadoLog` inicial creado.
2. Dos `createSocio` concurrentes con mismo `(tipoDoc, numeroDoc)` → uno falla con `DOC_DUPLICATE`.
3. Dos `createSocio` concurrentes (datos distintos) → ambos tienen códigos correlativos sin colisión.
4. `changeEstadoSocio` crea log; mismo→mismo rechaza con `SAME_STATE`; sin motivo rechaza con `MOTIVO_REQUIRED`.
5. `deleteSocio` cascadea `SocioAdjunto` y `SocioEstadoLog`.
6. `uploadAdjunto` con MIME no permitido rechaza con `MIME_NOT_ALLOWED`; con archivo > 5 MB rechaza con `FILE_TOO_LARGE`.
7. Validación DNI 7 dígitos rechaza con `DOC_INVALID`.

## Observabilidad

Cada server action emite log `[socios] action=<name> actor=<userId> result=ok|<errorCode>` a `console.info` / `console.error`. Sin telemetría externa en esta fase.

## Dependencias y sub-proyectos siguientes

Este módulo es **base** para los siguientes (cada uno con su propio spec):

- **#2 Puestos**: catálogo físico del mercado, asignación `Puesto ↔ Socio`.
- **#3 Cuotas y aportes**: depende de Socio (y opcionalmente Puesto).
- **#4 Asambleas y asistencia**: depende de Socio.
- **#5 Sanciones**: depende de Socio (mejor después de Asambleas para vincular faltas).
- **#6 Beneficiarios/herederos**: depende de Socio (campos por sucesión cuando `estado=fallecido`).
- **(transversal) Portal del socio**: login DNI + email para que el socio vea sus cuotas, multas, etc. Necesita el campo `userId` y `portalEnabled` que este sub-proyecto deja preparados.
