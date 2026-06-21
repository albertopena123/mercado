# Diseño · Autoservicio "Actualizar mis datos" (DNI + apidatos) en el portal del socio

- **Fecha:** 2026-06-21
- **Autor:** Claude (ingeniería) + apenam
- **Estado:** Propuesto (pendiente de aprobación del spec)
- **Decisión clave aprobada:** Opción A — el envío crea una **Solicitud de actualización pendiente** que un admin revisa y aprueba; al aprobar se aplica al padrón.

---

## 1. Objetivo

Permitir que un socio con acceso al portal **ingrese su DNI**, autollene su información
desde **apidatos** (UNAMAD), **edite** los campos (sobre todo los que apidatos no provee:
teléfono, email, ubicación), y **envíe** una solicitud. Un administrador revisa la
solicitud (ve el diff contra el dato actual) y la **aprueba o rechaza**. Al aprobar, los
cambios se aplican al padrón de forma atómica y auditada.

Caso de uso principal: regularización masiva del padrón (244 socios sin DNI / datos
incompletos) trasladando el trabajo de captura al propio socio, pero manteniendo el
padrón —que tiene peso legal (asambleas, voto, titularidad de puesto)— bajo control del
administrador.

## 2. Por qué Opción A (aprobación) y no escritura directa

- `Socio` tiene `@@unique([tipoDocumento, numeroDocumento])` y el documento se **propaga
  al login** (`User.numeroDocumento`). Dejar que el socio reescriba su identidad oficial
  sin revisión es riesgoso (colisión, suplantación).
- El sistema entero es admin-managed; el padrón se modifica con auditoría
  (`SocioEstadoLog`, `createdBy/updatedBy`). La aprobación encaja con esa filosofía.
- El lookup de apidatos acepta **cualquier** DNI: sin revisión, un socio podría autollenar
  la identidad de otra persona. La aprobación es el control compensatorio.

## 3. Alcance

**Incluye**
- Modelo `SolicitudActualizacionDatos` + migración (con índice parcial único: 1 pendiente
  por socio).
- Portal: página `/portal/perfil/actualizar` con formulario DNI→autollenar→editar→enviar;
  banner de "solicitud en revisión"; opción de cancelar la propia solicitud pendiente.
- Acciones de portal: `lookupDniPortal`, `crearSolicitudActualizacion`,
  `cancelarMiSolicitud` (autorizadas por el vínculo de socio, no por `socios.write`).
- Admin: bandeja `/socios/solicitudes` (lista de pendientes con diff actual→propuesto),
  acciones `aprobarSolicitud` y `rechazarSolicitud`; contador de pendientes.
- Refactor mínimo: extraer `validateSocioInput` + el mapeo de patch a un módulo reutilizable
  para que la aprobación aplique los cambios por la **misma ruta validada** que `updateSocio`,
  dentro de **una sola transacción** (atomicidad).

**No incluye (YAGNI)**
- Notificaciones por email/SMS al aprobar/rechazar.
- Auto-aprobación de cambios de bajo riesgo (solo contacto).
- Creación de cuentas de portal para socios que aún no la tienen (precondición, ver §12).
- Edición de una solicitud pendiente (el socio cancela y reenvía; o el admin rechaza).

## 4. Modelo de datos

Nuevo enum + modelo en `prisma/schema.prisma`:

```prisma
enum EstadoSolicitudActualizacion {
  pendiente
  aprobada
  rechazada
}

model SolicitudActualizacionDatos {
  id            String @id @default(cuid())
  socioId       String
  // Snapshot de los valores PROPUESTOS por el socio. Solo campos editables
  // (whitelist §6). JSON para no acoplar el esquema a la forma del formulario.
  datos         Json
  estado        EstadoSolicitudActualizacion @default(pendiente)
  motivoRechazo String?
  creadoEn      DateTime  @default(now())
  revisadoPorId String?
  revisadoEn    DateTime?

  socio       Socio @relation(fields: [socioId], references: [id], onDelete: Cascade)
  revisadoPor User? @relation("SolicitudRevisadaPor", fields: [revisadoPorId], references: [id], onDelete: SetNull)

  @@index([socioId])
  @@index([estado])
}
```

Relaciones inversas a agregar:
- `Socio`: `solicitudesActualizacion SolicitudActualizacionDatos[]`
- `User`: `solicitudesRevisadas SolicitudActualizacionDatos[] @relation("SolicitudRevisadaPor")`

**Migración** `prisma/migrations/20260621xxxxxx_solicitud_actualizacion_datos/`:
- Generada con `npx prisma migrate dev --name solicitud_actualizacion_datos` (crea enum + tabla + índices + FKs).
- **Añadir a mano** al final del `migration.sql` un índice parcial único (igual al precedente
  de `cuota_nro_operacion`), que Prisma no expresa en el schema:
  ```sql
  CREATE UNIQUE INDEX "SolicitudActualizacion_unica_pendiente_por_socio"
    ON "SolicitudActualizacionDatos"("socioId")
    WHERE estado = 'pendiente';
  ```
  Garantiza a nivel de BD que un socio tenga como máximo **una** solicitud pendiente.
- Tras migrar: `npx prisma generate`.

## 5. Permisos

- **Socio (portal):** las acciones de portal autorizan con `getSocioActual()` (que ya exige
  `portal.read` + vínculo + `portalEnabled`). **No** se toca el catálogo de permisos.
- **Admin (revisión):** `aprobarSolicitud`/`rechazarSolicitud`/bandeja autorizan con el
  permiso existente **`socios.write`** (gestionar padrón). No se crea permiso nuevo → migración
  de seed innecesaria. (Alternativa descartada por scope: permiso dedicado `socios.solicitudes`.)

## 6. Campos editables (whitelist) y mapeo apidatos

El formulario y el JSON `datos` solo manejan este subconjunto de `Socio`:

| Campo | apidatos lo da | Notas |
|---|---|---|
| `tipoDocumento` | — (asume DNI) | editable; por defecto DNI |
| `numeroDocumento` | sí (clave de lookup) | 8 dígitos si DNI; valida formato; permite regularizar `SIN-DNI-####` |
| `apellidoPaterno` | sí (AP_PAT) | requerido |
| `apellidoMaterno` | sí (AP_MAT) | opcional |
| `nombres` | sí (NOMBRES) | requerido |
| `fechaNacimiento` | sí (FECHA_NAC) | opcional |
| `sexo` | sí (SEXO) | opcional, M/F |
| `estadoCivil` | a veces (EST_CIVIL) | opcional |
| `direccion` | a veces (DIRECCION) | opcional |
| `distrito` | **no** | autoservicio |
| `provincia` | **no** | autoservicio |
| `departamento` | **no** | autoservicio |
| `telefono` | **no** | autoservicio |
| `email` | **no** | autoservicio; ver §12 (no cambia el login) |

**Nunca** editables por el socio: `codigo`, `numeroPadron`, `estado`, `fechaIngreso`,
`saldoAFavor`, `observaciones`, `portalEnabled`, `userId`, `fotoUrl`.

## 7. Componentes y archivos

**Socio**
- `src/lib/portal/data.ts` → nuevo `getMisDatosCompletos(socioId)`: devuelve los valores
  actuales de la whitelist (prefill del formulario) + si hay solicitud pendiente.
- `src/app/(socio)/portal/perfil/actualizar/page.tsx` (Server Component): `requireSocio()`,
  carga datos actuales + estado de solicitud, renderiza el formulario o el banner.
- `src/app/(socio)/portal/perfil/ActualizarDatosForm.tsx` (Client `"use client"`): réplica del
  patrón de `CreateSocioModal` (useTransition + useState + `autoRef` snapshot + debounce 450ms),
  con estilos de portal (`pt-field`, `pt-field__err`, `pt-btn`) y `useToast`.
- `src/app/(socio)/portal/perfil/page.tsx`: añadir tarjeta/enlace "Actualizar mis datos" y, si
  hay pendiente, un aviso "Tienes una solicitud en revisión".
- `src/app/(socio)/portal/actions.ts`: `lookupDniPortal`, `crearSolicitudActualizacion`,
  `cancelarMiSolicitud`.

**Admin**
- `src/app/(admin)/socios/solicitudes/page.tsx` (Server): lista de pendientes con diff
  actual→propuesto por solicitud.
- `src/app/(admin)/socios/solicitudes/SolicitudesList.tsx` (Client): botones Aprobar/Rechazar
  (rechazo pide motivo), feedback con `useToast`.
- `src/app/(admin)/socios/solicitudes/actions.ts`: `listSolicitudesPendientes`,
  `aprobarSolicitud`, `rechazarSolicitud`.
- Entrada de navegación + badge de pendientes en el menú admin de socios (mismo patrón de los
  contadores existentes).

**Compartido (refactor)**
- `src/lib/socios/update.ts` (server-only): exporta `validateSocioInput` (movido desde
  `(admin)/socios/actions.ts`) y `buildSocioUpdateData(normalized, existing)` que devuelve
  `{ data, searchKey, docCambia }` (el mapeo que hoy vive inline en `updateSocio`).
  `updateSocio` se refactoriza para delegar en estas funciones (cambio acotado, sin alterar
  comportamiento). `aprobarSolicitud` las reutiliza dentro de su propia transacción.

## 8. Contratos de las server actions

Reutilizar el tipo `ActionResult<T>` de `socios/types.ts` (o el equivalente local del portal).

**Portal** (auth = `getSocioActual()`; si no hay socio → `{ ok:false }`):
- `lookupDniPortal(dni: string): Promise<ActionResult<DniLookupResult>>` — valida 8 dígitos,
  llama `lookupDniUnamad`, mismo manejo de timeout/no-encontrado que `lookupDniAction`. **No**
  exige `socios.write`.
- `crearSolicitudActualizacion(input: PerfilSelfInput): Promise<ActionResult<{ id }>>` —
  resuelve el socio del usuario logueado (ignora cualquier `socioId` del cliente), valida con
  `validateSocioInput(merged, false)` sobre la whitelist, rechaza si ya hay pendiente (chequeo
  app + índice parcial), persiste `datos` (JSON), `estado=pendiente`. `revalidatePath('/portal/perfil')`.
- `cancelarMiSolicitud(): Promise<ActionResult>` — marca la pendiente del propio socio como
  cancelada/eliminada para poder reenviar.

**Admin** (auth = `authorize('socios.write')`):
- `listSolicitudesPendientes()` — pendientes + datos actuales del socio para el diff.
- `aprobarSolicitud(id): Promise<ActionResult>` — en **una** `$transaction`:
  1. relee la solicitud y exige `estado=pendiente` (guard contra doble-aprobación, vía
     `updateMany`/relectura);
  2. `validateSocioInput(merged, false)` + `buildSocioUpdateData`;
  3. `tx.socio.update` (incluye `updatedBy = revisor`, `searchKey` recomputado);
  4. si cambió el documento y el socio tiene `userId`, propaga a `User` (igual que `updateSocio`);
  5. `tx.solicitud.update` → `aprobada`, `revisadoPorId`, `revisadoEn`.
  - `catch P2002` → `fail("Ya existe un socio con ese documento.")` (no aplica nada).
  - `revalidatePath('/socios')` + ruta de solicitudes.
- `rechazarSolicitud(id, motivo): Promise<ActionResult>` — `estado=rechazada`, `motivoRechazo`,
  `revisadoPorId`, `revisadoEn`. `motivo` mínimo razonable.

## 9. Flujo

```
Socio (portal)                         Admin (panel)
──────────────                         ─────────────
/portal/perfil/actualizar
  DNI 8 díg ──► lookupDniPortal ──► apidatos
  autollenar (autoRef preserva ediciones)
  editar contacto/identidad
  [Enviar] ──► crearSolicitudActualizacion
                 └─ estado=pendiente (1 por socio)
                                       /socios/solicitudes
                                         ve diff actual→propuesto
                                         [Aprobar] ─► aprobarSolicitud (atómica)
                                            └─ updateSocio path + estado=aprobada
                                         [Rechazar+motivo] ─► rechazarSolicitud
banner "en revisión" / "rechazada: <motivo>"
```

## 10. UX, estilos y convenciones Next 16

- **Patrón de formulario:** copiar el de `CreateSocioModal` pero NO usar `useActionState`. El
  proyecto usa `useTransition`/`useState` + `onSubmit` manual que llama la acción (consistencia).
- **Lookup:** debounce 450 ms, indicador de estado (cargando/ok/error), `reqIdRef` para descartar
  respuestas obsoletas, `autoRef` para no pisar lo que el socio editó.
- **Estilos:** portal (`pt-panel`, `pt-field`, `pt-field__err`, `pt-btn`, `pt-back`, `pt-hello`),
  como `PasswordForm`. Admin: clases existentes de la bandeja/listas.
- **Feedback:** `useToast()` de `@/components/admin/toast` (ya disponible en el shell del socio).
- **Next 16.2.6:** server actions con `"use server"`; `cookies()/headers()` async (ya encapsulado
  en `getCurrentUser`); `revalidatePath` tras mutaciones.

## 11. Reuso y validación

- Identidad/contacto se validan con `validateSocioInput` (formato de documento, fechas no
  futuras medidas contra hoy-Perú, email, normalización de tokens). Acepta `SIN-DNI-####` para
  permitir la regularización.
- El documento se normaliza con `normalizeNumeroDocumento`; `searchKey` se recomputa en la
  aprobación (no en la solicitud, porque solo aplica al aprobar).

## 12. Casos borde y seguridad

- **Solo socios con portal** (portalEnabled + userId + portal.read) pueden usarlo. Los 244 sin
  cuenta quedan fuera hasta que se les habilite acceso (fuera de alcance).
- **Suspendidos** sí acceden al portal → sí pueden enviar solicitud (correcto: regularizan).
- **DNI ajeno:** mitigado por la aprobación; además, en la aprobación, `P2002` bloquea colisión
  con el documento de otro socio. El admin debe verificar identidad antes de aprobar un cambio de
  documento (nota operativa en la UI).
- **email:** la aprobación actualiza `Socio.email` pero **no** `User.email` (login). Se documenta;
  cambiar credenciales de acceso queda como acción admin aparte.
- **Doble envío / doble aprobación:** índice parcial único (1 pendiente) + guard de estado en
  `aprobarSolicitud`.
- **Inyección de socioId:** las acciones de portal SIEMPRE derivan el socio del usuario logueado;
  ignoran cualquier id que venga del cliente.

## 13. Verificación (antes de "listo")

- `npx prisma migrate dev` aplica limpio; índice parcial creado (verificar en BD).
- `npx tsc --noEmit` y `npm run lint` en verde.
- Manual: socio sin DNI ingresa DNI real → autollena → edita teléfono → envía → ve "en
  revisión"; segundo envío bloqueado; admin ve diff → aprueba → padrón actualizado y login del
  socio sigue funcionando; rechazo con motivo se muestra al socio; cancelar permite reenviar.
- Caso colisión: dos socios proponen el mismo DNI → la segunda aprobación falla con mensaje claro.

## 14. Riesgos

- Refactor de `validateSocioInput`/mapeo desde un `actions.ts` de ~1200 líneas: acotar el cambio,
  confirmar que `updateSocio` mantiene comportamiento idéntico (tipos + lint + prueba manual).
- Volatilidad de apidatos (ya documentada en `dni-lookup.ts`): el formulario debe ser usable aun
  si el lookup falla (el socio puede llenar a mano).
