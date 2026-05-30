"use server";

import { revalidatePath } from "next/cache";
import { Prisma, type EstadoCuota } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/server";
import type { PermissionKey } from "@/lib/auth/permissions";
import { toNumber } from "@/lib/money";
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
      where.socio = {
        OR: [
          { apellidoPaterno: { contains: q, mode: "insensitive" } },
          { apellidoMaterno: { contains: q, mode: "insensitive" } },
          { nombres: { contains: q, mode: "insensitive" } },
          { numeroDocumento: { contains: q, mode: "insensitive" } },
          { codigo: { contains: q, mode: "insensitive" } },
        ],
      };
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
    const [cuotas, socio] = await Promise.all([
      prisma.cuota.findMany({
        where: { socioId },
        orderBy: [{ periodo: "desc" }],
        include: { socio: { select: SOCIO_SELECT } },
      }),
      prisma.socio.findUnique({
        where: { id: socioId },
        select: { saldoAFavor: true },
      }),
    ]);
    const deuda = cuotas
      .filter((c) => c.estado === "pendiente")
      .reduce((acc, c) => acc + toNumber(c.monto), 0);
    return ok({
      deuda,
      saldoAFavor: toNumber(socio?.saldoAFavor),
      canPay: me.permissions.has("cuotas.pay"),
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
  input: { monto: number; metodoPago?: string; fecha?: string },
): Promise<ActionResult<PagoPorMontoResult>> {
  try {
    const me = await authorize("cuotas.pay");
    const monto = Number(input.monto);
    if (isNaN(monto) || monto < 0) return fail("Monto inválido.");
    const metodoPago = input.metodoPago?.trim() || "efectivo";
    const fecha = input.fecha ? new Date(input.fecha) : new Date();

    const result = await prisma.$transaction(async (tx) => {
      // Bloquea la fila del socio para serializar pagos concurrentes del mismo
      // socio: sin esto, dos pagos simultáneos leen el mismo saldoAFavor y el
      // último en escribir pisa al otro (lost update → dinero perdido).
      await tx.$queryRaw`SELECT id FROM "Socio" WHERE id = ${socioId} FOR UPDATE`;
      const socio = await tx.socio.findUnique({
        where: { id: socioId },
        select: { saldoAFavor: true },
      });
      if (!socio) throw new Denied("Socio no encontrado.");

      // Pozo = saldo a favor previo + lo que paga ahora.
      let pozo = toNumber(socio.saldoAFavor) + monto;

      // Cuotas pendientes, de la más antigua a la más reciente.
      const pendientes = await tx.cuota.findMany({
        where: { socioId, estado: "pendiente" },
        orderBy: [{ periodo: "asc" }],
        select: { id: true, monto: true },
      });

      let pagadas = 0;
      for (const c of pendientes) {
        const m = toNumber(c.monto);
        if (pozo + 1e-9 >= m) {
          await tx.cuota.update({
            where: { id: c.id },
            data: {
              estado: "pagada",
              pagadoEn: fecha,
              pagadoMonto: m,
              metodoPago,
              byUserId: me.id,
            },
          });
          pozo = Math.round((pozo - m) * 100) / 100;
          pagadas++;
        } else {
          break; // no alcanza para la siguiente cuota completa
        }
      }

      await tx.socio.update({
        where: { id: socioId },
        data: { saldoAFavor: pozo },
      });

      return { pagadas, saldoAFavor: pozo, montoAplicado: monto };
    });

    refresh();
    return ok(result);
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("pagarPorMonto", e);
    return fail("No se pudo registrar el pago.");
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
    const vencimiento = input.vencimiento ? new Date(input.vencimiento) : null;

    const activos = await prisma.socio.findMany({
      where: { estado: "activo" },
      select: { id: true },
    });
    if (activos.length === 0)
      return fail("No hay socios activos para generar cuotas.");

    const result = await prisma.cuota.createMany({
      data: activos.map((s) => ({
        socioId: s.id,
        periodo,
        concepto,
        monto,
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
): Promise<ActionResult> {
  try {
    const me = await authorize("cuotas.pay");
    const cuota = await prisma.cuota.findUnique({
      where: { id: cuotaId },
      select: { socioId: true, estado: true, monto: true },
    });
    if (!cuota) return fail("Cuota no encontrada.");
    if (cuota.estado === "anulada")
      return fail("No se puede pagar una cuota anulada.");
    if (cuota.estado === "pagada") return fail("La cuota ya está pagada.");

    // Lo que se recauda por la cuota es siempre su monto nominal.
    const cuotaMonto = toNumber(cuota.monto);

    // Monto entregado: por defecto el de la cuota. Si se especifica debe ser
    // válido (no negativo) y cubrir al menos la cuota; el excedente se acredita
    // como saldo a favor del socio, igual que en pagarPorMonto.
    let excedente = 0;
    if (input.monto != null) {
      const m = Number(input.monto);
      if (isNaN(m) || m < 0) return fail("Monto inválido.");
      if (m + 1e-9 < cuotaMonto)
        return fail("El monto entregado es menor al de la cuota.");
      excedente = Math.round((m - cuotaMonto) * 100) / 100;
    }

    const fecha = input.fecha ? new Date(input.fecha) : new Date();
    const metodoPago = input.metodoPago?.trim() || "efectivo";

    const aplicado = await prisma.$transaction(async (tx) => {
      // Transición pendiente → pagada condicional: si otra operación ya la pagó
      // o anuló, no se reaplica (evita doble acreditación del excedente).
      const upd = await tx.cuota.updateMany({
        where: { id: cuotaId, estado: "pendiente" },
        data: {
          estado: "pagada",
          pagadoEn: fecha,
          pagadoMonto: cuotaMonto,
          metodoPago,
          byUserId: me.id,
        },
      });
      if (upd.count === 0) return false;
      if (excedente > 0) {
        await tx.socio.update({
          where: { id: cuota.socioId },
          data: { saldoAFavor: { increment: excedente } },
        });
      }
      return true;
    });

    if (!aplicado) return fail("La cuota ya está pagada.");
    refresh();
    return ok();
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("registrarPago", e);
    return fail("No se pudo registrar el pago.");
  }
}

export async function anularCuota(cuotaId: string): Promise<ActionResult> {
  try {
    await authorize("cuotas.write");
    const cuota = await prisma.cuota.findUnique({
      where: { id: cuotaId },
      select: { estado: true },
    });
    if (!cuota) return fail("Cuota no encontrada.");
    if (cuota.estado === "pagada")
      return fail("No se puede anular una cuota ya pagada.");
    await prisma.cuota.update({
      where: { id: cuotaId },
      data: { estado: "anulada" },
    });
    refresh();
    return ok();
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("anularCuota", e);
    return fail("No se pudo anular la cuota.");
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
