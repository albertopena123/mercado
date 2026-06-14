# Diseño: Usuarios vinculados al padrón + login por documento o correo

- **Fecha:** 2026-06-13
- **Estado:** Aprobado (diseño) — pendiente revisión del spec por el usuario
- **Autor:** Equipo Mercado Milagros

## 1. Objetivo

Permitir que:

1. Los usuarios inicien sesión con **número de documento O correo** (cualquiera de los dos) + contraseña.
2. Al **crear un usuario** se pueda **vincular con el padrón de socios** (un comerciante = su registro de socio).
3. Se mantenga la relación existente **1 socio → N puestos** (ya implementada).

## 2. Estado actual (verificado en el código)

- **Auth:** login solo por **correo + contraseña**. `src/app/login/LoginForm.tsx` envía `{email, password}` →
  `src/app/api/auth/login/route.ts` busca `User` por email (normalizado a minúsculas), verifica con scrypt +
  `timingSafeEqual`, rate-limit 10/min por IP, dummy-hash anti-timing → `createSessionFor()` en
  `src/lib/auth/server.ts` (sesión con cookie HMAC `conadis_session`, TTL 14 días, o Bearer en mobile).
  `src/proxy.ts` protege todo salvo `/login`, `/403`, `/verificar`, `/api/auth/*`, `/` (landing).
- **Modelo `User`** (`prisma/schema.prisma`): `id`, `email @unique`, `name`, `passwordHash` (scrypt), `active`,
  `lastLoginAt`, `roles UserRole[]`, `socioAccount Socio?` (relación `SocioUser`). **No tiene documento.**
- **Padrón `Socio`** (`prisma/schema.prisma`): `codigo @unique`, `tipoDocumento` (enum `TipoDocumento`:
  DNI/CE/PASAPORTE/RUC), `numeroDocumento`, `@@unique([tipoDocumento, numeroDocumento])`, apellidos, nombres,
  `estado`, `email?` (NO único), `userId? @unique` (FK→User, `onDelete: SetNull`, relación `SocioUser`),
  `portalEnabled` (default false), `searchKey`. CRUD completo (`socios/actions.ts`, validación en
  `src/lib/socios/document.ts`, normalización en `src/lib/socios/normalize.ts`).
- **Puestos:** `Puesto` y `PuestoAsignacion` (`socioId`↔`puestoId`, `desde`, `hasta?`=null vigente). La relación
  **1 socio → N puestos ya existe** y funciona.
- **Vínculo socio↔usuario:** `Socio.userId` + `portalEnabled` existen pero **nada los setea**. `createUser`
  (`src/app/(admin)/usuarios/actions.ts`) crea el `User` aislado (name/email/password/roleIds);
  `CreateUserModal.tsx` fuerza correo `@unamad.edu.pe`.

## 3. Decisiones (acordadas con el usuario)

1. **Quién accede:** todos (staff y comerciantes) por documento o correo.
2. **Credenciales:** identificador = **correo O número de documento**; secreto = **contraseña** (se conserva el
   hash scrypt actual). El documento NO reemplaza a la contraseña.
3. **Usuario ↔ Socio:** comerciantes = usuario vinculado a su socio; staff = usuario **sin** socio.
4. **Correo opcional**; **documento** como identificador universal. Todo usuario debe tener **al menos uno**
   (documento o correo) + contraseña.
5. **Arquitectura del documento (Enfoque A):** el documento se guarda en `User` (denormalizado). Al vincular un
   socio se **copia** su documento al usuario (solo lectura); se **re-sincroniza** si el padrón lo corrige.

## 4. Modelo de datos (Prisma)

Cambios en `User`:

```prisma
model User {
  // ...existente...
  email           String?        @unique          // ahora OPCIONAL (Postgres permite varios NULL)
  tipoDocumento   TipoDocumento?                   // reutiliza el enum existente
  numeroDocumento String?
  // ...
  @@unique([tipoDocumento, numeroDocumento])
}
```

- **Migración:** columnas **nullables** para no romper usuarios existentes (que no tienen documento). Los
  usuarios actuales quedan "sin documento" y siguen entrando por correo hasta que un admin les registre el
  documento. No se inventan DNIs de relleno.
- **Regla efectiva (validada en la app):** todo usuario debe tener **documento o correo** + contraseña.
- `Socio.userId` y `portalEnabled` se conservan tal cual (son el vínculo).

## 5. Login (correo o documento)

- **UI** (`LoginForm.tsx`): el campo "Correo" pasa a **"Correo o número de documento"** (un solo input) +
  contraseña.
- **API** (`/api/auth/login/route.ts`): recibe `{ identifier, password }` (se mantiene compatibilidad si llega
  `email`). Resolución del identificador:
  - Si contiene `@` → buscar `User` por `email` (minúsculas).
  - Si no → `normalizeNumeroDocumento` y buscar `User` por `numeroDocumento`.
- Se **conserva** todo lo de seguridad: scrypt, `timingSafeEqual`, rate-limit 10/min, dummy-hash anti-timing,
  **error genérico** ("Correo/documento o contraseña incorrectos").
- Reutiliza `normalizeNumeroDocumento` / `validateNumeroDocumento` de `src/lib/socios/document.ts`.
- **Caso borde:** un número podría coincidir en dos tipos de documento (raro, porque el `@@unique` es por
  tipo+número). Si la búsqueda por número devuelve >1 usuario, se trata como credencial ambigua → error
  genérico y se sugiere ingresar por correo. (Se documenta; colisión muy improbable.)

## 6. Crear usuario (vínculo con el padrón)

`CreateUserModal` con **dos modos**:

- **Comerciante (socio):** buscador del padrón (autocomplete por documento/nombre, reusa `searchKey` /
  `normalize`). Al elegir un socio → autocompleta nombre + documento (**solo lectura**) + correo si lo tuviera.
- **Personal (staff):** nombre + tipo/número de documento + correo **opcional**, manual.
- **Común:** contraseña + roles. Se **elimina** la obligación de dominio `@unamad.edu.pe`.

`createUser` (en **transacción**):

1. Validar unicidad de documento y de correo (si se da).
2. **Modo socio:** cargar `Socio`; verificar que **no esté ya vinculado** (`userId` null) y que el socio esté en
   estado válido; crear `User` copiando `tipoDocumento`/`numeroDocumento` del padrón; setear `Socio.userId =
   user.id` y `portalEnabled = true`.
3. **Modo staff:** crear `User` con el documento ingresado.
4. **Errores claros:** socio inexistente, socio ya vinculado, documento duplicado, correo duplicado.

## 7. Sincronización (Enfoque A)

Al **editar un `Socio`** que tiene `userId` y cambia su `tipoDocumento`/`numeroDocumento` → actualizar el
documento del `User` vinculado (mantiene la copia al día). Punto único de cambio en `socios/actions.ts`
(update).

## 8. Socio → N puestos

**Ya implementado** (`PuestoAsignacion`). No se modifica en este trabajo.

- *Opcional / fuera de alcance ahora:* vista "puestos de este socio" en el detalle del socio (hoy se ve por
  puesto, no la inversa).

## 9. Manejo de errores y casos borde

- Login por documento de un usuario **sin correo** → funciona (documento es identificador universal).
- Usuarios **existentes sin documento** → entran por correo hasta que se les registre el documento.
- Documento ambiguo entre tipos → error genérico (ver §5).
- Intento de vincular un socio ya vinculado → error explícito en la creación.

## 10. Pruebas

- **Login:** por correo, por documento, contraseña incorrecta, identificador inexistente, usuario sin correo,
  documento ambiguo.
- **createUser:** socio vinculado OK; socio ya vinculado (error); staff sin socio; documento duplicado; correo
  duplicado; correo ausente (permitido).
- **Re-sincronización:** editar documento de un socio con usuario vinculado actualiza al usuario.

## 11. Fuera de alcance

- Portal de socio / vista de "mis puestos" para el usuario comerciante.
- Cambiar el mecanismo de contraseña (se conserva scrypt).
- Backfill masivo de documentos en usuarios existentes.
