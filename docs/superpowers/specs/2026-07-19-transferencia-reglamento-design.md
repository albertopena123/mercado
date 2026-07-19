# Transferencia de puesto conforme al Reglamento Interno de Administración

**Fecha:** 2026-07-19
**Rama:** `feat/guardiania`
**Estado:** Diseño aprobado (pendiente revisión del spec)

## 1. Contexto y base normativa

Cuando un socio vende su puesto, el **Reglamento Interno de Administración** de la Feria
Mayorista Internacional Milagros exige un procedimiento formal. Artículos relevantes:

- **Art. 14-g:** la transferencia requiere **autorización escrita** y **opinión favorable del
  Consejo Directivo**.
- **Art. 24-k:** para transferir su puesto, el socio debe **renunciar a su condición de
  asociado** y solicitar por escrito **autorización previa de transferencia al Consejo
  Directivo con conocimiento de la Asamblea General**.
- **Art. 24-n:** al transferir su stand deberá **abonar por las mejoras que hizo la
  Asociación**; y el **nuevo asociado deberá pagar todas las cuotas** que fije la Asociación.
  El monto de mejoras se cobra **por dimensión del puesto** (acuerdo vigente): **S/ 2,000
  para puesto 3x5 (`d3x5`)** y **S/ 1,500 para puesto 3x3 (`d3x3`)**.
- **Art. 24-ñ:** el titular deberá obtener un **Certificado de No Deudor** (= Constancia de
  No Adeudo del sistema).
- **Art. 8-A (Estatuto, citado en Art. 30):** la calidad de asociado se pierde por **renuncia
  escrita dirigida al presidente, aceptada por el Consejo Directivo y la Asamblea General**.

## 2. Estado actual del sistema

Los módulos existentes ya cubren el *substance* pero están **desconectados como registros**:

- **`/socios/[id]/renuncia`** — genera Carta de Renuncia imprimible; expediente `Renuncia`
  con máquina de estados `solicitada → aceptada_cd → ratificada_ag → efectiva` (actas CD/AG).
  `efectivizarRenuncia` retira al socio y **vacía** sus puestos.
- **`/socios/[id]/constancia`** — emite `Constancia` verificable con QR/folio; la de
  `no_adeudo` exige deuda = 0 y sin inasistencias injustificadas. Vigencia 30 días.
- **`/transferencias`** — expediente `Transferencia` (`borrador → completada|anulada`).
  `formalizarTransferencia` (en una transacción, con `SELECT … FOR UPDATE` del puesto):
  re-verifica **deuda = 0**, exige subir **escaneo firmado de renuncia + contrato**, crea al
  comprador como **socio nuevo**, reasigna el puesto y **retira al vendedor si queda sin
  puestos**.

**Gaps vs. reglamento:** (A) no se cobra ni registra el pago de mejoras; (B) no hay
autorización de Consejo Directivo / conocimiento de Asamblea; (C) la renuncia solo se exige
como escaneo suelto, no como expediente ratificado; (D) la constancia de no adeudo no se
exige ni enlaza (solo se recalcula deuda). Además, las cuotas del nuevo socio (Art. 24-n, 2ª
parte) quedan **fuera de alcance** de este spec (ver §9).

## 3. Infraestructura reutilizada (sin reinventar)

- **Cobro → caja → comprobante:** todo pago pasa por `MovimientoCaja` (ingreso) +
  `emitirComprobantePago` (`src/lib/comprobante/emitir.ts:42`) → recibo imprimible con QR
  (`ComprobanteView`). El cobro de mejoras seguirá exactamente este camino.
- **Máquina de estados de renuncia** (`renuncia/actions.ts`) — sin cambios; se **consume**
  desde la transferencia.
- **Patrón de locking/idempotencia** de `registrarPago`/`formalizarTransferencia`
  (`$transaction` + `FOR UPDATE` + reintento P2002).

## 4. Decisiones tomadas

1. **Modelado del cobro de mejoras:** campos de primera clase en `Transferencia` (ligado al
   expediente y reportable), con el dinero fluyendo por `MovimientoCaja` + `Comprobante`.
   **Rationale:** mantiene el cobro atado al expediente y —crítico— *fuera* de la deuda
   ordinaria, para que el vendedor pueda emitir su Constancia de No Adeudo sin que mejoras
   cuente como deuda.
2. **Renuncia ratificada:** se exige **solo cuando la venta retira al vendedor** (queda con 0
   puestos vigentes tras la venta). Si conserva otros puestos, no se exige (evita la
   contradicción de "renuncia total" vendiendo 1 de varios). Caso mayoritario en el mercado:
   1 puesto → siempre se exige.
3. **Evidencia física:** se **mantienen** ambos escaneos firmados (carta de renuncia +
   contrato) **además** de los expedientes vinculados (Renuncia ratificada + Constancia con
   QR). Máximo respaldo documental.
4. **Autorización CD/AG (Art. 14-g, 24-k):** se registra en el propio expediente de
   transferencia (`actaCd*` obligatorio, `actaAg*` opcional = "conocimiento"), independiente
   de las actas de la renuncia (que aprueban la *pérdida de condición de socio*, no la
   *transferencia*).

## 5. Modelo de datos

### 5.1 Enum `CategoriaMovimiento`
Agregar valor de ingreso **`mejoras`** (para distinguir el ingreso en reportes de caja).

### 5.2 Modelo `Transferencia` — nuevos campos

```prisma
// Mejoras (Art. 24-n). Monto calculado por dimensión del puesto al crear el expediente.
mejorasMonto           Decimal   @db.Decimal(10, 2)      // 2000 (3x5) | 1500 (3x3)
mejorasPagadoEn        DateTime?
mejorasMetodoPago      String?
mejorasNroOperacion    String?
mejorasMovimientoCajaId String?  @unique
mejorasComprobanteId   String?   @unique

// Certificado de No Deudor (Art. 24-ñ). Debe ser una Constancia no_adeudo vigente del transferente.
constanciaId           String?

// Renuncia formal (Art. 24-k, 8-A). Requerida solo si la venta retira al vendedor.
renunciaId             String?

// Autorización del Consejo Directivo (Art. 14-g) y conocimiento de Asamblea (Art. 24-k).
actaCdNumero           String?
actaCdFecha            DateTime?
actaAgNumero           String?
actaAgFecha            DateTime?
```

Relaciones nuevas (todas `onDelete: SetNull`, opcionales):
`constancia Constancia?`, `renuncia Renuncia?`, `mejorasMovimientoCaja MovimientoCaja?`,
`mejorasComprobante Comprobante?`. Lados inversos correspondientes en `Constancia`,
`Renuncia`, `MovimientoCaja`, `Comprobante`.

### 5.3 Migración
- Aditiva: columnas nuevas + valor de enum `mejoras`.
- `mejorasMonto` es NOT NULL: backfill para filas existentes calculando desde
  `Puesto.dimension` (2000/1500). Las `completada`/`anulada` históricas reciben el valor
  correspondiente por consistencia (no se re-cobran).
- Constante `MEJORAS_POR_DIMENSION` en `src/lib/transferencias/mejoras.ts`:
  `{ d3x5: 2000, d3x3: 1500 }`, con helper `montoMejoras(dimension)`.

## 6. Server actions

Todas en `src/app/(admin)/transferencias/actions.ts`, permiso `transferencias.write` salvo
lo indicado.

- **`createTransferencia`** (modificar): calcular y persistir `mejorasMonto` desde
  `puesto.dimension`.
- **`pagarMejoras(id, input: { metodoPago?, nroOperacion?, fecha? })`** (nueva): solo en
  `borrador` y si `mejorasPagadoEn == null`. En una `$transaction`: crea `MovimientoCaja`
  (`tipo: ingreso`, `categoria: mejoras`, `socioId: transferente`, `monto: mejorasMonto`,
  `origen: "transferencia"`), setea `mejorasPagadoEn/MetodoPago/NroOperacion` y
  `mejorasMovimientoCajaId`; tras commit emite `Comprobante` (detalle: "Cobro de mejoras por
  transferencia `<codigo>` — puesto `<codigo>`") y guarda `mejorasComprobanteId`. Idempotente
  (si ya pagado, retorna el existente).
- **`anularMejoras(id)`** (nueva, opcional): revierte el pago mientras esté en `borrador`
  (marca el movimiento/ comprobante como anulado y limpia los campos). *Solo si es
  necesario en pruebas/corrección.*
- **`vincularConstancia(id, constanciaId | null)`** (nueva): valida que la constancia sea
  `tipo: no_adeudo`, del transferente, `anulada: false` y **vigente** (`validoHasta >= hoy`).
- **`vincularRenuncia(id, renunciaId | null)`** (nueva): valida que la renuncia sea del
  transferente y esté en `ratificada_ag`.
- **`registrarActaTransferencia(id, { actaCdNumero, actaCdFecha, actaAgNumero?, actaAgFecha? })`**
  (nueva): guarda las actas; `actaCd*` obligatorio.
- **`formalizarTransferencia`** (modificar): ver §7.
- **`anularTransferencia` / `deleteTransferencia`** (modificar): al anular/eliminar en
  `borrador`, desvincular `constanciaId`/`renunciaId` (no se consumen) y **no** revertir el
  ingreso de mejoras ya cobrado (queda en caja; devolución manual si corresponde — se
  documenta en el aviso de la UI).

## 7. `formalizarTransferencia` — candados nuevos

Dentro de la transacción existente (tras `FOR UPDATE` del puesto), además de los actuales
(deuda = 0, `renunciaUrl` + `contratoUrl` subidos, asignación vigente):

1. **Mejoras pagadas:** `mejorasPagadoEn != null`.
2. **Constancia vinculada válida:** `constanciaId` presente; re-validar `no_adeudo`, del
   transferente, no anulada y vigente **dentro de la tx**.
3. **Acta CD:** `actaCdNumero` presente.
4. **Renuncia (condicional):** calcular `seRetira` = (puestos vigentes del transferente
   distintos de este) `=== 0`.
   - Si `seRetira`: exigir `renunciaId` en `ratificada_ag` del transferente; **marcarla
     `efectiva`** (`efectivaEn = now`) en la misma tx, y retirar al vendedor (como hoy) — el
     puesto **pasa al comprador** (`estado: activo`), **no se vacía**. Escribir
     `SocioEstadoLog`.
   - Si **no** `seRetira`: no exigir renuncia; el vendedor permanece `activo`; solo se mueve
     este puesto.

Cada candado faltante aborta con un `Denied` de mensaje claro (mismo patrón actual). El
orden de re-validación se mantiene defensivo (TOCTOU).

## 8. UI

`TransferenciaDetailClient.tsx` pasa de "dos documentos + botón" a un **checklist de
requisitos** para formalizar, cada uno con su acción y estado (✓/pendiente):

1. **Mejoras** — muestra `S/ mejorasMonto` (con la dimensión); botón **Pagar mejoras** →
   modal (método de pago, N.° operación) → al pagar, enlace al **comprobante imprimible**.
2. **Constancia de No Adeudo** — selector/enlace: emitir en `/socios/[id]/constancia` y
   **vincular**; muestra folio + vigencia. Si vence, se marca pendiente.
3. **Renuncia ratificada** — *solo si esta venta retira al vendedor*: enlace a
   `/socios/[id]/renuncia` para tramitar hasta `ratificada_ag` y **vincular**; muestra actas.
4. **Acta del Consejo Directivo** — form inline (N.° acta CD + fecha; opcional acta AG).
5. **Carta de renuncia firmada (escaneo)** — como hoy (`subirDocumento("renuncia")`).
6. **Contrato firmado (escaneo)** — como hoy (`subirDocumento("contrato")`).

`puedeFormalizar` = todos los requisitos aplicables en verde. El botón **Formalizar** queda
deshabilitado con tooltip listando lo que falta. Aviso de que anular no devuelve
automáticamente las mejoras cobradas.

## 9. Fuera de alcance

- **Cuotas del nuevo socio (Art. 24-n, 2ª parte):** generación automática de cuotas al alta
  por transferencia. Hoy no se auto-generan cuotas para ningún socio nuevo; abordarlo aquí
  ampliaría el alcance. Se deja como seguimiento.
- Cambios al flujo de renuncia autónomo (`efectivizarRenuncia`) salvo el consumo desde la
  transferencia.

## 10. Errores y casos borde

- Constancia vinculada que **vence** antes de formalizar → requisito vuelve a pendiente; el
  usuario emite una nueva y re-vincula.
- Renuncia vinculada pero el vendedor **conserva** puestos (no `seRetira`) → no se consume;
  la UI solo muestra el requisito de renuncia cuando `seRetira`.
- Intentar `pagarMejoras` dos veces → idempotente (no duplica ingreso ni comprobante).
- Anular expediente con mejoras ya cobradas → el ingreso permanece en caja (devolución
  manual); constancia/renuncia se desvinculan sin consumirse.
- Concurrencia: toda formalización sigue bajo `FOR UPDATE` del puesto + claim atómico del
  estado `borrador → completada`.

## 11. Mejora: autocompletado de ubigeo (distrito/provincia/departamento)

**Problema:** al crear una transferencia, el autocompletado por DNI rellena apellidos,
nombres, estado civil y domicilio (texto), pero **distrito / provincia / departamento quedan
manuales** — el lookup ignora el ubigeo.

**Hallazgo confirmado (llamada real a la API):** `apidatos.unamad.edu.pe/api/consulta/{dni}`
sí devuelve `UBIGEO_NAC` (nacimiento) **y** `UBIGEO_DIR` (domicilio), ambos códigos RENIEC de
6 dígitos, junto a `DIRECCION`. Para los campos de **domicilio** se usa **`UBIGEO_DIR`** (no
el de nacimiento; `UBIGEO_DIR` es el que acompaña a `DIRECCION`).

**Diseño:**
1. **Portar el mapeo ubigeo** a mercado_modelo (reutilizado de `busquedanamereniec`):
   - `src/lib/ubigeo/ubigeo-data.ts` — mapas `DEPARTMENTS` (2 díg), `PROVINCES` (4 díg),
     `DISTRICTS` (6 díg), generados desde `ubigeo.txt`
     (`c:\Apache24\htdocs\busquedanamereniec\ubigeo.txt`, formato
     `CODIGO<TAB>DEPTO / PROV / DIST`, 1893 filas) con un script único de generación.
   - `src/lib/ubigeo/index.ts` — `lookupUbigeo(code)` → `{ departamento, provincia,
     distrito, completo }`; normaliza no-dígitos y rellena cero perdido cuando llega con 5
     dígitos; retorna `null` si el código es inválido/vacío.
2. **Extender `lookupDniUnamad`** (`src/lib/socios/dni-lookup.ts`): agregar `UBIGEO_DIR` (y
   `UBIGEO_NAC` por completitud) a `DniApiResponse`; resolver en el servidor con
   `lookupUbigeo(UBIGEO_DIR)` y sumar a `DniLookupResult`:
   `departamento / provincia / distrito` (strings o null). `direccion` se mantiene.
3. **`CreateTransferenciaModal`**: al resolver el DNI, autocompletar `distrito / provincia /
   departamento` con `(prev) => prev || valor` (respeta lo que el usuario ya escribió), igual
   que hoy con apellidos/dirección.

**Robustez:** si `UBIGEO_DIR` viene vacío o inválido, `lookupUbigeo` retorna `null` y los
campos quedan manuales (comportamiento actual) — sin regresión. La API sigue siendo volátil;
el parseo es defensivo (campo opcional).

**Extensión opcional (fuera de este lote):** el mismo `lookupDniUnamad` alimenta el alta de
socios; wire idéntico en el formulario de socios queda como seguimiento de bajo costo.

**Pruebas:** `lookupUbigeo("150101")` → LIMA/LIMA/LIMA; `"090325"` → HUANCAVELICA/…;
código de 5 díg con cero perdido se normaliza; código basura → `null`.

## 12. Pruebas / verificación

- Unit: `montoMejoras(d3x5) === 2000`, `montoMejoras(d3x3) === 1500`.
- Integración `formalizarTransferencia`: cada prerequisito faltante (mejoras, constancia,
  acta CD, renuncia cuando `seRetira`) **bloquea**; con todo en verde **completa**, mueve el
  puesto al comprador (`activo`, no `vacio`), retira al vendedor solo si `seRetira`, y marca
  la renuncia `efectiva`.
- Caso no-retiro (vendedor con 2 puestos vende 1): no exige renuncia, vendedor sigue
  `activo`.
- `pagarMejoras`: crea `MovimientoCaja` categoría `mejoras` + `Comprobante`; idempotente.
- `tsc` y `eslint` en verde (filtrar ruido de `.next`, ver memoria `tsc-next-stale-noise`).
