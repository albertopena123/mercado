# Formulario público de datos `/formulario` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Un formulario público (sin login) en `/formulario` para que socios ingresen DNI→autollenar nombre (apidatos)+celular+correo; crea un registro pendiente que el admin empareja con un socio existente y aprueba (regulariza DNI+contacto) o rechaza.

**Architecture:** Modelo nuevo `SolicitudRegistroPublico` (sin socioId hasta el match). Acciones públicas rate-limited. Bandeja admin con buscador de socio. La aprobación reutiliza `validateSocioInput`/`buildSocioUpdateData` y el patrón de transacción atómica de `aprobarSolicitud`.

**Tech Stack:** Next.js 16.2.6, React 19, Prisma 7 (Postgres), TypeScript. apidatos vía `lookupDniUnamad`.

## Global Constraints

- **Next 16:** server actions con `"use server"`; un módulo `"use server"` solo exporta funciones async. `headers()` es async (`await headers()`).
- **Sin test runner:** gates = `tsc` filtrado + `eslint` + `prisma/verify-*.ts` + `next build`.
  - tsc filtrado (ignora ~35 errores stale de `.next/`): `npx tsc --noEmit 2>&1 | grep -vE "^\.next[\\/]" | grep "error TS"` debe salir vacío.
- **No auto-commit por el agente** salvo dentro del flujo SDD en la rama `feat/portal-actualizar-datos-dni`. Cada tarea cierra con gate tsc+lint.
- **Público = sin auth pero rate-limited:** las acciones de `/formulario` NO autorizan usuario, pero aplican rate-limit por IP y guardan la IP. Solo escriben en `SolicitudRegistroPublico`; NUNCA tocan el padrón.
- **Admin = `socios.write`** para listar/aprobar/rechazar/contar y para el buscador de match.
- **Reusa:** enum `EstadoSolicitudActualizacion`; `validateSocioInput`/`buildSocioUpdateData` de `@/lib/socios/update`; `lookupDniUnamad` de `@/lib/socios/dni-lookup`; `ActionResult`/`CreateSocioInput` de `@/app/(admin)/socios/types`.
- **Aprobar aplica al socio emparejado SOLO:** `numeroDocumento`(DNI)+`tipoDocumento`(DNI)+`telefono`+`email`. NO el nombre (el padrón conserva el suyo).

---

## File Structure

**Crear:** `src/lib/rate-limit.ts`; `prisma/migrations/<ts>_registro_publico/migration.sql`; `src/app/formulario/{page.tsx,FormularioPublico.tsx,actions.ts,formulario.css}`; `src/app/(admin)/socios/registros/{page.tsx,RegistrosList.tsx,actions.ts}`; `prisma/verify-registros.ts`.
**Modificar:** `prisma/schema.prisma` (modelo + relaciones inversas); `src/app/(admin)/socios/page.tsx` + `SociosClient.tsx` (chip "Registros").

---

## Task 1: Modelo `SolicitudRegistroPublico` + migración

**Files:** Modify `prisma/schema.prisma`; Create `prisma/migrations/20260621020000_registro_publico/migration.sql`.

**Interfaces:** Produces tabla `SolicitudRegistroPublico` + `prisma.solicitudRegistroPublico`.

- [ ] **Step 1: Añadir el modelo al schema** (tras `SolicitudActualizacionDatos`):

```prisma
model SolicitudRegistroPublico {
  id              String        @id @default(cuid())
  tipoDocumento   TipoDocumento @default(DNI)
  numeroDocumento String
  nombreCompleto  String
  telefono        String
  email           String?
  estado          EstadoSolicitudActualizacion @default(pendiente)
  socioVinculadoId String?
  motivoRechazo   String?
  ip              String?
  creadoEn        DateTime  @default(now())
  revisadoPorId   String?
  revisadoEn      DateTime?

  socioVinculado Socio? @relation("RegistroPublicoSocio", fields: [socioVinculadoId], references: [id], onDelete: SetNull)
  revisadoPor    User?  @relation("RegistroPublicoRevisor", fields: [revisadoPorId], references: [id], onDelete: SetNull)

  @@index([estado])
  @@index([numeroDocumento])
}
```

- [ ] **Step 2: Relaciones inversas.** En `model Socio` (junto a `solicitudesActualizacion`): `registrosPublicos SolicitudRegistroPublico[] @relation("RegistroPublicoSocio")`. En `model User` (junto a `solicitudesRevisadas`): `registrosPublicosRevisados SolicitudRegistroPublico[] @relation("RegistroPublicoRevisor")`.

- [ ] **Step 3: Migración hand-written** `prisma/migrations/20260621020000_registro_publico/migration.sql`:

```sql
-- CreateTable
CREATE TABLE "SolicitudRegistroPublico" (
    "id" TEXT NOT NULL,
    "tipoDocumento" "TipoDocumento" NOT NULL DEFAULT 'DNI',
    "numeroDocumento" TEXT NOT NULL,
    "nombreCompleto" TEXT NOT NULL,
    "telefono" TEXT NOT NULL,
    "email" TEXT,
    "estado" "EstadoSolicitudActualizacion" NOT NULL DEFAULT 'pendiente',
    "socioVinculadoId" TEXT,
    "motivoRechazo" TEXT,
    "ip" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revisadoPorId" TEXT,
    "revisadoEn" TIMESTAMP(3),

    CONSTRAINT "SolicitudRegistroPublico_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SolicitudRegistroPublico_estado_idx" ON "SolicitudRegistroPublico"("estado");
CREATE INDEX "SolicitudRegistroPublico_numeroDocumento_idx" ON "SolicitudRegistroPublico"("numeroDocumento");

-- AddForeignKey
ALTER TABLE "SolicitudRegistroPublico" ADD CONSTRAINT "SolicitudRegistroPublico_socioVinculadoId_fkey" FOREIGN KEY ("socioVinculadoId") REFERENCES "Socio"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SolicitudRegistroPublico" ADD CONSTRAINT "SolicitudRegistroPublico_revisadoPorId_fkey" FOREIGN KEY ("revisadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Máximo UNA pendiente por DNI.
CREATE UNIQUE INDEX "RegistroPublico_unico_pendiente_por_doc"
  ON "SolicitudRegistroPublico"("numeroDocumento")
  WHERE estado = 'pendiente';
```

- [ ] **Step 4: Aplicar** (controller, fuera del subagente por el classifier de BD): `npx prisma migrate deploy` + `npx prisma generate`. Verificar `migrate status` = up to date.
- [ ] **Step 5: Gate** `npx tsc --noEmit 2>&1 | grep -vE "^\.next[\\/]" | grep "error TS"` vacío.

---

## Task 2: Helper compartido de rate-limit

**Files:** Create `src/lib/rate-limit.ts`.

**Interfaces:** Produces `rateCheck(key,max,windowMs): {allowed,retryAfter}` y `getClientIp(): Promise<string>`.

- [ ] **Step 1:** Crear `src/lib/rate-limit.ts` (extraído del patrón del login, sin acoplar a NextResponse):

```ts
import "server-only";
import { headers } from "next/headers";

// Ventana deslizante en memoria (por proceso). Suficiente para una instancia;
// en multi-instancia conviene Redis. Mismo patrón que el login.
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function rateCheck(
  key: string,
  max: number,
  windowMs: number,
): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (v.resetAt < now) buckets.delete(k);
  }
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }
  if (b.count >= max) {
    return { allowed: false, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
  }
  b.count++;
  return { allowed: true, retryAfter: 0 };
}

export async function getClientIp(): Promise<string> {
  const h = await headers();
  const real = h.get("x-real-ip");
  if (real) return real.trim();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return "unknown";
}
```

- [ ] **Step 2: Gate** tsc filtrado vacío + `npm run lint` limpio.

---

## Task 3: Acciones públicas (lookup + enviar)

**Files:** Create `src/app/formulario/actions.ts`.

**Interfaces:**
- `lookupDniPublico(dni): Promise<{ok:true;nombre:string}|{ok:false;error:string}>`
- `enviarRegistroPublico(input: RegistroPublicoInput): Promise<{ok:true}|{ok:false;error:string;fieldErrors?:Record<string,string>}>`
- `type RegistroPublicoInput = { numeroDocumento:string; nombreCompleto:string; telefono:string; email?:string }`

- [ ] **Step 1:** Crear `src/app/formulario/actions.ts`:

```ts
"use server";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { lookupDniUnamad } from "@/lib/socios/dni-lookup";
import { rateCheck, getClientIp } from "@/lib/rate-limit";

const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export type RegistroPublicoInput = {
  numeroDocumento: string;
  nombreCompleto: string;
  telefono: string;
  email?: string;
};

export async function lookupDniPublico(
  dni: string,
): Promise<{ ok: true; nombre: string } | { ok: false; error: string }> {
  const ip = await getClientIp();
  const rl = rateCheck(`pub-dni:${ip}`, 15, 60_000);
  if (!rl.allowed)
    return { ok: false, error: `Demasiadas consultas. Reintenta en ${rl.retryAfter}s.` };

  const clean = (dni ?? "").trim();
  if (!/^\d{8}$/.test(clean))
    return { ok: false, error: "El DNI debe tener 8 dígitos." };

  try {
    const d = await lookupDniUnamad(clean);
    if (!d) return { ok: false, error: "No se encontró el DNI. Escribe tus nombres a mano." };
    const nombre = `${d.apellidoPaterno} ${d.apellidoMaterno}, ${d.nombres}`
      .replace(/\s+/g, " ")
      .replace(/\s+,/, ",")
      .trim();
    return { ok: true, nombre };
  } catch (e) {
    console.error("lookupDniPublico", e);
    return { ok: false, error: "No se pudo consultar el DNI. Escribe tus nombres a mano." };
  }
}

export async function enviarRegistroPublico(
  input: RegistroPublicoInput,
): Promise<{ ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> }> {
  const ip = await getClientIp();
  const rl = rateCheck(`pub-send:${ip}`, 5, 60_000);
  if (!rl.allowed)
    return { ok: false, error: `Demasiados envíos. Reintenta en ${rl.retryAfter}s.` };

  const fe: Record<string, string> = {};
  const numeroDocumento = (input.numeroDocumento ?? "").trim();
  const nombreCompleto = (input.nombreCompleto ?? "").trim();
  const telefono = (input.telefono ?? "").trim();
  const emailRaw = (input.email ?? "").trim();

  if (!/^\d{8}$/.test(numeroDocumento)) fe.numeroDocumento = "DNI inválido (8 dígitos).";
  if (nombreCompleto.length < 3) fe.nombreCompleto = "Escribe tus apellidos y nombres.";
  if (!/^\d{6,15}$/.test(telefono.replace(/\s/g, ""))) fe.telefono = "Celular inválido.";
  let email: string | null = null;
  if (emailRaw) {
    if (!EMAIL_RE.test(emailRaw.toLowerCase())) fe.email = "Correo no válido.";
    else email = emailRaw.toLowerCase();
  }
  if (Object.keys(fe).length > 0)
    return { ok: false, error: "Revisa los campos marcados.", fieldErrors: fe };

  const yaPendiente = await prisma.solicitudRegistroPublico.findFirst({
    where: { numeroDocumento, estado: "pendiente" },
    select: { id: true },
  });
  if (yaPendiente)
    return { ok: false, error: "Ya enviaste tus datos; están en revisión." };

  try {
    await prisma.solicitudRegistroPublico.create({
      data: {
        tipoDocumento: "DNI",
        numeroDocumento,
        nombreCompleto,
        telefono: telefono.replace(/\s/g, ""),
        email,
        ip,
      },
    });
    return { ok: true };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return { ok: false, error: "Ya enviaste tus datos; están en revisión." };
    console.error("enviarRegistroPublico", e);
    return { ok: false, error: "No se pudo enviar. Intenta de nuevo." };
  }
}
```

- [ ] **Step 2: Gate** tsc filtrado vacío + lint limpio.

---

## Task 4: Página pública `/formulario`

**Files:** Create `src/app/formulario/page.tsx`, `src/app/formulario/FormularioPublico.tsx`, `src/app/formulario/formulario.css`.

- [ ] **Step 1:** `page.tsx` (server, público):

```tsx
import "./formulario.css";
import { FormularioPublico } from "./FormularioPublico";

export const metadata = { title: "Actualiza tus datos · Gran Feria Mayorista Internacional" };
export const dynamic = "force-dynamic";

export default function FormularioPage() {
  return (
    <main className="fp-wrap">
      <div className="fp-card">
        <h1 className="fp-title">Actualiza tus datos</h1>
        <p className="fp-sub">
          Socios de la Gran Feria Mayorista: ingresa tu DNI, celular y correo.
          La administración revisará y actualizará tu registro.
        </p>
        <FormularioPublico />
      </div>
    </main>
  );
}
```

- [ ] **Step 2:** `FormularioPublico.tsx` (client) — DNI debounced lookup (autollena nombre editable), celular, correo, envío, pantalla de gracias, feedback inline (sin toast):

```tsx
"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { lookupDniPublico, enviarRegistroPublico } from "./actions";

export function FormularioPublico() {
  const [dni, setDni] = useState("");
  const [nombre, setNombre] = useState("");
  const [celular, setCelular] = useState("");
  const [correo, setCorreo] = useState("");
  const [fe, setFe] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [dniState, setDniState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [enviado, setEnviado] = useState(false);
  const [sending, startSend] = useTransition();
  const [, startLookup] = useTransition();
  const reqIdRef = useRef(0);
  const lookedRef = useRef("");
  const autoNombreRef = useRef("");

  useEffect(() => {
    const d = dni.trim();
    if (!/^\d{8}$/.test(d)) { setDniState("idle"); return; }
    if (d === lookedRef.current) return;
    const id = ++reqIdRef.current;
    setDniState("loading");
    const t = setTimeout(() => {
      startLookup(async () => {
        const res = await lookupDniPublico(d);
        if (id !== reqIdRef.current) return;
        if (!res.ok) { setDniState("error"); return; }
        lookedRef.current = d;
        setDniState("ok");
        // Solo autollenar si el usuario no escribió su propio nombre.
        setNombre((cur) => (cur === "" || cur === autoNombreRef.current ? res.nombre : cur));
        autoNombreRef.current = res.nombre;
      });
    }, 450);
    return () => clearTimeout(t);
  }, [dni]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (sending) return;
    setFe({}); setMsg(null);
    startSend(async () => {
      const res = await enviarRegistroPublico({
        numeroDocumento: dni,
        nombreCompleto: nombre,
        telefono: celular,
        email: correo || undefined,
      });
      if (!res.ok) {
        setMsg(res.error);
        if (res.fieldErrors) setFe(res.fieldErrors);
        return;
      }
      setEnviado(true);
    });
  }

  if (enviado) {
    return (
      <div className="fp-done">
        <div className="fp-check">✓</div>
        <h2>¡Gracias!</h2>
        <p>Tus datos fueron enviados. La administración los revisará y actualizará tu registro.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="fp-form">
      <label className="fp-field">
        <span>DNI</span>
        <input inputMode="numeric" maxLength={8} value={dni}
          onChange={(e) => setDni(e.target.value.replace(/\D/g, ""))}
          aria-invalid={!!fe.numeroDocumento} placeholder="8 dígitos" disabled={sending} />
        {dniState === "loading" && <small className="fp-hint">Consultando…</small>}
        {dniState === "ok" && <small className="fp-hint fp-hint--ok">Datos encontrados. Revisa tu nombre.</small>}
        {dniState === "error" && <small className="fp-hint">No se encontró; escribe tu nombre a mano.</small>}
        {fe.numeroDocumento && <small className="fp-err">{fe.numeroDocumento}</small>}
      </label>

      <label className="fp-field">
        <span>Apellidos y nombres</span>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)}
          aria-invalid={!!fe.nombreCompleto} disabled={sending} />
        {fe.nombreCompleto && <small className="fp-err">{fe.nombreCompleto}</small>}
      </label>

      <label className="fp-field">
        <span>Celular</span>
        <input inputMode="numeric" value={celular}
          onChange={(e) => setCelular(e.target.value)} aria-invalid={!!fe.telefono}
          placeholder="9XX XXX XXX" disabled={sending} />
        {fe.telefono && <small className="fp-err">{fe.telefono}</small>}
      </label>

      <label className="fp-field">
        <span>Correo <em>(opcional)</em></span>
        <input type="email" inputMode="email" value={correo}
          onChange={(e) => setCorreo(e.target.value)} aria-invalid={!!fe.email} disabled={sending} />
        {fe.email && <small className="fp-err">{fe.email}</small>}
      </label>

      {msg && <p className="fp-msg">{msg}</p>}
      <button type="submit" className="fp-btn" disabled={sending}>
        {sending ? "Enviando…" : "Enviar"}
      </button>
    </form>
  );
}
```

- [ ] **Step 3:** `formulario.css` — tarjeta mobile-first centrada. Reglas mínimas para `fp-wrap, fp-card, fp-title, fp-sub, fp-form, fp-field, fp-hint, fp-hint--ok, fp-err, fp-msg, fp-btn, fp-done, fp-check`. Seguir el estilo visual del proyecto (variables/colores de `globals.css`). Mobile-first: ancho máx ~440px, padding cómodo, inputs grandes (font-size ≥16px para no hacer zoom en iOS).

- [ ] **Step 4: Gate** tsc filtrado vacío + lint limpio. Verificar visualmente en `/formulario`.

---

## Task 5: Acciones admin (listar, buscar, aprobar, rechazar, contar)

**Files:** Create `src/app/(admin)/socios/registros/actions.ts`.

**Interfaces:** `listRegistrosPublicos()`, `buscarSociosParaMatch(q)`, `aprobarRegistroPublico(id,socioId)`, `rechazarRegistroPublico(id,motivo)`, `contarRegistrosPublicos()`.

- [ ] **Step 1:** Crear el archivo (mismo patrón atómico que `solicitudes/actions.ts`):

```ts
"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/server";
import { validateSocioInput, buildSocioUpdateData } from "@/lib/socios/update";
import type { ActionResult, CreateSocioInput } from "@/app/(admin)/socios/types";

class RegistroYaResuelto extends Error {}

async function requireReview() {
  const u = await getCurrentUser();
  if (!u || !u.permissions.has("socios.write")) return null;
  return u;
}

export type RegistroPublicoRow = {
  id: string;
  numeroDocumento: string;
  nombreCompleto: string;
  telefono: string;
  email: string | null;
  creadoEn: string;
};

export async function listRegistrosPublicos(): Promise<ActionResult<RegistroPublicoRow[]>> {
  const me = await requireReview();
  if (!me) return { ok: false, error: "No tienes permisos para esta acción." };
  const rows = await prisma.solicitudRegistroPublico.findMany({
    where: { estado: "pendiente" },
    orderBy: { creadoEn: "asc" },
    select: { id: true, numeroDocumento: true, nombreCompleto: true, telefono: true, email: true, creadoEn: true },
  });
  return { ok: true, data: rows.map((r) => ({ ...r, creadoEn: r.creadoEn.toISOString() })) };
}

export type SocioMatch = { id: string; codigo: string; nombre: string; tipoDocumento: string; numeroDocumento: string };

export async function buscarSociosParaMatch(q: string): Promise<ActionResult<SocioMatch[]>> {
  const me = await requireReview();
  if (!me) return { ok: false, error: "No tienes permisos para esta acción." };
  const term = (q ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (term.length < 2) return { ok: true, data: [] };
  const rows = await prisma.socio.findMany({
    where: { searchKey: { contains: term } },
    orderBy: { apellidoPaterno: "asc" },
    take: 10,
    select: { id: true, codigo: true, apellidoPaterno: true, apellidoMaterno: true, nombres: true, tipoDocumento: true, numeroDocumento: true },
  });
  return {
    ok: true,
    data: rows.map((s) => ({
      id: s.id, codigo: s.codigo,
      nombre: `${s.apellidoPaterno} ${s.apellidoMaterno ?? ""}, ${s.nombres}`.replace(/\s+,/, ","),
      tipoDocumento: s.tipoDocumento, numeroDocumento: s.numeroDocumento,
    })),
  };
}

export async function aprobarRegistroPublico(id: string, socioId: string): Promise<ActionResult> {
  const me = await requireReview();
  if (!me) return { ok: false, error: "No tienes permisos para esta acción." };
  try {
    const reg = await prisma.solicitudRegistroPublico.findUnique({
      where: { id }, select: { id: true, estado: true, numeroDocumento: true, telefono: true, email: true },
    });
    if (!reg) return { ok: false, error: "Registro no encontrado." };
    if (reg.estado !== "pendiente") return { ok: false, error: "El registro ya fue resuelto." };
    if (!socioId) return { ok: false, error: "Selecciona el socio a emparejar." };

    const existing = await prisma.socio.findUnique({
      where: { id: socioId },
      select: { tipoDocumento: true, codigo: true, numeroPadron: true, numeroDocumento: true, apellidoPaterno: true, apellidoMaterno: true, nombres: true, userId: true },
    });
    if (!existing) return { ok: false, error: "Socio no encontrado." };

    const patch: Partial<CreateSocioInput> = {
      tipoDocumento: "DNI", numeroDocumento: reg.numeroDocumento, telefono: reg.telefono,
      ...(reg.email ? { email: reg.email } : {}),
    };
    const { fieldErrors, normalized } = validateSocioInput({ tipoDocumento: existing.tipoDocumento, ...patch }, false);
    if (Object.keys(fieldErrors).length > 0)
      return { ok: false, error: "Los datos del registro no son válidos.", fieldErrors };

    const { data, docCambia } = buildSocioUpdateData(normalized, existing);
    data.updatedBy = { connect: { id: me.id } };

    try {
      await prisma.$transaction(async (tx) => {
        const upd = await tx.solicitudRegistroPublico.updateMany({
          where: { id: reg.id, estado: "pendiente" },
          data: { estado: "aprobada", socioVinculadoId: socioId, revisadoPorId: me.id, revisadoEn: new Date() },
        });
        if (upd.count === 0) throw new RegistroYaResuelto();
        await tx.socio.update({ where: { id: socioId }, data });
        if (existing.userId && docCambia) {
          await tx.user.update({
            where: { id: existing.userId },
            data: { tipoDocumento: normalized.tipoDocumento ?? existing.tipoDocumento, numeroDocumento: normalized.numeroDocumento ?? existing.numeroDocumento },
          });
        }
      });
    } catch (e) {
      if (e instanceof RegistroYaResuelto) return { ok: false, error: "El registro ya fue resuelto." };
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
        return { ok: false, error: "Ese DNI ya está registrado en otro socio; no se aplicó." };
      throw e;
    }
    revalidatePath("/socios");
    revalidatePath("/socios/registros");
    return { ok: true };
  } catch (e) {
    console.error("aprobarRegistroPublico", e);
    return { ok: false, error: "No se pudo aprobar el registro." };
  }
}

export async function rechazarRegistroPublico(id: string, motivo: string): Promise<ActionResult> {
  const me = await requireReview();
  if (!me) return { ok: false, error: "No tienes permisos para esta acción." };
  const m = (motivo ?? "").trim();
  if (m.length < 5) return { ok: false, error: "Indica un motivo (mínimo 5 caracteres)." };
  const upd = await prisma.solicitudRegistroPublico.updateMany({
    where: { id, estado: "pendiente" },
    data: { estado: "rechazada", motivoRechazo: m, revisadoPorId: me.id, revisadoEn: new Date() },
  });
  if (upd.count === 0) return { ok: false, error: "El registro no existe o ya fue resuelto." };
  revalidatePath("/socios");
  revalidatePath("/socios/registros");
  return { ok: true };
}

export async function contarRegistrosPublicos(): Promise<number> {
  const me = await requireReview();
  if (!me) return 0;
  return prisma.solicitudRegistroPublico.count({ where: { estado: "pendiente" } });
}
```

- [ ] **Step 2: Gate** tsc filtrado vacío + lint limpio.

---

## Task 6: UI admin (bandeja + chip)

**Files:** Create `src/app/(admin)/socios/registros/page.tsx`, `RegistrosList.tsx`; Modify `src/app/(admin)/socios/page.tsx` + `SociosClient.tsx`.

- [ ] **Step 1:** `registros/page.tsx` (server, `await requirePermission("socios.write")`), lista `listRegistrosPublicos()`, renderiza `RegistrosList` o estado vacío. Reusar las clases reales del área admin (mirar `socios/solicitudes/page.tsx` ya creado como plantilla exacta — misma cabecera/empty/clases). Si añade estilos, en `socios.css` estilo `reg-*` siguiendo `sol-*`.

- [ ] **Step 2:** `RegistrosList.tsx` (client): por registro muestra DNI + nombreCompleto + celular + correo + **buscador de socio** (input → `buscarSociosParaMatch`, lista de resultados, seleccionar uno) → "Aprobar y aplicar" (llama `aprobarRegistroPublico(id, socioId)`) / "Rechazar" (motivo → `rechazarRegistroPublico`). `useToast`, `useTransition`, `router.refresh()`. Modelar el buscador con `useState` para el término + resultados + socio seleccionado por tarjeta; deshabilitar Aprobar hasta elegir socio. Seguir el patrón de `SolicitudesList.tsx`.

- [ ] **Step 3:** `socios/page.tsx`: añadir `contarRegistrosPublicos()` al `Promise.all` y pasar `registrosPublicos` a `SociosClient`. `SociosClient.tsx`: nueva prop `registrosPublicos?: number`; junto al chip de Solicitudes (ya gated en `perms.canWrite`), añadir `{perms.canWrite && <Link href="/socios/registros" className="btn btn--ghost">Registros {!!registrosPublicos && <span className="badge badge--amber">{registrosPublicos}</span>}</Link>}`.

- [ ] **Step 4: Gate** tsc filtrado vacío + lint limpio.

---

## Task 7: Verify + gates finales

**Files:** Create `prisma/verify-registros.ts`.

- [ ] **Step 1:** `prisma/verify-registros.ts` (patrón adapter-pg, como `verify-solicitudes.ts`): cuenta total/pendientes; invariante ≤1 pendiente por `numeroDocumento` (groupBy); verifica que exista el índice `RegistroPublico_unico_pendiente_por_doc` vía `$queryRaw` sobre `pg_indexes`.
- [ ] **Step 2: Gates** (controller): `npx tsx prisma/verify-registros.ts` (BD, sandbox); `npx tsc --noEmit` filtrado vacío; `npm run lint`; `npm run build`.
- [ ] **Step 3: Manual:** enviar desde `/formulario` (sin login) → aparece en `/socios/registros` → buscar y emparejar un socio SIN-DNI → Aprobar → el socio queda con DNI+celular+correo; reenviar mismo DNI → bloqueado; exceder rate-limit → 429 amigable.

---

## Self-Review
- §4 modelo+migración+índice parcial → Task 1. §5 rate-limit → Task 2. §6/§7 acciones públicas → Task 3; página → Task 4; acciones admin → Task 5; bandeja+chip → Task 6; verificación → Task 7. ✅
- Reusa `validateSocioInput`/`buildSocioUpdateData` (Task 5), enum existente, patrón atómico de `aprobarSolicitud`. ✅
- Riesgos: clases CSS admin (confirmar contra `solicitudes/*` ya creado); aplicar la migración requiere mano del controller por el classifier; `lookupDniUnamad` puede no traer un DNI (campo nombre editable lo cubre).
