"use server";

import { revalidatePath } from "next/cache";
import { Prisma, type EstadoCuota } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/server";
import type { PermissionKey } from "@/lib/auth/permissions";
import { toNumber } from "@/lib/money";
import { inicioDiaUTC } from "@/lib/fecha";
import { normalizeToken, splitSearchTokens } from "@/lib/socios/normalize";
import { CATEGORIA_LABEL } from "@/lib/caja/labels";
import { emitirComprobantePago } from "@/lib/comprobante/emitir";
import {
  esAutovaluo,
  normalizaNroOperacion,
  AUTOVALUO_TOKEN,
} from "@/lib/cuotas/autovaluo";
import type {
  ActionResult,
  CuotaRow,
  ListCuotasParams,
  ListCuotasResult,
  CuotaStats,
  SocioCuotas,
  GenerarCuotasInput,
  RegistrarPagoInput,
  PagoPorMontoResult,
  PagoMultipleResult,
  SocioPick,
  AplicarDeudaInput,
  ComprobanteRef,
} from "./types";

const PAGE_SIZE = 25;
const PAGE_SIZES = [25, 50, 100];
function clampSize(n?: number): number {
  return n && PAGE_SIZES.includes(n) ? n : PAGE_SIZE;
}
const PERIODO_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

class Denied extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Denied";
  }
}

async function authorize(perm: PermissionKey): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new Denied("No autenticado.");
  if (!user.permissions.has(perm))
    throw new Denied("No tienes permisos para esta acción.");
  return user;
}

function fail(error: string, fieldErrors?: Record<string, string>): ActionResult {
  return { ok: false, error, fieldErrors };
}
function ok<T>(data?: T): ActionResult<T> {
  return { ok: true, data };
}
function refresh() {
  revalidatePath("/cuotas");
  revalidatePath("/socios");
}

function socioNombre(s: {
  apellidoPaterno: string;
  apellidoMaterno: string | null;
  nombres: string;
}): string {
  return `${s.apellidoPaterno} ${s.apellidoMaterno ?? ""}, ${s.nombres}`.replace(
    /\s+,/,
    ",",
  );
}

// Texto del comprobante: qué cuotas se saldaron. El importe del recibo es la suma
// de las cuotas listadas (no se maneja saldo a favor: el pago cubre cuotas
// completas, sin excedente).
function buildDetallePago(
  cuotas: { periodo: string; concepto: string; monto: number }[],
): string {
  const lineas = cuotas.map(
    (c) => `${c.concepto} (${c.periodo}) — S/ ${c.monto.toFixed(2)}`,
  );
  return lineas.length ? lineas.join("\n") : "Pago a cuenta";
}

// Emite el comprobante de un pago. Tolerante a fallos: si la emisión falla, el
// pago YA quedó registrado; se devuelve null (se puede reemitir después).
async function emitirComprobanteSocio(args: {
  socioId: string;
  socio: {
    codigo: string;
    numeroDocumento: string;
    apellidoPaterno: string;
    apellidoMaterno: string | null;
    nombres: string;
  };
  monto: number;
  detalle: string;
  metodoPago: string;
  nroOperacion: string | null;
  fecha: Date;
  movimientoCajaId: string | null;
  emitidoPorId: string;
}): Promise<ComprobanteRef | null> {
  try {
    return await emitirComprobantePago({
      socioId: args.socioId,
      socioCodigo: args.socio.codigo,
      socioNombre: socioNombre(args.socio),
      numeroDocumento: args.socio.numeroDocumento,
      monto: args.monto,
      metodoPago: args.metodoPago,
      nroOperacion: args.nroOperacion,
      detalle: args.detalle,
      movimientoCajaId: args.movimientoCajaId,
      emitidoPorId: args.emitidoPorId,
      // emitidoEn = instante real de emisión (now()). No usar la fecha-calendario
      // del pago (medianoche UTC), que al mostrarse como hora de Lima se corre al
      // día anterior 7pm.
    });
  } catch (e) {
    console.error("emitirComprobanteSocio", e);
    return null;
  }
}

// Fase 2 — integración con Caja: cada pago de cuota registra un INGRESO en el
// libro de caja (categoría "cuota", origen "cuota") dentro de la MISMA
// transacción del pago, para que la recaudación quede reflejada atómicamente.
// El reconocimiento es por monto NOMINAL de las cuotas saldadas.
async function registrarIngresoCuota(
  tx: Prisma.TransactionClient,
  args: {
    monto: number;
    socioId: string;
    concepto: string;
    fecha: Date;
    metodoPago: string;
    nroOperacion?: string | null;
    registradoPorId: string;
  },
): Promise<string | null> {
  if (!(args.monto > 0)) return null;
  const mov = await tx.movimientoCaja.create({
    data: {
      tipo: "ingreso",
      categoria: "cuota",
      monto: new Prisma.Decimal(args.monto.toFixed(2)),
      fecha: args.fecha,
      concepto: args.concepto,
      metodoPago: args.metodoPago,
      nroOperacion: args.nroOperacion ?? null,
      socioId: args.socioId,
      origen: "cuota",
      registradoPorId: args.registradoPorId,
      searchKey: [args.concepto, CATEGORIA_LABEL.cuota]
        .map(normalizeToken)
        .join(" "),
    },
    select: { id: true },
  });
  return mov.id;
}

function toRow(c: {
  id: string;
  socioId: string;
  periodo: string;
  concepto: string;
  monto: Prisma.Decimal;
  vencimiento: Date | null;
  estado: EstadoCuota;
  pagadoEn: Date | null;
  pagadoMonto: Prisma.Decimal | null;
  metodoPago: string | null;
  nroOperacion: string | null;
  motivo: string | null;
  socio: { codigo: string; apellidoPaterno: string; apellidoMaterno: string | null; nombres: string };
}): CuotaRow {
  return {
    id: c.id,
    socioId: c.socioId,
    socioNombre: socioNombre(c.socio),
    socioCodigo: c.socio.codigo,
    periodo: c.periodo,
    concepto: c.concepto,
    monto: toNumber(c.monto),
    vencimiento: c.vencimiento ? c.vencimiento.toISOString() : null,
    estado: c.estado,
    pagadoEn: c.pagadoEn ? c.pagadoEn.toISOString() : null,
    pagadoMonto: c.pagadoMonto != null ? toNumber(c.pagadoMonto) : null,
    metodoPago: c.metodoPago,
    nroOperacion: c.nroOperacion,
    motivo: c.motivo,
  };
}

const SOCIO_SELECT = {
  codigo: true,
  apellidoPaterno: true,
  apellidoMaterno: true,
  nombres: true,
} as const;

export async function listCuotas(
  params: ListCuotasParams,
): Promise<ActionResult<ListCuotasResult>> {
  try {
    await authorize("cuotas.read");
    const page = Math.max(1, params.page ?? 1);
    const pageSize = clampSize(params.pageSize);
    const where: Prisma.CuotaWhereInput = {};
    if (params.estado) where.estado = params.estado;
    if (params.periodo) where.periodo = params.periodo;
    const q = params.q?.trim();
    if (q) {
      // Tokeniza + normaliza (minúsculas, sin tildes) y exige que cada token
      // aparezca en el searchKey del socio (concatenación normalizada de código,
      // documento, n.° de padrón y nombre completo). Igual criterio que
      // listSocios: así "juan carlos curi" matchea aunque el nombre se reparta
      // entre `nombres` y los apellidos y sin importar el orden ni los acentos.
      // (Antes se hacía un único `contains` del query COMPLETO por campo, así que
      // un nombre de varias palabras no cabía en ningún campo → 0 resultados.)
      const tokens = splitSearchTokens(q).map(normalizeToken);
      if (tokens.length > 0) {
        where.socio = {
          AND: tokens.map((token) => ({ searchKey: { contains: token } })),
        };
      }
    }

    const [total, rows] = await Promise.all([
      prisma.cuota.count({ where }),
      prisma.cuota.findMany({
        where,
        orderBy: [{ periodo: "desc" }, { estado: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { socio: { select: SOCIO_SELECT } },
      }),
    ]);

    return ok({
      items: rows.map(toRow),
      total,
      page,
      pageSize,
    });
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("listCuotas", e);
    return fail("No se pudieron cargar las cuotas.");
  }
}

export async function getCuotasBySocio(
  socioId: string,
): Promise<ActionResult<SocioCuotas>> {
  try {
    const me = await authorize("cuotas.read");
    const cuotas = await prisma.cuota.findMany({
      where: { socioId },
      orderBy: [{ periodo: "desc" }],
      include: { socio: { select: SOCIO_SELECT } },
    });
    const deuda = cuotas
      .filter((c) => c.estado === "pendiente")
      .reduce((acc, c) => acc + toNumber(c.monto), 0);
    return ok({
      deuda,
      canPay: me.permissions.has("cuotas.pay"),
      canWrite: me.permissions.has("cuotas.write"),
      cuotas: cuotas.map(toRow),
    });
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("getCuotasBySocio", e);
    return fail("No se pudieron cargar las cuotas del socio.");
  }
}

export async function pagarPorMonto(
  socioId: string,
  input: {
    monto: number;
    metodoPago?: string;
    fecha?: string;
    nroOperacion?: string;
    // N.° de operación del recibo por cada cuota de autovalúo que este pago vaya
    // a saldar (cuotaId → N.°). El autovalúo exige su recibo único (antifraude),
    // así que "por monto" solo puede saldarlo si aquí viene su número.
    autovaluoOps?: Record<string, string>;
    // Clave de idempotencia (UUID del cliente, una por apertura del modal):
    // evita que un doble-submit vuelva a saldar cuotas (cobrar dos veces).
    idempotencyKey?: string;
  },
): Promise<ActionResult<PagoPorMontoResult>> {
  try {
    const me = await authorize("cuotas.pay");
    const monto = Number(input.monto);
    if (isNaN(monto) || monto <= 0) return fail("Ingresa un monto mayor a 0.");
    const metodoPago = input.metodoPago?.trim() || "efectivo";
    const nroOperacion = input.nroOperacion?.trim() || null;
    // pagadoEn es una fecha de calendario (la del comprobante): medianoche UTC,
    // para mostrarse con fechaCorta sin correrse un día en Perú (UTC-5).
    const fecha = inicioDiaUTC(input.fecha);

    const result = await prisma.$transaction(async (tx) => {
      // Bloquea la fila del socio para serializar pagos concurrentes del mismo
      // socio: sin esto, dos pagos simultáneos leen las mismas cuotas pendientes
      // y podrían saldar/recontar de más (estado inconsistente).
      await tx.$queryRaw`SELECT id FROM "Socio" WHERE id = ${socioId} FOR UPDATE`;

      // Idempotencia anti doble-submit: la primera llamada con esta clave inserta
      // la fila; una segunda con la MISMA clave choca con el @id y aborta sin
      // re-aplicar (evita que un doble-clic vuelva a saldar cuotas y cobre dos
      // veces). Va DENTRO de la tx: si el pago falla por otra causa, la clave
      // también se revierte y un reintento legítimo con la misma clave funciona.
      if (input.idempotencyKey) {
        try {
          await tx.pagoIdempotencia.create({
            data: { key: input.idempotencyKey, socioId },
          });
        } catch (e) {
          if (
            e instanceof Prisma.PrismaClientKnownRequestError &&
            e.code === "P2002"
          )
            throw new Denied("Este pago ya fue registrado (se evitó un doble envío).");
          throw e;
        }
      }
      const socio = await tx.socio.findUnique({
        where: { id: socioId },
        select: {
          codigo: true,
          numeroDocumento: true,
          apellidoPaterno: true,
          apellidoMaterno: true,
          nombres: true,
        },
      });
      if (!socio) throw new Denied("Socio no encontrado.");

      // El monto se aplica a las cuotas más antiguas primero. No se maneja saldo
      // a favor: debe cubrir cuotas COMPLETAS, sin excedente (se valida abajo).
      let pozo = monto;

      // Cuotas pendientes, de la más antigua a la más reciente.
      const pendientes = await tx.cuota.findMany({
        where: { socioId, estado: "pendiente" },
        orderBy: [{ periodo: "asc" }],
        select: { id: true, monto: true, periodo: true, concepto: true },
      });

      // N.° de operación del recibo por cada autovalúo saldado (normalizado).
      const autovaluoOps = input.autovaluoOps ?? {};

      let recaudado = 0; // suma nominal de cuotas saldadas (ingreso a caja)
      const saldadas: { periodo: string; concepto: string; monto: number }[] = [];
      for (const c of pendientes) {
        const m = toNumber(c.monto);
        if (pozo + 1e-9 >= m) {
          // El autovalúo SÍ puede saldarse "por monto", pero cada recibo exige su
          // N.° de operación único (antifraude). Debe venir en autovaluoOps y no
          // puede reusarse en otro autovalúo (otro año/socio) ni repetirse entre
          // los autovalúos de este mismo pago.
          let nroOpCuota: string | null = null;
          if (esAutovaluo(c.concepto)) {
            const raw = autovaluoOps[c.id];
            if (!raw || !raw.trim())
              throw new Denied(
                `Ingresa el N.° de operación del recibo del autovalúo (${c.periodo}).`,
              );
            nroOpCuota = normalizaNroOperacion(raw);
            const dup = await tx.cuota.findFirst({
              where: {
                id: { not: c.id },
                nroOperacion: nroOpCuota,
                concepto: { contains: AUTOVALUO_TOKEN, mode: "insensitive" },
              },
              select: { id: true },
            });
            if (dup)
              throw new Denied(
                `El N.° de operación "${raw.trim()}" ya está usado en otro autovalúo.`,
              );
          }
          // Transición condicional pendiente → pagada: si una operación
          // concurrente (p. ej. registrarPago, que no bloquea la fila del socio)
          // ya pagó/anuló esta cuota, NO la re-contamos ni gastamos el pozo en
          // ella — evita un ingreso duplicado en caja.
          const upd = await tx.cuota.updateMany({
            where: { id: c.id, estado: "pendiente" },
            data: {
              estado: "pagada",
              pagadoEn: fecha,
              pagadoMonto: m,
              metodoPago,
              // El autovalúo guarda su N.° propio (único, antifraude); las demás
              // guardan el N.° de recibo de tesorería del pago.
              ...((nroOpCuota ?? nroOperacion)
                ? { nroOperacion: nroOpCuota ?? nroOperacion }
                : {}),
              byUserId: me.id,
            },
          });
          if (upd.count === 0) continue; // ya no estaba pendiente
          pozo = Math.round((pozo - m) * 100) / 100;
          recaudado = Math.round((recaudado + m) * 100) / 100;
          saldadas.push({ periodo: c.periodo, concepto: c.concepto, monto: m });
        } else {
          break; // no alcanza para la siguiente cuota completa
        }
      }

      // No se maneja saldo a favor: si tras saldar cuotas completas sobra dinero,
      // el monto no coincide con las cuotas y se rechaza el pago entero (evita
      // dejar un excedente sin destino). El cajero debe ingresar un importe que
      // salde cuotas completas (p. ej. la deuda total).
      if (pozo > 0.0001) {
        throw new Denied(
          recaudado > 0
            ? `El monto sobra S/ ${pozo.toFixed(2)} tras saldar ${saldadas.length} cuota(s). Ingresa un importe que cubra cuotas completas (ya cubiertas: S/ ${recaudado.toFixed(2)}).`
            : "El monto no alcanza para saldar la cuota más antigua.",
        );
      }

      // Reconoce en caja lo recaudado por cuotas saldadas (si alcanzó alguna).
      const movId = await registrarIngresoCuota(tx, {
        monto: recaudado,
        socioId,
        concepto: `Pago de ${saldadas.length} cuota(s) · ${socioNombre(socio)}`,
        fecha,
        metodoPago,
        nroOperacion,
        registradoPorId: me.id,
      });

      return { socio, saldadas, movId };
    });

    // El pago cubre cuotas completas (el excedente se rechazó dentro de la tx),
    // así que lo recaudado = el monto ingresado = importe del MovimientoCaja.
    const recaudado = result.saldadas.reduce((a, c) => a + c.monto, 0);

    // Emite el comprobante (recibo) con el importe recaudado y el detalle de las
    // cuotas saldadas.
    const comprobante = result.movId
      ? await emitirComprobanteSocio({
          socioId,
          socio: result.socio,
          monto: recaudado,
          detalle: buildDetallePago(result.saldadas),
          metodoPago,
          nroOperacion,
          fecha,
          movimientoCajaId: result.movId,
          emitidoPorId: me.id,
        })
      : null;

    refresh();
    return ok({
      pagadas: result.saldadas.length,
      montoAplicado: monto,
      comprobante,
      movimientoCajaId: result.movId,
    });
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    // Backstop del índice único parcial del autovalúo (N.° de operación repetido
    // entre autovalúos). El pre-chequeo suele atraparlo con un mensaje claro;
    // esto cubre carreras.
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    )
      return fail(
        "Un N.° de operación de autovalúo ya está en uso. Revisa los números ingresados.",
      );
    console.error("pagarPorMonto", e);
    return fail("No se pudo registrar el pago.");
  }
}

// Paga un conjunto de cuotas ELEGIDAS de un mismo socio en una sola operación:
// las marca pagadas, reconoce UN ingreso a caja por el total y emite UN
// comprobante con el detalle de todas. A diferencia de pagarPorMonto (que aplica
// el dinero a las más antiguas automáticamente), aquí el cajero decide qué
// deudas se saldan. El autovalúo se excluye: cada recibo exige su N.° de
// operación único, así que se sigue pagando individualmente con «Pagar».
export async function pagarCuotasSeleccionadas(
  socioId: string,
  cuotaIds: string[],
  input: { metodoPago?: string; fecha?: string; nroOperacion?: string },
): Promise<ActionResult<PagoMultipleResult>> {
  try {
    const me = await authorize("cuotas.pay");
    const ids = Array.from(
      new Set((cuotaIds ?? []).filter((x): x is string => typeof x === "string" && x.length > 0)),
    );
    if (ids.length === 0) return fail("Selecciona al menos una cuota.");
    const metodoPago = input.metodoPago?.trim() || "efectivo";
    const nroOperacion = input.nroOperacion?.trim() || null;
    // pagadoEn es fecha de calendario (medianoche UTC), como el resto del módulo.
    const fecha = inicioDiaUTC(input.fecha);

    const result = await prisma.$transaction(async (tx) => {
      // Serializa con otros pagos del mismo socio (igual que pagarPorMonto).
      await tx.$queryRaw`SELECT id FROM "Socio" WHERE id = ${socioId} FOR UPDATE`;
      const socio = await tx.socio.findUnique({
        where: { id: socioId },
        select: {
          codigo: true,
          numeroDocumento: true,
          apellidoPaterno: true,
          apellidoMaterno: true,
          nombres: true,
        },
      });
      if (!socio) throw new Denied("Socio no encontrado.");

      // Solo cuotas de ESTE socio, de la selección y aún pendientes (evita pagar
      // cuotas de otro socio o ya saldadas/anuladas por una operación concurrente).
      const cuotas = await tx.cuota.findMany({
        where: { id: { in: ids }, socioId, estado: "pendiente" },
        orderBy: [{ periodo: "asc" }],
        select: { id: true, periodo: true, concepto: true, monto: true },
      });
      if (cuotas.length === 0)
        throw new Denied("Las cuotas seleccionadas ya no están pendientes.");
      if (cuotas.some((c) => esAutovaluo(c.concepto)))
        throw new Denied(
          "Quita las cuotas de autovalúo de la selección: se pagan individualmente con «Pagar» para registrar el N.° de su recibo.",
        );

      let recaudado = 0;
      const saldadas: { periodo: string; concepto: string; monto: number }[] = [];
      for (const c of cuotas) {
        const m = toNumber(c.monto);
        // Transición condicional pendiente → pagada: si otra operación ya la pagó
        // o anuló entre la lectura y aquí, no la recontamos.
        const upd = await tx.cuota.updateMany({
          where: { id: c.id, estado: "pendiente" },
          data: {
            estado: "pagada",
            pagadoEn: fecha,
            pagadoMonto: m,
            metodoPago,
            // El N.° de recibo de tesorería queda en CADA cuota saldada (un
            // recibo puede cubrir varias, igual que en el histórico de guardianía).
            ...(nroOperacion ? { nroOperacion } : {}),
            byUserId: me.id,
          },
        });
        if (upd.count === 0) continue;
        recaudado = Math.round((recaudado + m) * 100) / 100;
        saldadas.push({ periodo: c.periodo, concepto: c.concepto, monto: m });
      }
      if (saldadas.length === 0)
        throw new Denied("Las cuotas seleccionadas ya no están pendientes.");

      const movId = await registrarIngresoCuota(tx, {
        monto: recaudado,
        socioId,
        concepto: `Pago de ${saldadas.length} cuota(s) · ${socioNombre(socio)}`,
        fecha,
        metodoPago,
        nroOperacion,
        registradoPorId: me.id,
      });

      return { socio, saldadas, recaudado, movId };
    });

    // Emite UN comprobante con el detalle de todas las cuotas saldadas (se paga
    // el monto exacto de lo seleccionado).
    const comprobante = result.movId
      ? await emitirComprobanteSocio({
          socioId,
          socio: result.socio,
          monto: result.recaudado,
          detalle: buildDetallePago(result.saldadas),
          metodoPago,
          nroOperacion,
          fecha,
          movimientoCajaId: result.movId,
          emitidoPorId: me.id,
        })
      : null;

    refresh();
    return ok({
      pagadas: result.saldadas.length,
      montoTotal: result.recaudado,
      comprobante,
      movimientoCajaId: result.movId,
    });
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("pagarCuotasSeleccionadas", e);
    return fail("No se pudo registrar el pago.");
  }
}

// Busca socios para el selector de "Aplicar deuda a socios". Tokeniza y normaliza
// el texto (igual criterio que listSocios) y matchea contra searchKey, así el
// orden de las palabras y los acentos no importan. Top 50 por apellido.
export async function buscarSociosParaDeuda(
  q: string,
): Promise<ActionResult<SocioPick[]>> {
  try {
    await authorize("cuotas.write");
    const tokens = splitSearchTokens(q).map(normalizeToken);
    const where: Prisma.SocioWhereInput =
      tokens.length > 0
        ? { AND: tokens.map((t) => ({ searchKey: { contains: t } })) }
        : {};
    const socios = await prisma.socio.findMany({
      where,
      orderBy: [{ apellidoPaterno: "asc" }, { nombres: "asc" }],
      take: 50,
      select: {
        id: true,
        codigo: true,
        numeroDocumento: true,
        apellidoPaterno: true,
        apellidoMaterno: true,
        nombres: true,
        estado: true,
      },
    });
    return ok(
      socios.map((s) => ({
        id: s.id,
        codigo: s.codigo,
        nombre: socioNombre(s),
        documento: s.numeroDocumento,
        estado: s.estado,
      })),
    );
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("buscarSociosParaDeuda", e);
    return fail("No se pudo buscar socios.");
  }
}

// Aplica una deuda (cuota pendiente) a un conjunto ELEGIDO de socios. A diferencia
// de generarCuotasPeriodo (que cobra a todos los socios activos), aquí el cargo va
// solo a los socios seleccionados — para multas, derramas o conceptos puntuales.
// Idempotente: la unique (socioId, periodo, concepto) evita recargar a quien ya la
// tiene; esos se reportan como "omitidas".
export async function aplicarDeudaASocios(
  input: AplicarDeudaInput,
): Promise<ActionResult<{ creadas: number; omitidas: number; invalidos: number }>> {
  try {
    const me = await authorize("cuotas.write");
    const socioIds = Array.from(
      new Set((input.socioIds ?? []).filter((x): x is string => typeof x === "string" && x.length > 0)),
    );
    const concepto = input.concepto?.trim();
    const periodo = input.periodo?.trim();
    const monto = Number(input.monto);
    const fe: Record<string, string> = {};
    if (socioIds.length === 0) fe.socios = "Selecciona al menos un socio.";
    if (!concepto) fe.concepto = "Indica el concepto de la deuda.";
    if (!periodo) fe.periodo = "Indica el periodo (p. ej. 2025, 2026-06).";
    if (isNaN(monto) || monto <= 0) fe.monto = "Monto inválido.";
    if (Object.keys(fe).length > 0) return fail("Revisa los campos marcados.", fe);

    // vencimiento es fecha de calendario (medianoche UTC), como en generarCuotas.
    const vencimiento = input.vencimiento ? inicioDiaUTC(input.vencimiento) : null;

    // Descarta IDs que no correspondan a un socio real (p. ej. un socio borrado
    // mientras el modal estaba abierto). Esos se reportan como "invalidos" para
    // que el operador sepa que parte de su selección no recibió el cargo.
    const existentes = await prisma.socio.findMany({
      where: { id: { in: socioIds } },
      select: { id: true },
    });
    const invalidos = socioIds.length - existentes.length;
    if (existentes.length === 0)
      return fail("Ningún socio válido en la selección.");

    const result = await prisma.cuota.createMany({
      data: existentes.map((s) => ({
        socioId: s.id,
        periodo: periodo!,
        concepto: concepto!,
        monto: Math.round(monto * 100) / 100,
        vencimiento,
        createdById: me.id,
      })),
      skipDuplicates: true,
    });

    refresh();
    return ok({
      creadas: result.count,
      omitidas: existentes.length - result.count,
      invalidos,
    });
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("aplicarDeudaASocios", e);
    return fail("No se pudo aplicar la deuda.");
  }
}

export async function generarCuotasPeriodo(
  input: GenerarCuotasInput,
): Promise<ActionResult<{ creadas: number; existentes: number }>> {
  try {
    const me = await authorize("cuotas.write");
    const periodo = (input.periodo ?? "").trim();
    const fe: Record<string, string> = {};
    if (!PERIODO_RE.test(periodo)) fe.periodo = "Usa el formato AAAA-MM.";
    const monto = Number(input.monto);
    if (isNaN(monto) || monto <= 0) fe.monto = "Monto inválido.";
    if (Object.keys(fe).length > 0)
      return fail("Revisa los campos marcados.", fe);

    const concepto = input.concepto?.trim() || `Cuota mensual ${periodo}`;
    // vencimiento es una fecha de CALENDARIO (medianoche UTC), como el resto del
    // sistema, para no correrse un día al mostrarse con fechaCorta (UTC).
    const vencimiento = input.vencimiento
      ? inicioDiaUTC(input.vencimiento)
      : null;

    const activos = await prisma.socio.findMany({
      where: { estado: "activo" },
      select: { id: true },
    });
    if (activos.length === 0)
      return fail("No hay socios activos para generar cuotas.");

    // Omite a los socios que YA tienen una cuota de este periodo, sin importar el
    // concepto: regenerar el mismo mes con otro concepto NO debe duplicar el
    // cobro. (El índice único es (socioId, periodo, concepto), así que un
    // concepto distinto se colaría como segunda cuota del mes; este filtro de
    // nivel-periodo lo evita.)
    const conPeriodo = await prisma.cuota.findMany({
      where: { periodo, socioId: { in: activos.map((s) => s.id) } },
      select: { socioId: true },
      distinct: ["socioId"],
    });
    const yaTienen = new Set(conPeriodo.map((c) => c.socioId));
    const objetivo = activos.filter((s) => !yaTienen.has(s.id));
    if (objetivo.length === 0)
      return ok({ creadas: 0, existentes: activos.length });

    const result = await prisma.cuota.createMany({
      data: objetivo.map((s) => ({
        socioId: s.id,
        periodo,
        concepto,
        monto: Math.round(monto * 100) / 100,
        vencimiento,
        createdById: me.id,
      })),
      skipDuplicates: true,
    });

    refresh();
    return ok({
      creadas: result.count,
      existentes: activos.length - result.count,
    });
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("generarCuotasPeriodo", e);
    return fail("No se pudieron generar las cuotas.");
  }
}

export async function registrarPago(
  cuotaId: string,
  input: RegistrarPagoInput,
): Promise<
  ActionResult<{
    comprobante: ComprobanteRef | null;
    movimientoCajaId: string | null;
  }>
> {
  try {
    const me = await authorize("cuotas.pay");
    const cuota = await prisma.cuota.findUnique({
      where: { id: cuotaId },
      select: {
        socioId: true,
        estado: true,
        monto: true,
        periodo: true,
        concepto: true,
        socio: {
          select: {
            codigo: true,
            numeroDocumento: true,
            apellidoPaterno: true,
            apellidoMaterno: true,
            nombres: true,
          },
        },
      },
    });
    if (!cuota) return fail("Cuota no encontrada.");
    if (cuota.estado === "anulada")
      return fail("No se puede pagar una cuota anulada.");
    if (cuota.estado === "pagada") return fail("La cuota ya está pagada.");

    // Lo que se recauda por la cuota es siempre su monto nominal.
    const cuotaMonto = toNumber(cuota.monto);

    // Monto entregado: por defecto el de la cuota. No se maneja saldo a favor, así
    // que debe ser EXACTAMENTE el de la cuota (ni menos ni más).
    if (input.monto != null) {
      const m = Number(input.monto);
      if (isNaN(m) || m < 0) return fail("Monto inválido.");
      if (m + 1e-9 < cuotaMonto)
        return fail("El monto entregado es menor al de la cuota.");
      if (m > cuotaMonto + 1e-9)
        return fail(
          `El monto no puede exceder el de la cuota (S/ ${cuotaMonto.toFixed(2)}). No se maneja saldo a favor.`,
        );
    }
    const montoEntregado = cuotaMonto;

    // pagadoEn es una fecha de calendario (la del comprobante): medianoche UTC,
    // para mostrarse con fechaCorta sin correrse un día en Perú (UTC-5).
    const fecha = inicioDiaUTC(input.fecha);
    const metodoPago = input.metodoPago?.trim() || "efectivo";
    let nroOperacion = input.nroOperacion?.trim() || null;

    // Autovalúo: el N.° de operación del recibo es obligatorio y NO puede
    // reusarse en otra cuota de autovalúo (otro año/socio). El índice único
    // parcial es el respaldo duro; esta validación da el mensaje claro.
    const autovaluo = esAutovaluo(cuota.concepto);
    if (autovaluo) {
      if (!nroOperacion)
        return fail("Para el autovalúo, ingresa el N.° de operación del recibo.", {
          nroOperacion: "Obligatorio para autovalúo.",
        });
      // Forma canónica (mayúsculas, sin espacios) para que "a-1", "A-1" y "A 1"
      // no se cuelen como distintos. Se compara y se guarda normalizado, así el
      // índice único (sobre la columna cruda) opera sobre la forma canónica.
      nroOperacion = normalizaNroOperacion(nroOperacion);
      const dup = await prisma.cuota.findFirst({
        where: {
          id: { not: cuotaId },
          nroOperacion,
          concepto: { contains: AUTOVALUO_TOKEN, mode: "insensitive" },
        },
        select: {
          periodo: true,
          concepto: true,
          socio: { select: { codigo: true } },
        },
      });
      if (dup)
        return fail(
          `Ese N.° de operación ya se registró en «${dup.concepto}» (${dup.periodo}, socio ${dup.socio.codigo}). No se puede reusar el mismo recibo de autovalúo.`,
          { nroOperacion: "Ya usado en otro autovalúo." },
        );
    }

    const result = await prisma.$transaction(async (tx) => {
      // Transición pendiente → pagada condicional: si otra operación ya la pagó
      // o anuló, no se reaplica (evita un ingreso duplicado en caja).
      const upd = await tx.cuota.updateMany({
        where: { id: cuotaId, estado: "pendiente" },
        data: {
          estado: "pagada",
          pagadoEn: fecha,
          pagadoMonto: cuotaMonto,
          metodoPago,
          nroOperacion,
          byUserId: me.id,
        },
      });
      if (upd.count === 0) return null;
      // Ingreso a caja por el monto nominal de la cuota saldada.
      const movId = await registrarIngresoCuota(tx, {
        monto: cuotaMonto,
        socioId: cuota.socioId,
        concepto: `Pago cuota ${cuota.periodo} · ${socioNombre(cuota.socio)}`,
        fecha,
        metodoPago,
        nroOperacion,
        registradoPorId: me.id,
      });
      return { movId };
    });

    if (!result) return fail("La cuota ya está pagada.");

    const comprobante = await emitirComprobanteSocio({
      socioId: cuota.socioId,
      socio: cuota.socio,
      monto: montoEntregado,
      detalle: buildDetallePago([
        { periodo: cuota.periodo, concepto: cuota.concepto, monto: cuotaMonto },
      ]),
      metodoPago,
      nroOperacion,
      fecha,
      movimientoCajaId: result.movId,
      emitidoPorId: me.id,
    });

    refresh();
    return ok({ comprobante, movimientoCajaId: result.movId });
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    // Carrera contra el índice único parcial de autovalúo (dos pagos con el
    // mismo N.° de operación a la vez): se gana al primero, el segundo cae aquí.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return fail(
        "Ese N.° de operación ya está registrado en otro autovalúo. No se puede reusar el mismo recibo.",
        { nroOperacion: "Ya usado en otro autovalúo." },
      );
    console.error("registrarPago", e);
    return fail("No se pudo registrar el pago.");
  }
}

// Reemite el comprobante de un pago cuya emisión falló (el pago YA quedó
// registrado, con su MovimientoCaja de origen "cuota"). Idempotente por
// movimientoCajaId: si ya existe, devuelve el mismo sin duplicar. Da una vía de
// recuperación en lugar de dejar el pago sin recibo imprimible.
export async function reemitirComprobantePago(
  movimientoCajaId: string,
): Promise<ActionResult<ComprobanteRef>> {
  try {
    const me = await authorize("cuotas.pay");
    const mov = await prisma.movimientoCaja.findUnique({
      where: { id: movimientoCajaId },
      select: {
        id: true,
        monto: true,
        concepto: true,
        metodoPago: true,
        nroOperacion: true,
        origen: true,
        socio: {
          select: {
            id: true,
            codigo: true,
            numeroDocumento: true,
            apellidoPaterno: true,
            apellidoMaterno: true,
            nombres: true,
          },
        },
      },
    });
    if (!mov || mov.origen !== "cuota" || !mov.socio)
      return fail("Movimiento no válido para emitir un comprobante.");
    const comprobante = await emitirComprobantePago({
      socioId: mov.socio.id,
      socioCodigo: mov.socio.codigo,
      socioNombre: socioNombre(mov.socio),
      numeroDocumento: mov.socio.numeroDocumento,
      monto: toNumber(mov.monto),
      metodoPago: mov.metodoPago,
      nroOperacion: mov.nroOperacion,
      detalle: mov.concepto,
      movimientoCajaId: mov.id,
      emitidoPorId: me.id,
    });
    if (!comprobante) return fail("No se pudo emitir el comprobante.");
    refresh();
    return ok(comprobante);
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("reemitirComprobantePago", e);
    return fail("No se pudo emitir el comprobante.");
  }
}

export async function anularCuota(cuotaId: string): Promise<ActionResult> {
  try {
    await authorize("cuotas.write");
    // Transición condicional pendiente → anulada. Sin el WHERE sobre estado,
    // una llamada concurrente de registrarPago/pagarPorMonto podría pagar la
    // cuota entre la lectura y la escritura, y este update pisaría una cuota
    // legítimamente pagada (corrompiendo el historial contable). El updateMany
    // condicional elimina esa carrera (mismo patrón que registrarPago).
    const upd = await prisma.cuota.updateMany({
      where: { id: cuotaId, estado: "pendiente" },
      data: { estado: "anulada" },
    });
    if (upd.count === 0) {
      const cuota = await prisma.cuota.findUnique({
        where: { id: cuotaId },
        select: { estado: true },
      });
      if (!cuota) return fail("Cuota no encontrada.");
      if (cuota.estado === "pagada")
        return fail("No se puede anular una cuota ya pagada.");
      return fail("La cuota ya estaba anulada.");
    }
    refresh();
    return ok();
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("anularCuota", e);
    return fail("No se pudo anular la cuota.");
  }
}

// Exonera (perdona) una cuota pendiente: deja de ser deuda pero NO es un pago
// (no entra a caja ni emite comprobante). Exige una descripción/motivo que queda
// registrada. La usa tesorería/administración para condonar cuotas puntuales.
export async function exonerarCuota(
  cuotaId: string,
  motivo: string,
): Promise<ActionResult> {
  try {
    const me = await authorize("cuotas.write");
    const desc = motivo.trim();
    if (!desc)
      return fail("Indica el motivo de la exoneración.", {
        motivo: "El motivo es obligatorio.",
      });
    if (desc.length > 500)
      return fail("El motivo es demasiado largo (máx. 500 caracteres).");
    // Transición condicional pendiente → exonerada (misma protección de carrera
    // que anularCuota: no pisar una cuota que se acaba de pagar).
    const upd = await prisma.cuota.updateMany({
      where: { id: cuotaId, estado: "pendiente" },
      data: { estado: "exonerada", motivo: desc, byUserId: me.id },
    });
    if (upd.count === 0) {
      const cuota = await prisma.cuota.findUnique({
        where: { id: cuotaId },
        select: { estado: true },
      });
      if (!cuota) return fail("Cuota no encontrada.");
      if (cuota.estado === "pagada")
        return fail("No se puede exonerar una cuota ya pagada.");
      if (cuota.estado === "exonerada")
        return fail("La cuota ya estaba exonerada.");
      return fail("Solo se pueden exonerar cuotas pendientes.");
    }
    refresh();
    return ok();
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("exonerarCuota", e);
    return fail("No se pudo exonerar la cuota.");
  }
}

// Revierte una exoneración: la cuota vuelve a estar pendiente (deuda) y se borra
// el motivo. Útil si se exoneró por error.
export async function revertirExoneracion(
  cuotaId: string,
): Promise<ActionResult> {
  try {
    await authorize("cuotas.write");
    const upd = await prisma.cuota.updateMany({
      where: { id: cuotaId, estado: "exonerada" },
      data: { estado: "pendiente", motivo: null },
    });
    if (upd.count === 0) return fail("La cuota no está exonerada.");
    refresh();
    return ok();
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("revertirExoneracion", e);
    return fail("No se pudo revertir la exoneración.");
  }
}

export async function getCuotaStats(): Promise<ActionResult<CuotaStats>> {
  try {
    await authorize("cuotas.read");
    const [pendiente, recaudado, conDeuda] = await Promise.all([
      prisma.cuota.aggregate({
        where: { estado: "pendiente" },
        _sum: { monto: true },
        _count: { _all: true },
      }),
      prisma.cuota.aggregate({
        where: { estado: "pagada" },
        _sum: { pagadoMonto: true },
      }),
      prisma.cuota.findMany({
        where: { estado: "pendiente" },
        distinct: ["socioId"],
        select: { socioId: true },
      }),
    ]);
    return ok({
      pendienteMonto: toNumber(pendiente._sum.monto),
      pendienteCount: pendiente._count._all,
      recaudadoMonto: toNumber(recaudado._sum.pagadoMonto),
      sociosConDeuda: conDeuda.length,
    });
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("getCuotaStats", e);
    return fail("No se pudieron cargar las estadísticas.");
  }
}
