"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/server";
import type { PermissionKey } from "@/lib/auth/permissions";
import { searchKeyAnd, normalizeToken } from "@/lib/socios/normalize";
import { toNumber } from "@/lib/money";
import { hoyISOPeru } from "@/lib/fecha";
import type {
  ActionResult,
  ListPagosParams,
  ListPagosResult,
  PagoRow,
  GuardianiaStats,
  IngresoMes,
  DeudaRow,
  DeudaResult,
  RegistrarPagoInput,
  PuestoPick,
  CargosResumen,
} from "./types";

const PAGE_SIZE = 25;
const PAGE_SIZES = [25, 50, 100];
const clampSize = (n?: number) => (n && PAGE_SIZES.includes(n) ? n : PAGE_SIZE);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

class Denied extends Error {
  constructor(m: string) {
    super(m);
    this.name = "Denied";
  }
}
async function authorize(perm: PermissionKey): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new Denied("No autenticado.");
  if (!user.permissions.has(perm)) throw new Denied("No tienes permiso para esta acción.");
  return user;
}
const fail = (error: string, fieldErrors?: Record<string, string>): ActionResult =>
  ({ ok: false, error, fieldErrors });
const ok = <T>(data?: T): ActionResult<T> => ({ ok: true, data });
const refresh = () => revalidatePath("/guardiania");

// "YYYY-MM-DD" → medianoche UTC (fecha de calendario, ver src/lib/fecha.ts).
const parseFecha = (s: string): Date => new Date(`${s}T00:00:00.000Z`);
const monthIndex = (periodo: string): number => {
  const [y, m] = periodo.split("-").map(Number);
  return y * 12 + (m - 1);
};

function fechaRange(desde?: string, hasta?: string): Prisma.DateTimeFilter | undefined {
  const f: Prisma.DateTimeFilter = {};
  if (desde && ISO_DATE.test(desde)) f.gte = new Date(`${desde}T00:00:00.000Z`);
  if (hasta && ISO_DATE.test(hasta)) f.lte = new Date(`${hasta}T23:59:59.999Z`);
  return f.gte || f.lte ? f : undefined;
}

function buildWhere(p: ListPagosParams): Prisma.GuardianiaPagoWhereInput {
  const where: Prisma.GuardianiaPagoWhereInput = {};
  const and = searchKeyAnd(p.q);
  if (and.length) where.AND = and;
  if (p.periodo && ISO_MONTH.test(p.periodo)) where.periodo = p.periodo;
  if (p.bloque) where.bloque = p.bloque;
  const fecha = fechaRange(p.desde, p.hasta);
  if (fecha) where.fecha = fecha;
  return where;
}

function toRow(r: {
  id: string; fecha: Date; nroRecibo: string | null; periodo: string;
  mesEtiqueta: string | null; importe: Prisma.Decimal; socioId: string | null;
  socioNombre: string; numeroPadron: number | null; puestoId: string | null;
  bloque: string | null; numeroPuesto: number | null; parcela: string | null;
  metodoPago: string | null; origen: PagoRow["origen"]; observacion: string | null;
}): PagoRow {
  return {
    id: r.id,
    fecha: r.fecha.toISOString().slice(0, 10),
    nroRecibo: r.nroRecibo,
    periodo: r.periodo,
    mesEtiqueta: r.mesEtiqueta,
    importe: toNumber(r.importe),
    socioId: r.socioId,
    socioNombre: r.socioNombre,
    numeroPadron: r.numeroPadron,
    puestoId: r.puestoId,
    bloque: r.bloque,
    numeroPuesto: r.numeroPuesto,
    parcela: r.parcela,
    metodoPago: r.metodoPago,
    origen: r.origen,
    observacion: r.observacion,
  };
}

export async function listPagos(params: ListPagosParams): Promise<ActionResult<ListPagosResult>> {
  try {
    await authorize("guardiania.read");
    const where = buildWhere(params);
    const page = Math.max(1, params.page ?? 1);
    const pageSize = clampSize(params.pageSize);
    const [total, rows, agg] = await Promise.all([
      prisma.guardianiaPago.count({ where }),
      prisma.guardianiaPago.findMany({
        where,
        orderBy: [{ fecha: "desc" }, { nroRecibo: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.guardianiaPago.aggregate({ where, _sum: { importe: true } }),
    ]);
    return ok<ListPagosResult>({
      items: rows.map(toRow),
      total,
      page,
      pageSize,
      sumaFiltrada: toNumber(agg._sum.importe),
    });
  } catch (e) {
    return fail(e instanceof Denied ? e.message : "No se pudieron listar los pagos.");
  }
}

export async function getGuardianiaStats(): Promise<ActionResult<GuardianiaStats>> {
  try {
    await authorize("guardiania.read");
    const [tot, nPagos, recibos, porCobro, porCubierto] = await Promise.all([
      prisma.guardianiaPago.aggregate({ _sum: { importe: true } }),
      prisma.guardianiaPago.count(),
      prisma.guardianiaPago.findMany({
        where: { nroRecibo: { not: null } },
        distinct: ["nroRecibo"],
        select: { nroRecibo: true },
      }),
      prisma.$queryRawUnsafe<{ mes: string; monto: number; n: bigint }[]>(
        `SELECT to_char("fecha",'YYYY-MM') mes, SUM("importe")::float monto, COUNT(*) n
         FROM "GuardianiaPago" GROUP BY 1 ORDER BY 1`,
      ),
      prisma.$queryRawUnsafe<{ mes: string; monto: number; n: bigint }[]>(
        `SELECT "periodo" mes, SUM("importe")::float monto, COUNT(*) n
         FROM "GuardianiaPago" GROUP BY 1 ORDER BY 1`,
      ),
    ]);
    const map = (arr: { mes: string; monto: number; n: bigint }[]): IngresoMes[] =>
      arr.map((r) => ({ mes: r.mes, monto: Math.round(r.monto * 100) / 100, count: Number(r.n) }));
    const porMesCobro = map(porCobro);
    const cobrado12m = porMesCobro.slice(-12).reduce((s, m) => s + m.monto, 0);
    return ok<GuardianiaStats>({
      totalCobrado: toNumber(tot._sum.importe),
      cobrado12m: Math.round(cobrado12m * 100) / 100,
      nRecibos: recibos.length,
      nPagos,
      porMesCobro,
      porMesCubierto: map(porCubierto),
    });
  } catch (e) {
    return fail(e instanceof Denied ? e.message : "No se pudieron calcular las estadísticas.");
  }
}

// Morosidad por puesto oficial: meses esperados (desde inicioPeriodo hasta el mes
// actual) − meses cubiertos por algún pago. Estima la deuda a la tarifa vigente.
export async function listDeudas(soloMorosos = false): Promise<ActionResult<DeudaResult>> {
  try {
    await authorize("guardiania.read");
    const nowIdx = monthIndex(hoyISOPeru().slice(0, 7));
    const cuentas = await prisma.guardianiaCuenta.findMany({
      where: { activo: true },
      include: {
        puesto: { select: { codigo: true, bloque: true, numero: true } },
        socio: { select: { apellidoPaterno: true, apellidoMaterno: true, nombres: true } },
      },
    });
    const puestoIds = cuentas.map((c) => c.puestoId);
    const pagos = await prisma.guardianiaPago.findMany({
      where: { puestoId: { in: puestoIds } },
      select: { puestoId: true, periodo: true, importe: true },
    });
    const cubiertos = new Map<string, Set<string>>();
    const cobrado = new Map<string, number>();
    for (const p of pagos) {
      if (!p.puestoId) continue;
      (cubiertos.get(p.puestoId) ?? cubiertos.set(p.puestoId, new Set()).get(p.puestoId)!).add(p.periodo);
      cobrado.set(p.puestoId, (cobrado.get(p.puestoId) ?? 0) + toNumber(p.importe));
    }
    const items: DeudaRow[] = cuentas.map((c) => {
      const startIdx = monthIndex(c.inicioPeriodo);
      const esperados = Math.max(0, nowIdx - startIdx + 1);
      const setP = cubiertos.get(c.puestoId) ?? new Set<string>();
      let cub = 0;
      for (const per of setP) {
        const idx = monthIndex(per);
        if (idx >= startIdx && idx <= nowIdx) cub++;
      }
      const debidos = Math.max(0, esperados - cub);
      const tarifa = toNumber(c.tarifaMensual);
      const nombre = c.socio
        ? `${c.socio.apellidoPaterno} ${c.socio.apellidoMaterno ?? ""}, ${c.socio.nombres}`.replace(/\s+,/, ",")
        : "—";
      return {
        cuentaId: c.id,
        puestoId: c.puestoId,
        puestoCodigo: c.puesto.codigo,
        bloque: c.puesto.bloque,
        numero: c.puesto.numero,
        socioId: c.socioId,
        socioNombre: nombre,
        numeroPadron: null,
        tarifaMensual: tarifa,
        inicioPeriodo: c.inicioPeriodo,
        mesesEsperados: esperados,
        mesesCubiertos: cub,
        mesesDebidos: debidos,
        deuda: Math.round(debidos * tarifa * 100) / 100,
        cobradoTotal: Math.round((cobrado.get(c.puestoId) ?? 0) * 100) / 100,
        activo: c.activo,
      };
    });
    items.sort((a, b) => b.deuda - a.deuda);
    const filtered = soloMorosos ? items.filter((i) => i.deuda > 0) : items;
    return ok<DeudaResult>({
      items: filtered,
      deudaTotal: Math.round(items.reduce((s, i) => s + i.deuda, 0) * 100) / 100,
      morososCount: items.filter((i) => i.deuda > 0).length,
      cuentas: items.length,
    });
  } catch (e) {
    return fail(e instanceof Denied ? e.message : "No se pudo calcular la morosidad.");
  }
}

const CONCEPTO_PREFIJO = "Guardianía · ";
// "YYYY-MM" a partir del índice de mes (inverso de monthIndex).
const periodoFromIndex = (idx: number): string =>
  `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
// Último día del mes "YYYY-MM" a medianoche UTC (fecha de calendario).
const finDeMes = (periodo: string): Date => {
  const [y, m] = periodo.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0, 0, 0, 0, 0)); // día 0 del mes m (0-based=m) = último del mes m-1 (1-based)
};

// Genera cargos (Cuota) de guardianía por socio a partir de las cuentas por
// puesto. Un cargo por mes desde inicioPeriodo hasta el mes actual: `pagada` si
// el mes tiene algún GuardianiaPago (mismo criterio que el tab de Deudas),
// `pendiente` si no. Idempotente vía la unique(socioId, periodo, concepto) +
// skipDuplicates. Con commit:false solo calcula el resumen (preview).
export async function generarCargosGuardiania(
  input: { commit: boolean },
): Promise<ActionResult<CargosResumen>> {
  try {
    const me = await authorize("guardiania.write");
    const hasta = hoyISOPeru().slice(0, 7);
    const hastaIdx = monthIndex(hasta);

    const [cuentas, cuentasSinSocio] = await Promise.all([
      prisma.guardianiaCuenta.findMany({
        where: { activo: true, socioId: { not: null } },
        select: {
          puestoId: true, socioId: true, tarifaMensual: true, inicioPeriodo: true,
          puesto: { select: { codigo: true } },
        },
      }),
      prisma.guardianiaCuenta.count({ where: { activo: true, socioId: null } }),
    ]);

    const puestoIds = cuentas.map((c) => c.puestoId);
    const pagos = await prisma.guardianiaPago.findMany({
      where: { puestoId: { in: puestoIds } },
      select: { puestoId: true, periodo: true, importe: true, fecha: true, metodoPago: true, nroRecibo: true },
    });
    // puestoId → periodo → { monto sumado, fecha/método/recibo del pago más reciente }
    const cobertura = new Map<string, Map<string, { monto: number; fecha: Date; metodo: string | null; recibo: string | null }>>();
    for (const p of pagos) {
      if (!p.puestoId) continue;
      const perMap = cobertura.get(p.puestoId) ?? cobertura.set(p.puestoId, new Map()).get(p.puestoId)!;
      const prev = perMap.get(p.periodo);
      if (!prev) {
        perMap.set(p.periodo, { monto: toNumber(p.importe), fecha: p.fecha, metodo: p.metodoPago, recibo: p.nroRecibo });
      } else {
        prev.monto += toNumber(p.importe);
        if (p.fecha > prev.fecha) { prev.fecha = p.fecha; prev.metodo = p.metodoPago; prev.recibo = p.nroRecibo; }
      }
    }

    // Cuotas de guardianía ya existentes (para no duplicar ni pisar pagos/exoneraciones).
    const socioIds = [...new Set(cuentas.map((c) => c.socioId!))];
    const existentes = await prisma.cuota.findMany({
      where: { socioId: { in: socioIds }, concepto: { startsWith: CONCEPTO_PREFIJO } },
      select: { socioId: true, periodo: true, concepto: true },
    });
    const existSet = new Set(existentes.map((c) => `${c.socioId}|${c.periodo}|${c.concepto}`));

    const nuevas: Prisma.CuotaCreateManyInput[] = [];
    let mesesPagados = 0, mesesPendientes = 0, totalPendiente = 0;
    for (const c of cuentas) {
      const concepto = `${CONCEPTO_PREFIJO}${c.puesto.codigo}`;
      const startIdx = monthIndex(c.inicioPeriodo);
      const tarifa = toNumber(c.tarifaMensual);
      const perMap = cobertura.get(c.puestoId);
      for (let idx = startIdx; idx <= hastaIdx; idx++) {
        const periodo = periodoFromIndex(idx);
        const pago = perMap?.get(periodo);
        if (pago) mesesPagados++; else mesesPendientes++;
        if (existSet.has(`${c.socioId}|${periodo}|${concepto}`)) continue; // ya existe
        if (!pago) totalPendiente += tarifa;
        nuevas.push({
          socioId: c.socioId!,
          periodo,
          concepto,
          monto: new Prisma.Decimal(tarifa),
          vencimiento: finDeMes(periodo),
          estado: pago ? "pagada" : "pendiente",
          pagadoEn: pago ? pago.fecha : null,
          pagadoMonto: pago ? new Prisma.Decimal(Math.round(pago.monto * 100) / 100) : null,
          metodoPago: pago ? pago.metodo : null,
          nroOperacion: pago ? pago.recibo : null,
          createdById: me.id,
        });
      }
    }

    let creadas = 0;
    if (input.commit && nuevas.length) {
      const CHUNK = 500;
      for (let i = 0; i < nuevas.length; i += CHUNK) {
        const res = await prisma.cuota.createMany({ data: nuevas.slice(i, i + CHUNK), skipDuplicates: true });
        creadas += res.count;
      }
      refresh();
      revalidatePath("/socios");
    }

    const totalPlan = mesesPagados + mesesPendientes;
    return ok<CargosResumen>({
      commit: input.commit,
      cuentas: cuentas.length,
      socios: socioIds.length,
      mesesPagados,
      mesesPendientes,
      cuotasNuevas: nuevas.length,
      cuotasExistentes: totalPlan - nuevas.length,
      creadas,
      totalPendiente: Math.round(totalPendiente * 100) / 100,
      cuentasSinSocio,
      hasta,
    });
  } catch (e) {
    return fail(e instanceof Denied ? e.message : "No se pudieron generar los cargos de guardianía.");
  }
}

export async function buscarPuestosGuardiania(q: string): Promise<ActionResult<PuestoPick[]>> {
  try {
    await authorize("guardiania.read");
    const term = (q ?? "").trim();
    const cuentas = await prisma.guardianiaCuenta.findMany({
      where: term
        ? {
            OR: [
              { puesto: { codigo: { contains: term, mode: "insensitive" } } },
              { puesto: { searchKey: { contains: normalizeToken(term) } } },
              { socio: { searchKey: { contains: normalizeToken(term) } } },
            ],
          }
        : {},
      include: {
        puesto: { select: { id: true, codigo: true, bloque: true, numero: true } },
        socio: { select: { apellidoPaterno: true, apellidoMaterno: true, nombres: true } },
      },
      take: 20,
      orderBy: { puesto: { codigo: "asc" } },
    });
    return ok<PuestoPick[]>(
      cuentas.map((c) => ({
        id: c.puesto.id,
        codigo: c.puesto.codigo,
        bloque: c.puesto.bloque,
        numero: c.puesto.numero,
        socioId: c.socioId,
        socioNombre: c.socio
          ? `${c.socio.apellidoPaterno} ${c.socio.apellidoMaterno ?? ""}, ${c.socio.nombres}`.replace(/\s+,/, ",")
          : "—",
        tarifa: toNumber(c.tarifaMensual),
      })),
    );
  } catch (e) {
    return fail(e instanceof Denied ? e.message : "No se pudieron buscar puestos.");
  }
}

export async function registrarPago(input: RegistrarPagoInput): Promise<ActionResult<{ id: string }>> {
  try {
    const me = await authorize("guardiania.write");
    const fieldErrors: Record<string, string> = {};
    if (!input.fecha || !ISO_DATE.test(input.fecha)) fieldErrors.fecha = "Fecha inválida (YYYY-MM-DD).";
    if (!input.periodo || !ISO_MONTH.test(input.periodo)) fieldErrors.periodo = "Mes cubierto inválido (YYYY-MM).";
    const importe = Math.round(Number(input.importe) * 100) / 100;
    if (!Number.isFinite(importe) || importe <= 0) fieldErrors.importe = "Importe debe ser mayor a 0.";
    if (Object.keys(fieldErrors).length) return fail("Revisa los campos.", fieldErrors);

    let snap: {
      socioId: string | null; puestoId: string | null; etapa: number | null;
      bloque: string | null; numeroPuesto: number | null; parcela: string | null;
      socioNombre: string; numeroPadron: number | null;
    } = {
      socioId: input.socioId ?? null, puestoId: input.puestoId ?? null, etapa: null,
      bloque: null, numeroPuesto: null, parcela: null, socioNombre: "—", numeroPadron: null,
    };
    if (input.puestoId) {
      const puesto = await prisma.puesto.findUnique({
        where: { id: input.puestoId },
        include: {
          guardianiaCuenta: { include: { socio: { select: { id: true, apellidoPaterno: true, apellidoMaterno: true, nombres: true, numeroPadron: true } } } },
        },
      });
      if (!puesto) return fail("El puesto no existe.", { puestoId: "Puesto inexistente." });
      const s = puesto.guardianiaCuenta?.socio ?? null;
      snap = {
        socioId: input.socioId ?? s?.id ?? null,
        puestoId: puesto.id,
        etapa: puesto.etapa,
        bloque: puesto.bloque,
        numeroPuesto: puesto.numero,
        parcela: puesto.dimension === "d3x5" ? "3*5" : "3*3",
        socioNombre: s ? `${s.apellidoPaterno} ${s.apellidoMaterno ?? ""}, ${s.nombres}`.replace(/\s+,/, ",") : "—",
        numeroPadron: s?.numeroPadron ?? null,
      };
    }

    const searchKey = [snap.socioNombre, input.nroRecibo, snap.bloque, snap.numeroPuesto != null ? String(snap.numeroPuesto) : null, snap.numeroPadron != null ? String(snap.numeroPadron) : null]
      .filter((x): x is string => Boolean(x))
      .map(normalizeToken)
      .join(" ");

    const created = await prisma.guardianiaPago.create({
      data: {
        fecha: parseFecha(input.fecha),
        nroRecibo: input.nroRecibo?.trim() || null,
        periodo: input.periodo,
        mesEtiqueta: null,
        importe: new Prisma.Decimal(importe),
        ...snap,
        responsable: input.responsable?.trim() || null,
        metodoPago: input.metodoPago?.trim() || null,
        origen: "manual",
        observacion: input.observacion?.trim() || null,
        searchKey,
        registradoPorId: me.id,
      },
      select: { id: true },
    });
    refresh();
    return ok({ id: created.id });
  } catch (e) {
    return fail(e instanceof Denied ? e.message : "No se pudo registrar el pago.");
  }
}

export async function deletePago(id: string): Promise<ActionResult> {
  try {
    await authorize("guardiania.delete");
    await prisma.guardianiaPago.delete({ where: { id } });
    refresh();
    return ok();
  } catch (e) {
    return fail(e instanceof Denied ? e.message : "No se pudo eliminar el pago.");
  }
}
