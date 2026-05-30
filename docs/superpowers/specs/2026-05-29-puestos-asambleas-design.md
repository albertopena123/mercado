# Puestos y Asambleas — Spec de diseño

**Fecha:** 2026-05-29
**Estado:** aprobado (el usuario delegó la ejecución)
**Sub-proyectos:** #2 Puestos y #4 Asambleas de la suite "Gestión de asociación de mercado"

## Contexto

El padrón de socios (#1) ya está implementado. Estos dos sub-proyectos se construyen
encima reusando el design system y los patrones de `src/app/(admin)/socios/`
(server actions con `ActionResult`, drawer de detalle, búsqueda `searchKey`
accent-insensitive, stats cards, tabla ordenable, CSV export).

## Sub-proyecto #2 — Puestos

Catálogo físico del mercado + relación Socio → 1:N puestos vía historial de asignación.

### Modelo

```prisma
enum EstadoPuesto { activo  vacio  clausurado  construccion }

model Puesto {
  id            String       @id @default(cuid())
  codigo        String       @unique     // "A-12"
  giro          String?
  area          Float?
  zona          String?
  estado        EstadoPuesto @default(vacio)
  fotoUrl       String?
  observaciones String?
  searchKey     String       @default("")
  createdById   String?
  updatedById   String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  asignaciones  PuestoAsignacion[]
}

model PuestoAsignacion {
  id        String    @id @default(cuid())
  puestoId  String
  socioId   String
  desde     DateTime  @default(now())
  hasta     DateTime?            // null = vigente
  motivo    String?
  byUserId  String?
  createdAt DateTime  @default(now())
}
```

### Reglas
- Un puesto tiene **a lo más una** asignación vigente (`hasta = null`).
- Asignar a un socio = en una transacción, cerrar la asignación vigente (set `hasta`)
  + crear la nueva + `estado = activo`.
- Desasignar = cerrar la vigente + `estado = vacio`.
- Un socio puede tener varios puestos vigentes simultáneamente.
- `clausurado` / `construccion` son overrides manuales del estado.
- Borrar puesto: cascade a `PuestoAsignacion`.

### Server actions (`puestos/actions.ts`)
`listPuestos`, `getPuesto`, `createPuesto`, `updatePuesto`, `deletePuesto`,
`assignPuesto(puestoId, socioId, motivo?)`, `unassignPuesto(puestoId, motivo)`,
`getPuestoStats`. Permisos: `puestos.read/write/delete/assign`.

### UI
- `/puestos`: stats cards (Total/Activos/Vacíos/Clausurados), tabla ordenable, búsqueda, export.
- Drawer: datos del puesto + tab "Asignación" (socio actual + historial + acción asignar/desasignar).

## Sub-proyecto #4 — Asambleas y asistencia

### Modelo

```prisma
enum TipoAsamblea     { ordinaria  extraordinaria }
enum EstadoAsamblea   { programada  en_curso  cerrada }
enum EstadoAsistencia { presente  ausente  justificado  tardanza }

model Asamblea {
  id           String         @id @default(cuid())
  titulo       String
  tipo         TipoAsamblea   @default(ordinaria)
  fecha        DateTime
  lugar        String?
  agenda       String?
  estado       EstadoAsamblea @default(programada)
  quorumMinimo Int?
  createdById  String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  asistencias  Asistencia[]
}

model Asistencia {
  id          String           @id @default(cuid())
  asambleaId  String
  socioId     String
  estado      EstadoAsistencia @default(ausente)
  observacion String?
  byUserId    String?
  @@unique([asambleaId, socioId])
}
```

### Flujo
- Al crear la asamblea se generan filas `Asistencia` (estado `ausente`) para todos
  los socios `activo` — snapshot del padrón en ese momento.
- Marcar asistencia: cambiar estado por socio (presente/ausente/justificado/tardanza).
- **Quórum en vivo** = (presentes + tardanzas) / total esperados; se compara con `quorumMinimo`.
- Faltas (`ausente`) quedan disponibles para el futuro módulo de Sanciones.
- Borrar asamblea: cascade a `Asistencia`.

### Server actions (`asambleas/actions.ts`)
`listAsambleas`, `getAsamblea`, `createAsamblea`, `updateAsamblea`, `deleteAsamblea`,
`setAsistencia(asistenciaId, estado, observacion?)`, `getAsambleaStats`.
Permisos: `asambleas.read/write/delete/attendance`.

### UI
- `/asambleas`: lista de asambleas (fecha, tipo, estado, % asistencia).
- Detalle: cabecera con quórum + lista de socios para marcar asistencia (filtro presente/ausente).

## Cambios transversales
- `Socio`: relaciones inversas `asignacionesPuesto`, `asistencias`. Drawer del socio: tab "Puestos".
- `User`: relaciones inversas de auditoría para las nuevas tablas.
- `permissions.ts`: agregar `puestos.*` y `asambleas.*`; asignar a superadmin (todos),
  admin (todos salvo delete), viewer (solo read).
- Sidebar: entradas "Puestos" y "Asambleas".

## Migración
Una sola migración `puestos_asambleas` con las 4 tablas + enums. Reseed para permisos.

## Testing
`prisma/verify-puestos.ts` (asignación cierra la anterior, invariante 1-vigente, cascade)
y `prisma/verify-asambleas.ts` (generación de lista, cálculo de quórum, cascade).
