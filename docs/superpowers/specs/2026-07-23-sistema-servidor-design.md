# Módulo "Servidor" (estado de recursos) — Diseño

**Fecha:** 2026-07-23
**Estado:** Aprobado (el usuario delegó las decisiones de diseño)

## Objetivo

El sistema corre en un solo equipo (app `next start` + Postgres en localhost).
La directiva necesita ver, desde el panel admin, si a ese equipo le queda
disco/memoria y si la CPU está saturada — sin instalar herramientas externas.

## Alcance (acordado con el usuario)

- **Máquina**: CPU, RAM y disco, con **semáforo** verde/ámbar/rojo.
- **Refresco en vivo** cada 5 s con la pestaña visible.
- **Permiso propio** `sistema.read` (superadmin y admin por defecto; asignable
  a otros roles desde /roles).
- Fuera de alcance (se decidió no incluir): métricas de BD y del proceso Node.

## Enfoque elegido

Node puro, **cero dependencias nuevas**:

- **CPU**: delta de `os.cpus()` entre el sondeo anterior y el actual (estado a
  nivel de módulo). En el primer sondeo, doble muestra con ~250 ms de espera.
  Promedio entre núcleos.
- **RAM**: `os.totalmem()` − `os.freemem()`.
- **Disco**: `fs.promises.statfs(process.cwd())` — multiplataforma (Windows y
  Linux), sin ejecutar comandos del SO. Reporta el disco donde vive la app
  (que es donde están los uploads y la BD local).
- **Host**: hostname, plataforma, arquitectura y uptime del equipo.

## Piezas

| Pieza | Responsabilidad |
|---|---|
| `src/lib/sistema/metrics.ts` | Leer las métricas (sin `server-only` para poder probarse con `tsx`; no toca secretos) |
| `src/app/(admin)/sistema/actions.ts` | Acción `getEstadoServidor` protegida por `sistema.read` |
| `src/app/(admin)/sistema/page.tsx` | Guard `requirePermission` + estado inicial renderizado en servidor |
| `src/app/(admin)/sistema/SistemaClient.tsx` | Tarjetas con barra + semáforo; sondeo cada 5 s (pausado con pestaña oculta) |
| `permissions.ts` + seed | `sistema.read` (categoría "Sistema"); admin lo recibe por defecto |
| `data.ts` | Entrada de menú "Servidor" (icono `device`, ruta `/sistema`) |

## Umbrales del semáforo

| Métrica | Ámbar | Rojo |
|---|---|---|
| CPU | ≥ 80 % | ≥ 95 % |
| RAM | ≥ 85 % | ≥ 95 % |
| Disco | ≥ 80 % | ≥ 90 % |

## Errores

- Si `statfs` falla, la tarjeta de disco muestra "No disponible" en gris (no se
  inventa un valor).
- Si un sondeo falla, banner discreto y se reintenta en el siguiente ciclo; la
  página nunca se rompe.

## Verificación

- `metrics.ts` probado directo con `tsx` (valores plausibles: 0 ≤ pct ≤ 100,
  disco > 0).
- `tsc --noEmit` y `eslint` limpios.
- Página responde (redirige a login sin sesión).
- Seed re-ejecutado para sincronizar el permiso.
