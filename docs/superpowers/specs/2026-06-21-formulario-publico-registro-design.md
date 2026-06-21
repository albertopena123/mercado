# Diseño · Formulario público de datos `/formulario` (DNI + celular + correo, sin login)

- **Fecha:** 2026-06-21
- **Estado:** Aprobado (decisiones clave confirmadas por el usuario)
- **Relación:** complementa —no reemplaza— el autoservicio autenticado `/portal/perfil/actualizar` ya implementado. Reutiliza apidatos, `validateSocioInput`/`buildSocioUpdateData` y el patrón de aprobación atómica.

## 1. Objetivo

Un formulario **público, sin inicio de sesión**, accesible desde `/formulario` (link para WhatsApp), donde un socio ingresa su **DNI** (→ autollena su nombre desde apidatos), su **celular** y su **correo (opcional)** y envía. El envío NO toca el padrón: crea un registro **pendiente** que la administración revisa, **empareja con el socio existente** del padrón y **aprueba** (regulariza el documento SIN-DNI→DNI y guarda celular/correo) o **rechaza**.

Motivación: los ~244 socios **sin DNI** están en el padrón con documento `SIN-DNI-####` y **no tienen cuenta de portal** → no pueden usar el formulario autenticado. Este formulario público recoge sus datos a escala vía WhatsApp.

## 2. Decisiones confirmadas

- **Campos:** `DNI` (req, 8 díg) → autollena `Apellidos y nombres` (un solo campo de texto, editable; funciona aunque apidatos no tenga ese DNI) + `Celular` (req) + `Correo` (opcional).
- **Al aprobar:** el admin **empareja con un socio existente** (buscador del padrón) y se aplican `numeroDocumento`(DNI) + `telefono` + `email` a ese socio. Si no hay match → **rechaza**. **No** se crean socios nuevos desde aquí.
- El **nombre** enviado es solo para que el admin identifique/empareje; **no** se sobreescribe el nombre del socio en el padrón.

## 3. Alcance

**Incluye**
- Modelo `SolicitudRegistroPublico` + migración (índice parcial único: 1 pendiente por DNI).
- Página pública `/formulario` (mobile-first) + componente cliente con lookup apidatos.
- Acciones públicas (sin auth, **rate-limited**): `lookupDniPublico`, `enviarRegistroPublico`.
- Helper compartido de rate-limit `src/lib/rate-limit.ts` (extraído del patrón del login).
- Bandeja admin `/socios/registros`: lista de pendientes + **buscador de socio** para emparejar + aprobar/rechazar; chip con contador en `/socios`.
- Acciones admin: `listRegistrosPublicos`, `buscarSociosParaMatch`, `aprobarRegistroPublico`, `rechazarRegistroPublico`, `contarRegistrosPublicos`.

**No incluye (YAGNI)**
- Alta de socios nuevos desde el formulario (confirmado: solo emparejar existentes).
- Notificaciones email/SMS; captcha (el rate-limit basta por ahora; captcha es ampliación futura).
- Sobrescribir el nombre del socio con el de apidatos.

## 4. Modelo de datos

```prisma
model SolicitudRegistroPublico {
  id              String        @id @default(cuid())
  tipoDocumento   TipoDocumento @default(DNI)
  numeroDocumento String        // DNI 8 díg (matching + dedupe de pendientes)
  nombreCompleto  String        // de apidatos, editable; SOLO para identificar/emparejar
  telefono        String        // celular requerido
  email           String?
  estado          EstadoSolicitudActualizacion @default(pendiente) // reusa enum existente
  socioVinculadoId String?      // lo fija el admin al aprobar
  motivoRechazo   String?
  ip              String?       // auditoría anti-abuso
  creadoEn        DateTime  @default(now())
  revisadoPorId   String?
  revisadoEn      DateTime?

  socioVinculado Socio? @relation("RegistroPublicoSocio", fields: [socioVinculadoId], references: [id], onDelete: SetNull)
  revisadoPor    User?  @relation("RegistroPublicoRevisor", fields: [revisadoPorId], references: [id], onDelete: SetNull)

  @@index([estado])
  @@index([numeroDocumento])
}
```

Relaciones inversas: `Socio.registrosPublicos`, `User.registrosPublicosRevisados`.

**Migración** (hand-written, mismo estilo que las anteriores): `CREATE TABLE` + índices + FKs, y el índice parcial único:
```sql
CREATE UNIQUE INDEX "RegistroPublico_unico_pendiente_por_doc"
  ON "SolicitudRegistroPublico"("numeroDocumento")
  WHERE estado = 'pendiente';
```
Aplicar con `prisma migrate deploy` (el entorno local ya está al día; ver [[inventario-migration-drift]] para otros entornos). Reusa el enum `EstadoSolicitudActualizacion` (ya existe).

## 5. Seguridad / anti-abuso (porque es público)

- **Rate-limit por IP** (ventana deslizante en memoria, patrón del login) en `lookupDniPublico` (~15/min) y `enviarRegistroPublico` (~5/min). Extraído a `src/lib/rate-limit.ts` (`rateCheck` + `getClientIp`).
- Se guarda `ip` en cada registro para auditoría.
- **1 pendiente por DNI** (chequeo app + índice parcial) evita flood/duplicados.
- **Aislamiento:** el envío público SOLO escribe en `SolicitudRegistroPublico`; el padrón cambia únicamente en la aprobación del admin. El spam, en el peor caso, llena la cola de pendientes (el admin rechaza), nunca corrompe el padrón.
- La consulta de DNI no expone más de lo que apidatos ya da, y va rate-limited.

## 6. Componentes y archivos

**Público**
- `src/lib/rate-limit.ts` — `rateCheck(key,max,windowMs)` + `getClientIp()` (de la lógica del login).
- `src/app/formulario/page.tsx` (Server, público): cabecera con marca + `FormularioPublico`. `dynamic = "force-dynamic"`.
- `src/app/formulario/FormularioPublico.tsx` (Client): DNI → lookup debounced → `nombreCompleto` editable + celular + correo → enviar → pantalla "¡Gracias!". Feedback **inline** (el root layout no tiene ToastProvider). Mobile-first.
- `src/app/formulario/actions.ts` (`"use server"`): `lookupDniPublico`, `enviarRegistroPublico` (rate-limited, sin auth).
- CSS mínimo propio (`formulario.css`) o clases globales; tarjeta centrada mobile-first.

**Admin**
- `src/app/(admin)/socios/registros/page.tsx` (Server, `requirePermission("socios.write")`).
- `src/app/(admin)/socios/registros/RegistrosList.tsx` (Client): por registro, DNI + nombreCompleto + celular + correo + **buscador de socio** (autosugerencia por nombre/DNI/código) → Aprobar (con socioId) / Rechazar (motivo). `useToast`, `router.refresh()`, `useTransition`.
- `src/app/(admin)/socios/registros/actions.ts`: las 5 acciones admin.
- Chip "Registros (N)" en `SociosClient` (gated `perms.canWrite`) → `/socios/registros`, junto al de Solicitudes.

## 7. Contratos de acciones

**Público** (sin auth; rate-limit dentro):
- `lookupDniPublico(dni): Promise<{ ok:true; nombre:string } | { ok:false; error:string }>` — IP rate-limit; 8 díg; apidatos; arma `nombre` = `"AP_PAT AP_MAT, NOMBRES"`; 429 amigable si excede.
- `enviarRegistroPublico(input:{ numeroDocumento; nombreCompleto; telefono; email? }): Promise<{ ok:true } | { ok:false; error; fieldErrors? }>` — IP rate-limit; valida DNI 8 díg, nombreCompleto no vacío, telefono (solo díg, 6–15), email opcional válido; rechaza si ya hay pendiente con ese DNI; guarda con `ip`; P2002 (índice parcial) → "ya enviaste tus datos, están en revisión".

**Admin** (`authorize("socios.write")`):
- `listRegistrosPublicos()` — pendientes (con sugerencias de match opcionales).
- `buscarSociosParaMatch(q): {id;codigo;nombre;tipoDocumento;numeroDocumento}[]` — busca en el padrón (reusa el `searchKey`/listSocios).
- `aprobarRegistroPublico(id, socioId): ActionResult` — **transacción atómica** (igual patrón que `aprobarSolicitud`): guard updateMany (pendiente→aprobada + socioVinculadoId + revisor); valida `{tipoDocumento:DNI, numeroDocumento, telefono, email}` con `validateSocioInput`; aplica con `buildSocioUpdateData` (+ updatedBy); propaga documento al `User` si corresponde; P2002 (DNI en uso por otro socio) → error amigable, nada aplicado.
- `rechazarRegistroPublico(id, motivo): ActionResult` — motivo ≥5; guard updateMany pendiente→rechazada.
- `contarRegistrosPublicos(): Promise<number>`.

## 8. Flujo

```
Público (sin login)                 Admin (socios.write)
───────────────────                 ────────────────────
/formulario
 DNI ──► lookupDniPublico ──► apidatos
 nombre (editable) + celular + correo
 [Enviar] ──► enviarRegistroPublico
              └─ SolicitudRegistroPublico (pendiente, 1 por DNI, +ip)
 "¡Gracias! La administración revisará tus datos."
                                    /socios/registros
                                      ve DNI+nombre+celular+correo
                                      [buscar socio ▾] → elige match
                                      [Aprobar] ─► aprobarRegistroPublico(id, socioId)
                                         └─ aplica DNI+tel+correo al socio (atómico)
                                      [Rechazar+motivo]
```

## 9. Casos borde

- **apidatos sin datos para el DNI:** el lookup devuelve vacío; el socio escribe su nombre a mano (campo editable). El envío sigue funcionando.
- **DNI ya pertenece a otro socio** (colisión al aprobar): `P2002` → "Ese DNI ya está registrado en otro socio"; nada se aplica; el admin investiga.
- **Doble envío:** índice parcial (1 pendiente/DNI) + chequeo app + catch P2002 en el envío.
- **El admin no encuentra al socio:** rechaza con motivo (no se crea socio nuevo).
- **Spam:** rate-limit + aislamiento (solo cola de pendientes, nunca el padrón).

## 10. Verificación

- `prisma migrate deploy` aplica limpio; índice parcial presente (script verify).
- `tsc` (filtrado de ruido `.next`) + `eslint` + `next build` en verde.
- Manual: enviar desde `/formulario` sin login → aparece en `/socios/registros` → emparejar con un socio SIN-DNI → aprobar → el socio queda con su DNI real + celular + correo y puede luego loguearse; segundo envío del mismo DNI bloqueado; rate-limit responde 429 al exceder.

## 11. Fuera de alcance / futuro

Captcha, notificaciones, alta de socios nuevos, y refactor del login para que use `src/lib/rate-limit.ts` (se deja el login intacto; el helper nace para el código nuevo).
