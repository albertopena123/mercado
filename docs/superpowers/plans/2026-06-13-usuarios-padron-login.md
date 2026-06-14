# Usuarios vinculados al padrón + login por documento o correo — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir iniciar sesión con número de documento **o** correo, y crear usuarios vinculados al padrón de socios (correo opcional).

**Architecture:** El documento se denormaliza en `User` (Enfoque A): `tipoDocumento`/`numeroDocumento` nullables + `email` opcional. El login resuelve el identificador (correo si tiene `@`, si no documento) y verifica la contraseña (scrypt, sin cambios). La creación de usuario tiene dos modos: *comerciante* (elige un socio del padrón → copia su documento y enlaza `Socio.userId`) y *staff* (documento manual). Al editar un socio con usuario, su documento se re-sincroniza.

**Tech Stack:** Next.js 16 (App Router, server actions), React 19, Prisma 7 (Postgres, cliente generado en `@/generated/prisma`), TypeScript. **No hay runner de tests** → la verificación es `npx tsc --noEmit`, `npm run lint`, `npx prisma validate/migrate` y verificación manual con la app/Playwright.

**Requisito 3 (un socio con varios puestos) YA está implementado** (`PuestoAsignacion`) y no requiere cambios; solo se verifica al final.

**Convenciones del repo (respetarlas):** server actions con `"use server"`, helpers `authorize(perm)`, `fail()/ok()`, clase `Denied`, `isP2002(e)`, `prisma.$transaction`. Validación de documento con `validateNumeroDocumento`/`normalizeNumeroDocumento` (`@/lib/socios/document`). Búsqueda por `searchKey` + `normalizeToken` (`@/lib/socios/normalize`).

---

## Task 1: Esquema — documento en `User` + correo opcional + migración

**Files:**
- Modify: `prisma/schema.prisma` (modelo `User`, líneas 13-41)
- Create: migración Prisma (generada por el comando)

- [ ] **Step 1: Editar el modelo `User`**

En `prisma/schema.prisma`, reemplazar la línea `email String @unique` y agregar los campos de documento + el índice único. El bloque `User` debe quedar:

```prisma
model User {
  id           String     @id @default(cuid())
  email        String?    @unique
  name         String
  passwordHash String
  active       Boolean    @default(true)
  lastLoginAt  DateTime?
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt

  tipoDocumento   TipoDocumento?
  numeroDocumento String?

  roles    UserRole[]
  sessions Session[]

  socioAccount    Socio?           @relation("SocioUser")
  sociosCreated   Socio[]          @relation("SocioCreatedBy")
  sociosUpdated   Socio[]          @relation("SocioUpdatedBy")
  socioAdjuntos   SocioAdjunto[]   @relation("SocioAdjuntoUploader")
  socioEstadoLogs SocioEstadoLog[] @relation("SocioEstadoLogBy")

  puestosCreated     Puesto[]           @relation("PuestoCreatedBy")
  puestosUpdated     Puesto[]           @relation("PuestoUpdatedBy")
  puestoAsignaciones PuestoAsignacion[] @relation("PuestoAsignacionBy")
  asambleasCreated   Asamblea[]         @relation("AsambleaCreatedBy")
  asistenciasReg     Asistencia[]       @relation("AsistenciaBy")
  cuotasPago         Cuota[]            @relation("CuotaPagoBy")
  constanciasEmitidas Constancia[]      @relation("ConstanciaEmitidoPor")

  @@unique([tipoDocumento, numeroDocumento])
  @@index([active])
}
```

(El enum `TipoDocumento` ya existe en el schema, no se redefine.)

- [ ] **Step 2: Validar el schema**

Run: `npx prisma validate`
Expected: `The schema at prisma\schema.prisma is valid 🚀`

- [ ] **Step 3: Crear y aplicar la migración**

Asegúrate de que `DATABASE_URL` apunte a la base de desarrollo (la misma que usa `npm run dev`).

Run: `npx prisma migrate dev --name user_documento_y_correo_opcional`
Expected: se crea `prisma/migrations/<timestamp>_user_documento_y_correo_opcional/` y termina con `Your database is now in sync with your schema.` Las filas existentes conservan su `email`; las columnas nuevas quedan `NULL`. (El `@@unique` admite múltiples `NULL` en Postgres.)

> Si `migrate dev` no puede conectarse por el adapter, exporta `DATABASE_URL` con la cadena de conexión directa de Postgres antes de correrlo.

- [ ] **Step 4: Regenerar el cliente Prisma**

Run: `npx prisma generate`
Expected: `Generated Prisma Client` en `src/generated/prisma`.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): documento en User + correo opcional"
```

> Nota: tras este cambio `npx tsc --noEmit` reportará errores donde `email` se usa como no-nulo. Se corrigen en la Task 2.

---

## Task 2: Tipos y UI de la tabla — tolerar correo nulo + exponer documento/socio

**Files:**
- Modify: `src/app/(admin)/usuarios/types.ts`
- Modify: `src/app/(admin)/usuarios/page.tsx`
- Modify: `src/app/(admin)/usuarios/UsersClient.tsx`
- Modify: `src/app/(admin)/usuarios/UserDetailDrawer.tsx`

- [ ] **Step 1: Extender `UserRow`**

En `src/app/(admin)/usuarios/types.ts`, reemplazar el tipo `UserRow` por:

```ts
import type { TipoDocumento } from "@/generated/prisma/client";

export type UserRow = {
  id: string;
  name: string;
  email: string | null;
  tipoDocumento: TipoDocumento | null;
  numeroDocumento: string | null;
  socio: { id: string; codigo: string } | null;
  active: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  roles: { id: string; key: string; name: string }[];
};
```

- [ ] **Step 2: Mapear los nuevos campos en la página**

En `src/app/(admin)/usuarios/page.tsx`, dentro de `prisma.user.findMany({ include: {...} })` agregar `socioAccount` al include, y mapear los campos nuevos en `rows`:

```ts
    prisma.user.findMany({
      include: {
        roles: { include: { role: true } },
        _count: { select: { sessions: true } },
        socioAccount: { select: { id: true, codigo: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
```

```ts
  const rows: UserRow[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    tipoDocumento: u.tipoDocumento,
    numeroDocumento: u.numeroDocumento,
    socio: u.socioAccount
      ? { id: u.socioAccount.id, codigo: u.socioAccount.codigo }
      : null,
    active: u.active,
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
    createdAt: u.createdAt.toISOString(),
    roles: u.roles.map((r) => ({
      id: r.role.id,
      key: r.role.key,
      name: r.role.name,
    })),
  }));
```

- [ ] **Step 3: Tolerar `email` nulo en `UsersClient.tsx`**

En `src/app/(admin)/usuarios/UsersClient.tsx`:

(a) En el filtro de búsqueda (≈ línea 161-168), cambiar `u.email.toLowerCase()` por un identificador seguro que también busque por documento:

```ts
    if (search) {
      out = out.filter(
        (u) =>
          u.name.toLowerCase().includes(search) ||
          (u.email ?? "").toLowerCase().includes(search) ||
          (u.numeroDocumento ?? "").includes(search) ||
          u.roles.some((r) => r.name.toLowerCase().includes(search)),
      );
    }
```

(b) En la celda del nombre (≈ línea 550-552), mostrar el correo o, si no hay, el documento:

```tsx
                        <span
                          className="usr-row-name__sub"
                          title={u.email ?? u.numeroDocumento ?? ""}
                        >
                          {u.email ?? u.numeroDocumento ?? "—"}
                        </span>
```

(c) En el `onSubmit` del `CreateUserModal` (≈ línea 733), el toast ya no puede asumir `input.email`. Cambiar a un mensaje neutro (el modal se reescribe en la Task 7, pero esto evita el error de tipos ahora):

```tsx
          onSubmit={async (input) => {
            const res = await runAction(() => createUser(input));
            if (res.ok) {
              pushToast("success", "Usuario creado.");
              afterMutation();
            }
            return res;
          }}
```

- [ ] **Step 4: Tolerar `email` nulo + mostrar documento en el drawer**

Abrir `src/app/(admin)/usuarios/UserDetailDrawer.tsx`. Donde se renderiza el correo del usuario (busca `user.email`), envolverlo como `user.email ?? "Sin correo"`. Debajo del bloque de identidad, agregar una línea que muestre el documento y, si existe, el código de socio, por ejemplo:

```tsx
{user.numeroDocumento && (
  <div className="drawer__email">
    {user.tipoDocumento} {user.numeroDocumento}
    {user.socio ? ` · Socio ${user.socio.codigo}` : ""}
  </div>
)}
```

(Usa las clases ya existentes del drawer; el objetivo es que no quede ningún uso de `email` como no-nulo.)

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores. (Si queda alguno por `email` posiblemente nulo, aplicar `?? ""` / `?? "—"` en ese punto.)

- [ ] **Step 6: Lint**

Run: `npm run lint`
Expected: sin errores nuevos.

- [ ] **Step 7: Commit**

```bash
git add src/app/(admin)/usuarios/types.ts "src/app/(admin)/usuarios/page.tsx" src/app/(admin)/usuarios/UsersClient.tsx src/app/(admin)/usuarios/UserDetailDrawer.tsx
git commit -m "feat(usuarios): UserRow con documento/socio y correo opcional"
```

---

## Task 3: Login backend — aceptar correo o documento

**Files:**
- Modify: `src/app/api/auth/login/route.ts`

- [ ] **Step 1: Resolver el identificador (correo o documento)**

En `src/app/api/auth/login/route.ts`:

(a) Cambiar el mensaje genérico (línea 8):

```ts
const GENERIC_ERROR = "Correo/documento o contraseña incorrectos.";
```

(b) Reemplazar el bloque de parseo y búsqueda del usuario (desde `const { email, password } = ...` hasta el `const user = await prisma.user.findUnique(...)`, líneas ≈ 79-95) por:

```ts
  const { identifier, email, password } =
    typeof body === "object" && body !== null
      ? (body as { identifier?: unknown; email?: unknown; password?: unknown })
      : {};

  // Compat: clientes viejos podían enviar `email`; ahora preferimos `identifier`.
  const rawId = typeof identifier === "string" ? identifier : email;

  if (typeof rawId !== "string" || typeof password !== "string") {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
  }

  const id = rawId.trim();
  if (!id || !password) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
  }

  // Si parece correo (tiene "@") buscamos por email; si no, por número de
  // documento. findFirst en documento porque la unicidad es por (tipo+número).
  const user = id.includes("@")
    ? await prisma.user.findUnique({ where: { email: id.toLowerCase() } })
    : await prisma.user.findFirst({
        where: { numeroDocumento: id.replace(/\s+/g, "") },
      });
```

El resto del handler (dummy-hash, `if (!user || !user.active)`, `verifyPassword`, creación de sesión) queda igual.

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sin errores.

- [ ] **Step 3: Verificación manual (con un usuario que ya tenga documento; o tras Task 7)**

Con el server corriendo (`npm run dev`), probar por correo y por documento:

```bash
curl -s -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d "{\"identifier\":\"correo@existente\",\"password\":\"<clave>\"}" -i | findstr HTTP
curl -s -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d "{\"identifier\":\"12345678\",\"password\":\"<clave>\"}" -i | findstr HTTP
```
Expected: `200` con credenciales válidas; `401` con credenciales inválidas.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/auth/login/route.ts"
git commit -m "feat(auth): login por correo o numero de documento"
```

---

## Task 4: Login UI — campo "Correo o número de documento"

**Files:**
- Modify: `src/app/login/LoginForm.tsx`

- [ ] **Step 1: Renombrar el estado y el campo**

En `src/app/login/LoginForm.tsx`:

(a) Cambiar el estado `email` por `identifier`:

```tsx
  const [identifier, setIdentifier] = useState("");
```

(b) En el `submit`, enviar `identifier`:

```tsx
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });
```

(c) Reemplazar el campo de correo por uno de identificador (label, id, tipo, icono y `autoComplete="username"`):

```tsx
      <div className="login__field">
        <label className="login__label" htmlFor="login-id">
          Correo o número de documento
        </label>
        <div className="login__input">
          <Icon name="user" size={18} className="login__input-icon" />
          <input
            id="login-id"
            type="text"
            autoComplete="username"
            required
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="correo@ejemplo.com o 12345678"
            autoFocus
          />
        </div>
      </div>
```

(d) En el `disabled` del botón submit, cambiar `!email` por `!identifier`.

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sin errores.

- [ ] **Step 3: Verificación visual (Playwright o navegador)**

Cargar `http://localhost:3000/login`, confirmar el campo "Correo o número de documento". Iniciar sesión con un correo válido → entra. Cerrar sesión, iniciar con el número de documento del mismo usuario → entra.

- [ ] **Step 4: Commit**

```bash
git add src/app/login/LoginForm.tsx
git commit -m "feat(login): campo unico correo o documento"
```

---

## Task 5: Acción de búsqueda de socios para el selector

**Files:**
- Modify: `src/app/(admin)/usuarios/actions.ts`
- Modify: `src/app/(admin)/usuarios/types.ts`

- [ ] **Step 1: Tipo del resultado del selector**

En `src/app/(admin)/usuarios/types.ts`, agregar:

```ts
export type LinkableSocio = {
  id: string;
  codigo: string;
  tipoDocumento: import("@/generated/prisma/client").TipoDocumento;
  numeroDocumento: string;
  nombreCompleto: string;
  email: string | null;
};
```

- [ ] **Step 2: Acción `searchLinkableSocios`**

En `src/app/(admin)/usuarios/actions.ts`, añadir el import y la acción (al final del archivo):

```ts
import { normalizeToken } from "@/lib/socios/normalize";
import type { LinkableSocio } from "./types";

/* ───────────────────── búsqueda de socios vinculables ───────────────────── */

export async function searchLinkableSocios(
  q: string,
): Promise<ActionResult<LinkableSocio[]>> {
  try {
    await authorize("users.write");
    const tokens = (q ?? "")
      .split(/\s+/)
      .filter((t) => t.length > 0)
      .map(normalizeToken);
    if (tokens.length === 0) return ok([]);

    const rows = await prisma.socio.findMany({
      where: {
        userId: null, // solo socios sin cuenta aún
        estado: "activo",
        AND: tokens.map((t) => ({ searchKey: { contains: t } })),
      },
      take: 8,
      orderBy: [{ apellidoPaterno: "asc" }, { nombres: "asc" }],
      select: {
        id: true,
        codigo: true,
        tipoDocumento: true,
        numeroDocumento: true,
        apellidoPaterno: true,
        apellidoMaterno: true,
        nombres: true,
        email: true,
      },
    });

    return ok(
      rows.map((s) => ({
        id: s.id,
        codigo: s.codigo,
        tipoDocumento: s.tipoDocumento,
        numeroDocumento: s.numeroDocumento,
        nombreCompleto: [s.apellidoPaterno, s.apellidoMaterno, s.nombres]
          .filter(Boolean)
          .join(" "),
        email: s.email,
      })),
    );
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("searchLinkableSocios", e);
    return fail("No se pudo buscar en el padrón.");
  }
}
```

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/app/(admin)/usuarios/actions.ts src/app/(admin)/usuarios/types.ts
git commit -m "feat(usuarios): accion searchLinkableSocios"
```

---

## Task 6: `createUser` — modos comerciante/staff + documento + correo opcional

**Files:**
- Modify: `src/app/(admin)/usuarios/actions.ts` (tipo `CreateInput` y función `createUser`, líneas ≈ 90-174)

- [ ] **Step 1: Reescribir el tipo de entrada y `createUser`**

Reemplazar el bloque `type CreateInput = {...}` y toda la función `createUser` por:

```ts
import {
  validateNumeroDocumento,
  normalizeNumeroDocumento,
} from "@/lib/socios/document";
import type { TipoDocumento } from "@/generated/prisma/client";

type CreateStaffInput = {
  mode: "staff";
  name: string;
  tipoDocumento: TipoDocumento;
  numeroDocumento: string;
  email?: string;
  password: string;
  roleIds: string[];
};
type CreateSocioInput = {
  mode: "socio";
  socioId: string;
  password: string;
  roleIds: string[];
};
type CreateInput = CreateStaffInput | CreateSocioInput;

async function checkRolePermissions(
  me: CurrentUser,
  roleIds: string[],
): Promise<string | null> {
  if (roleIds.length === 0) return null;
  if (!me.permissions.has("users.assign-roles")) {
    return "No tienes permiso para asignar roles. Crea el usuario sin roles o pide el permiso correspondiente.";
  }
  const found = await prisma.role.findMany({
    where: { id: { in: roleIds } },
    select: { id: true, key: true },
  });
  if (found.length !== roleIds.length) return "Uno de los roles seleccionados no existe.";
  const grantsSuper = found.some((r) => r.key === SUPERADMIN_KEY);
  if (grantsSuper && !meIsSuper(me)) {
    return "Solo un superadministrador puede otorgar el rol Superadministrador.";
  }
  return null;
}

export async function createUser(
  input: CreateInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const me = await authorize("users.write");
    const password = input.password ?? "";
    const roleIds = dedupe(input.roleIds);

    if (password.length < PASSWORD_MIN)
      return fail("Revisa los campos marcados.", {
        password: `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres.`,
      });
    if (password.length > PASSWORD_MAX)
      return fail("Revisa los campos marcados.", {
        password: "Contraseña demasiado larga.",
      });

    const roleErr = await checkRolePermissions(me, roleIds);
    if (roleErr) return fail(roleErr);

    const passwordHash = await hashPassword(password);

    // ───────── Modo comerciante: vincular a un socio del padrón ─────────
    if (input.mode === "socio") {
      try {
        const result = await prisma.$transaction(async (tx) => {
          const socio = await tx.socio.findUnique({
            where: { id: input.socioId },
            select: {
              id: true,
              userId: true,
              estado: true,
              tipoDocumento: true,
              numeroDocumento: true,
              email: true,
              apellidoPaterno: true,
              apellidoMaterno: true,
              nombres: true,
            },
          });
          if (!socio) return { err: "El socio seleccionado no existe." as const };
          if (socio.userId)
            return { err: "Ese socio ya tiene una cuenta de usuario." as const };
          if (socio.estado !== "activo")
            return { err: "Solo se puede dar acceso a socios activos." as const };

          const name = [socio.apellidoPaterno, socio.apellidoMaterno, socio.nombres]
            .filter(Boolean)
            .join(" ");

          const created = await tx.user.create({
            data: {
              name,
              email: socio.email ?? null,
              tipoDocumento: socio.tipoDocumento,
              numeroDocumento: socio.numeroDocumento,
              passwordHash,
              roles: { create: roleIds.map((roleId) => ({ roleId })) },
            },
          });
          await tx.socio.update({
            where: { id: socio.id },
            data: { userId: created.id, portalEnabled: true },
          });
          return { id: created.id };
        });

        if ("err" in result) return fail(result.err);
        refresh();
        return ok({ id: result.id });
      } catch (e) {
        if (isP2002(e)) {
          return fail(
            "Ese documento o correo ya pertenece a otro usuario.",
            { numeroDocumento: "Documento o correo en uso." },
          );
        }
        throw e;
      }
    }

    // ───────── Modo staff: documento manual, correo opcional ─────────
    const name = (input.name ?? "").trim();
    const numero = (input.numeroDocumento ?? "").trim();
    const email =
      input.email && input.email.trim() !== ""
        ? input.email.trim().toLowerCase()
        : null;

    const fieldErrors: Record<string, string> = {};
    if (name.length < NAME_MIN) fieldErrors.name = "El nombre es obligatorio.";
    else if (name.length > NAME_MAX) fieldErrors.name = `Máximo ${NAME_MAX} caracteres.`;
    if (!numero) fieldErrors.numeroDocumento = "Número de documento requerido.";
    else if (!validateNumeroDocumento(input.tipoDocumento, numero))
      fieldErrors.numeroDocumento = "Formato inválido para el tipo de documento.";
    if (email && !EMAIL_RE.test(email)) fieldErrors.email = "Correo no válido.";
    if (Object.keys(fieldErrors).length > 0)
      return fail("Revisa los campos marcados.", fieldErrors);

    try {
      const created = await prisma.user.create({
        data: {
          name,
          email,
          tipoDocumento: input.tipoDocumento,
          numeroDocumento: normalizeNumeroDocumento(input.tipoDocumento, numero),
          passwordHash,
          roles: { create: roleIds.map((roleId) => ({ roleId })) },
        },
      });
      refresh();
      return ok({ id: created.id });
    } catch (e) {
      if (isP2002(e)) {
        const target = (e as Prisma.PrismaClientKnownRequestError).meta
          ?.target as string[] | undefined;
        if (target?.includes("email"))
          return fail("Ya existe un usuario con ese correo.", { email: "Correo en uso." });
        return fail("Ya existe un usuario con ese documento.", {
          numeroDocumento: "Documento en uso.",
        });
      }
      throw e;
    }
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("createUser", e);
    return fail("No se pudo crear el usuario.");
  }
}
```

(Reusa las constantes existentes `NAME_MIN`, `NAME_MAX`, `PASSWORD_MIN`, `PASSWORD_MAX`, `EMAIL_RE`, `SUPERADMIN_KEY`, `meIsSuper`, `dedupe`, `refresh`, `isP2002` ya definidas en el archivo. Mueve los `import` al inicio del archivo junto a los demás.)

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: errores SOLO en `CreateUserModal.tsx`/`UsersClient.tsx` por el cambio de forma de `CreateInput` (se corrigen en la Task 7). Si hay errores en `actions.ts`, corregirlos aquí.

- [ ] **Step 3: Commit**

```bash
git add src/app/(admin)/usuarios/actions.ts
git commit -m "feat(usuarios): createUser con modos socio/staff y documento"
```

---

## Task 7: `CreateUserModal` — modos comerciante/staff + selector de socio

**Files:**
- Modify: `src/app/(admin)/usuarios/CreateUserModal.tsx` (reescritura)
- Modify: `src/app/(admin)/usuarios/UsersClient.tsx` (tipo del `onSubmit`)

- [ ] **Step 1: Reescribir el modal**

Reemplazar el contenido de `src/app/(admin)/usuarios/CreateUserModal.tsx` por:

```tsx
"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { TipoDocumento } from "@/generated/prisma/client";
import { Icon } from "@/components/admin/Icon";
import { useEscClose } from "@/lib/ui/useEscClose";
import { DocumentoInput } from "../socios/DocumentoInput";
import { RolePicker } from "./RolePicker";
import { searchLinkableSocios } from "./actions";
import type { ActionResult, LinkableSocio, RoleOption } from "./types";

type CreateInput =
  | {
      mode: "staff";
      name: string;
      tipoDocumento: TipoDocumento;
      numeroDocumento: string;
      email?: string;
      password: string;
      roleIds: string[];
    }
  | { mode: "socio"; socioId: string; password: string; roleIds: string[] };

type Props = {
  roles: RoleOption[];
  onClose: () => void;
  onSubmit: (input: CreateInput) => Promise<ActionResult<{ id: string }>>;
};

export function CreateUserModal({ roles, onClose, onSubmit }: Props) {
  const [mode, setMode] = useState<"socio" | "staff">("socio");
  const [password, setPassword] = useState("");
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<string, string>>>({});
  const [topError, setTopError] = useState<string | null>(null);

  // staff
  const [name, setName] = useState("");
  const [tipo, setTipo] = useState<TipoDocumento>("DNI");
  const [numero, setNumero] = useState("");
  const [email, setEmail] = useState("");

  // socio picker
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LinkableSocio[]>([]);
  const [picked, setPicked] = useState<LinkableSocio | null>(null);
  const searchSeq = useRef(0);

  useEscClose(true, onClose, submitting);

  useEffect(() => {
    if (mode !== "socio" || picked || query.trim().length < 2) {
      setResults([]);
      return;
    }
    const seq = ++searchSeq.current;
    const t = setTimeout(async () => {
      const res = await searchLinkableSocios(query.trim());
      if (seq !== searchSeq.current) return; // descarta respuestas viejas
      setResults(res.ok ? (res.data ?? []) : []);
    }, 250);
    return () => clearTimeout(t);
  }, [query, mode, picked]);

  const validSocio = !!picked && password.length >= 6;
  const validStaff =
    name.trim().length >= 2 && numero.trim().length > 0 && password.length >= 6;
  const valid = mode === "socio" ? validSocio : validStaff;

  const onSubmitForm = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid || submitting) return;
    setSubmitting(true);
    setTopError(null);
    setFieldErrors({});
    const input: CreateInput =
      mode === "socio"
        ? { mode: "socio", socioId: picked!.id, password, roleIds }
        : {
            mode: "staff",
            name: name.trim(),
            tipoDocumento: tipo,
            numeroDocumento: numero.trim(),
            email: email.trim() || undefined,
            password,
            roleIds,
          };
    const res = await onSubmit(input);
    if (!res.ok) {
      setTopError(res.error ?? "No se pudo crear el usuario.");
      setFieldErrors(res.fieldErrors ?? {});
      setSubmitting(false);
      return;
    }
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={onSubmitForm}>
        <header className="modal__head">
          <h2>Crear usuario</h2>
          <button type="button" className="iconbtn" onClick={onClose} aria-label="Cerrar">
            <Icon name="close" size={20} />
          </button>
        </header>
        <div className="modal__body">
          <div className="page__tabs" style={{ marginBottom: 16 }}>
            <button
              type="button"
              className={`tab ${mode === "socio" ? "is-active" : ""}`}
              onClick={() => setMode("socio")}
            >
              Comerciante (socio)
            </button>
            <button
              type="button"
              className={`tab ${mode === "staff" ? "is-active" : ""}`}
              onClick={() => setMode("staff")}
            >
              Personal (staff)
            </button>
          </div>

          {topError && (
            <div className="login__error" role="alert" style={{ marginBottom: 16 }}>
              <Icon name="info" size={16} />
              <span>{topError}</span>
            </div>
          )}

          {mode === "socio" ? (
            picked ? (
              <div className="field">
                <span className="field__label">Socio seleccionado</span>
                <div className="banner">
                  <div className="banner__icon"><Icon name="user" size={18} /></div>
                  <p>
                    <b>{picked.nombreCompleto}</b><br />
                    {picked.tipoDocumento} {picked.numeroDocumento} · {picked.codigo}
                    {picked.email ? ` · ${picked.email}` : ""}
                  </p>
                  <button
                    type="button"
                    className="banner__close"
                    onClick={() => { setPicked(null); setQuery(""); }}
                    aria-label="Cambiar socio"
                  >
                    <Icon name="close" size={16} />
                  </button>
                </div>
              </div>
            ) : (
              <label className="field">
                <span className="field__label">
                  Buscar socio en el padrón<span className="field__req">*</span>
                </span>
                <input
                  type="text"
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Nombre o número de documento"
                />
                {results.length > 0 && (
                  <div className="chip-popover" style={{ position: "static", marginTop: 6 }}>
                    {results.map((s) => (
                      <button
                        type="button"
                        key={s.id}
                        className="chip-popover__opt"
                        onClick={() => { setPicked(s); setResults([]); }}
                      >
                        {s.nombreCompleto} — {s.tipoDocumento} {s.numeroDocumento}
                      </button>
                    ))}
                  </div>
                )}
                {query.trim().length >= 2 && results.length === 0 && (
                  <span style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 4 }}>
                    Sin socios activos sin cuenta para esa búsqueda.
                  </span>
                )}
              </label>
            )
          ) : (
            <>
              <label className="field">
                <span className="field__label">
                  Nombre completo<span className="field__req">*</span>
                </span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="p. ej. María Salas Yáñez"
                  aria-invalid={!!fieldErrors.name}
                />
                {fieldErrors.name && (
                  <span style={{ color: "#b91c1c", fontSize: 12, marginTop: 4 }}>{fieldErrors.name}</span>
                )}
              </label>
              <DocumentoInput
                tipo={tipo}
                numero={numero}
                onChange={(t, n) => { setTipo(t); setNumero(n); }}
                fieldErrors={fieldErrors}
                disabled={submitting}
              />
              <label className="field">
                <span className="field__label">Correo (opcional)</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="correo@ejemplo.com"
                  aria-invalid={!!fieldErrors.email}
                />
                {fieldErrors.email && (
                  <span style={{ color: "#b91c1c", fontSize: 12, marginTop: 4 }}>{fieldErrors.email}</span>
                )}
              </label>
            </>
          )}

          <label className="field">
            <span className="field__label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Contraseña inicial<span className="field__req">*</span></span>
              <button type="button" className="linkbtn" onClick={() => setShowPassword((v) => !v)} style={{ padding: "2px 6px", fontSize: 11.5 }}>
                {showPassword ? "Ocultar" : "Mostrar"}
              </button>
            </span>
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="mínimo 6 caracteres"
              aria-invalid={!!fieldErrors.password}
              autoComplete="new-password"
            />
            {fieldErrors.password && (
              <span style={{ color: "#b91c1c", fontSize: 12, marginTop: 4 }}>{fieldErrors.password}</span>
            )}
          </label>

          <div style={{ marginTop: 8 }}>
            <div className="field__label" style={{ marginBottom: 8 }}>Roles asignados</div>
            <RolePicker roles={roles} selected={roleIds} onChange={setRoleIds} disabled={submitting} />
          </div>
        </div>
        <footer className="modal__foot">
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary" disabled={!valid || submitting}>
            {submitting ? "Creando…" : "Crear usuario"}
          </button>
        </footer>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Ajustar el tipo del `onSubmit` en `UsersClient.tsx`**

El `createUser` ya acepta el nuevo `CreateInput` (Task 6). En `UsersClient.tsx` el `onSubmit` del modal solo reenvía `input` a `createUser`, así que el tipo se infiere. Verificar que el bloque `<CreateUserModal ... onSubmit={...}>` (editado en Task 2, Step 3) siga compilando.

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sin errores.

- [ ] **Step 4: Verificación manual (Playwright o navegador)**

En `http://localhost:3000/usuarios` → "Crear usuario":
1. Modo **Personal (staff)**: nombre + DNI + (sin correo) + contraseña → crea. Aparece en la tabla con el documento.
2. Modo **Comerciante (socio)**: buscar un socio activo sin cuenta, seleccionarlo, poner contraseña → crea. Verificar en `/socios` que ese socio quedó con cuenta (portalEnabled) y que el usuario tiene su documento.
3. Iniciar sesión con el documento del comerciante creado → entra (cierra la Task 3).

- [ ] **Step 5: Commit**

```bash
git add src/app/(admin)/usuarios/CreateUserModal.tsx src/app/(admin)/usuarios/UsersClient.tsx
git commit -m "feat(usuarios): modal con modos comerciante/staff y selector de padron"
```

---

## Task 8: Re-sincronizar el documento del usuario al editar el socio

**Files:**
- Modify: `src/app/(admin)/socios/actions.ts` (`updateSocio`, líneas ≈ 618-707)

- [ ] **Step 1: Cargar `userId` y sincronizar dentro de una transacción**

En `updateSocio`:

(a) Agregar `userId: true` al `select` del `existing` (≈ línea 626-633).

(b) Reemplazar el bloque que hace `await prisma.socio.update({ where: { id }, data });` (dentro del `try`, ≈ líneas 690-699) por una transacción que, además, propaga el documento al usuario vinculado si cambió:

```ts
    try {
      await prisma.$transaction(async (tx) => {
        await tx.socio.update({ where: { id }, data });
        const docCambia =
          normalized.tipoDocumento !== undefined ||
          normalized.numeroDocumento !== undefined;
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
      });
    } catch (e) {
      if (isP2002(e)) {
        return fail("Ya existe un socio con ese documento.", {
          numeroDocumento: "Documento en uso.",
        });
      }
      throw e;
    }
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sin errores.

- [ ] **Step 3: Verificación manual**

Editar el documento de un socio que tenga cuenta vinculada → el usuario correspondiente queda con el documento nuevo (verificar en `/usuarios` y probando login por el nuevo número).

- [ ] **Step 4: Commit**

```bash
git add src/app/(admin)/socios/actions.ts
git commit -m "feat(socios): sincroniza documento del usuario vinculado al editar"
```

---

## Task 9: Verificación end-to-end y cierre

**Files:** ninguno (solo verificación; arreglos puntuales si aparecen)

- [ ] **Step 1: Typecheck + lint + build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: build sin errores.

- [ ] **Step 2: Recorrido funcional completo (Playwright o navegador)**

- Login por correo y por documento (usuario staff y comerciante).
- Crear usuario staff (sin correo) y comerciante (vinculado a socio).
- Intentar vincular un socio ya vinculado → error claro.
- Crear staff con documento duplicado → error claro.
- Editar documento de socio vinculado → login por el nuevo número funciona.
- `/socios` de un socio con varios puestos sigue mostrando sus asignaciones (requisito 3, sin cambios).

- [ ] **Step 3: Commit de arreglos (si hubo)**

```bash
git add -A
git commit -m "fix(usuarios): ajustes tras verificacion e2e"
```

---

## Cobertura del spec (self-review)

- **Login por correo o documento** → Tasks 1 (esquema), 3 (backend), 4 (UI). ✅
- **Crear usuario vinculado al padrón** → Tasks 5 (búsqueda), 6 (acción), 7 (UI). ✅
- **Correo opcional / documento universal** → Tasks 1, 2, 6, 7. ✅
- **Sincronización (Enfoque A)** → Task 8. ✅
- **Socio → N puestos** → ya implementado; verificado en Task 9. ✅
- **Seguridad conservada** (scrypt, rate-limit, dummy-hash, guardas de superadmin) → sin cambios en Tasks 3 y 6. ✅
