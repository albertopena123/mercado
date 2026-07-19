# Cargos de guardianía por socio

Fecha: 2026-07-19 · Rama: `feat/guardiania`

## Problema

La guardianía vive hoy como un módulo aparte: `GuardianiaPago` (4890 pagos
históricos del Excel) + `GuardianiaCuenta` (una por puesto, con una deuda
*estimada* = meses esperados × tarifa − meses cubiertos). Esa deuda no aparece
en el estado de cuenta del socio (`/socios/[id]/deudas`) ni es cobrable con la
UI de cuotas. El objetivo es **generar cargos reales por socio** a partir de esa
deuda, para que se vean y se cobren/exoneren como cualquier otra cuota.

## Decisiones (acordadas con el usuario)

- **Todos los meses**: se genera un cargo por cada mes desde `inicioPeriodo`
  hasta el mes actual; los meses con pago quedan `pagada`, los sin pago
  `pendiente`. (No solo la deuda: ledger completo por socio.)
- **Hasta el mes actual** (jul-2026). Como no hay pagos de 2026, ene–jul 2026
  se generan como pendientes para cada cuenta activa.
- **Criterio de "pagado"** = el mismo del tab *Deudas por puesto*: un mes con
  *cualquier* `GuardianiaPago` (mismo puesto + periodo) cuenta como cubierto,
  aunque el importe sea parcial. Así ambas vistas cuadran.

## Modelo de datos

Se reutiliza `Cuota` (sin cambios de esquema):

- `concepto` = `"Guardianía · <puesto.codigo>"` — el código de puesto en el
  concepto evita choque con la `@@unique([socioId, periodo, concepto])` cuando
  un socio tiene 2 puestos (cada serie es independiente).
- `periodo` = `"YYYY-MM"` de cada mes del rango.
- `monto` = `tarifaMensual` de la cuenta (S/30 o S/45) — la obligación.
- `estado` = `pagada` si el mes tiene pago, si no `pendiente`.
- `pagadoMonto` = suma de importes de los pagos de ese mes (informativo; puede
  ser < `monto` en meses de pago parcial).
- `pagadoEn` = fecha del pago más reciente del mes; `metodoPago` y
  `nroOperacion` = del mismo pago.
- `vencimiento` = último día del mes del periodo (medianoche UTC).
- `createdById` = usuario que ejecuta. `byUserId` = null (histórico).

## Alcance

- Solo **cuentas `activo` con `socioId`** (646 de 680). Las 34 cuentas sin socio
  y los pagos huérfanos se **reportan** en el resumen; no bloquean, pero no
  generan cargo hasta que se vinculen.
- **No** se crean `MovimientoCaja` ni `Comprobante` para los meses `pagada`: son
  reconstrucción histórica; el dinero ya está en `GuardianiaPago`. Evita doble
  conteo en caja/reportes.

## Idempotencia

`createMany({ skipDuplicates: true })`. La `@@unique(socioId, periodo, concepto)`
garantiza que re-ejecutar solo inserta meses nuevos y **nunca pisa** una cuota
que ya se pagó/exoneró desde la UI. Para el resumen se calcula aparte cuántas ya
existían.

## Flujo de uso (previsualizar → confirmar)

Por el volumen (~22k filas) el disparo es en dos pasos:

1. Botón **"Generar cargos a socios"** en el módulo Guardianía (permiso
   `guardiania.write`), en la barra del tab *Deudas por puesto*.
2. Abre un modal que llama a la acción en modo **preview** (`commit: false`) y
   muestra el resumen: cuentas consideradas, socios afectados, meses
   pagados/pendientes, cuotas nuevas vs. ya existentes, total pendiente a
   generar, y cuentas sin socio omitidas.
3. Al confirmar se llama en modo **commit** (`commit: true`); inserta por lotes
   de 500 y refresca.

## Componentes

- `generarCargosGuardiania(input: { commit: boolean }): ActionResult<CargosResumen>`
  en `guardiania/actions.ts` — calcula el plan y (si `commit`) inserta.
- `CargosResumen` en `guardiania/types.ts`.
- `GenerarCargosModal.tsx` — preview + confirmación (patrón de
  `RegistrarPagoModal`).
- Botón en `GuardianiaClient.tsx` (tab Deudas).
- `verify-guardiania.ts` — checks: el total pendiente de las cuotas generadas
  cuadra con la deuda estimada del tab; ninguna cuota duplicada; concepto con
  prefijo correcto.

## Coexistencia

El tab *Deudas por puesto* queda igual (vista operativa por puesto). Los cargos
`Cuota` son la vista cobrable por socio. Los totales pendientes deben cuadrar
(±redondeo) con la deuda estimada (~S/596k, ajustada a las 646 cuentas con
socio).

## Fuera de alcance (posibles siguientes pasos)

- Vincular los huérfanos (34 cuentas + pagos sin socio) — otro flujo.
- Reconciliar pagos parciales (marcar como pendiente un mes con pago < tarifa).
- Automatizar la corrida mensual (cron) para acumular el mes nuevo.
