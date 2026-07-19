import "dotenv/config";
import assert from "node:assert/strict";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

// Verifica el módulo de guardianía contra los datos importados:
//  1) la suma por mes (cobro y cubierto) cuadra con el total.
//  2) la matemática de morosidad (esperados − cubiertos = debidos) es consistente
//     para una cuenta real.
// Replica la lógica de actions.ts con prisma directo (las server actions no corren
// fuera de una request HTTP por getCurrentUser).

const monthIndex = (p: string) => {
  const [y, m] = p.split("-").map(Number);
  return y * 12 + (m - 1);
};

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

  const total = Number((await prisma.guardianiaPago.aggregate({ _sum: { importe: true } }))._sum.importe ?? 0);
  console.log(`total importe: S/ ${total.toLocaleString("es-PE")}`);
  assert.ok(total > 0, "debe haber pagos importados");

  // (1) suma por mes de cobro y por mes cubierto == total
  const porCobro = await prisma.$queryRawUnsafe<{ mes: string; monto: number }[]>(
    `SELECT to_char("fecha",'YYYY-MM') mes, SUM("importe")::float monto FROM "GuardianiaPago" GROUP BY 1`,
  );
  const porCubierto = await prisma.$queryRawUnsafe<{ mes: string; monto: number }[]>(
    `SELECT "periodo" mes, SUM("importe")::float monto FROM "GuardianiaPago" GROUP BY 1`,
  );
  const sumCobro = porCobro.reduce((s, r) => s + r.monto, 0);
  const sumCub = porCubierto.reduce((s, r) => s + r.monto, 0);
  assert.ok(Math.abs(sumCobro - total) < 0.5, `suma por cobro (${sumCobro}) == total (${total})`);
  assert.ok(Math.abs(sumCub - total) < 0.5, `suma por cubierto (${sumCub}) == total (${total})`);
  console.log(`  ✓ agregación mensual cuadra (cobro=${porCobro.length} meses, cubierto=${porCubierto.length} meses)`);

  // (2) morosidad para una cuenta con pagos
  const cuenta = await prisma.guardianiaCuenta.findFirst({
    where: { activo: true, puesto: { guardianiaPagos: { some: {} } } },
    include: { puesto: { select: { codigo: true } } },
  });
  assert.ok(cuenta, "debe existir al menos una cuenta con pagos");
  const nowIdx = monthIndex(new Date().toISOString().slice(0, 7));
  const startIdx = monthIndex(cuenta!.inicioPeriodo);
  const esperados = Math.max(0, nowIdx - startIdx + 1);
  const periodos = await prisma.guardianiaPago.findMany({
    where: { puestoId: cuenta!.puestoId },
    select: { periodo: true },
    distinct: ["periodo"],
  });
  const cubiertos = periodos.filter((p) => {
    const i = monthIndex(p.periodo);
    return i >= startIdx && i <= nowIdx;
  }).length;
  const debidos = Math.max(0, esperados - cubiertos);
  const deuda = debidos * Number(cuenta!.tarifaMensual);
  console.log(
    `  ✓ cuenta ${cuenta!.puesto.codigo}: desde ${cuenta!.inicioPeriodo} · esperados=${esperados} cubiertos=${cubiertos} debidos=${debidos} · deuda=S/${deuda}`,
  );
  assert.ok(esperados >= cubiertos, "esperados >= cubiertos");
  assert.equal(debidos, esperados - cubiertos, "debidos = esperados - cubiertos");

  // (3) plan de cargos por socio (generarCargosGuardiania): read-only, valida el
  //     algoritmo aunque aún no se haya generado. Un concepto por puesto ⇒ sin
  //     colisiones con la unique(socioId, periodo, concepto); el pendiente de las
  //     cuentas con socio no puede exceder la deuda estimada de TODAS las cuentas.
  const CONCEPTO_PREFIJO = "Guardianía · ";
  const periodoFromIndex = (idx: number) => `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
  const hastaIdx = monthIndex(new Date().toISOString().slice(0, 7));
  const todasCuentas = await prisma.guardianiaCuenta.findMany({
    where: { activo: true },
    select: { puestoId: true, socioId: true, tarifaMensual: true, inicioPeriodo: true, puesto: { select: { codigo: true } } },
  });
  const pagosCob = await prisma.guardianiaPago.findMany({
    where: { puestoId: { in: todasCuentas.map((c) => c.puestoId) } },
    select: { puestoId: true, periodo: true },
  });
  const cov = new Map<string, Set<string>>();
  for (const p of pagosCob) {
    if (!p.puestoId) continue;
    (cov.get(p.puestoId) ?? cov.set(p.puestoId, new Set()).get(p.puestoId)!).add(p.periodo);
  }
  const claves = new Set<string>();
  let colisiones = 0, planPendiente = 0, planFilas = 0, deudaEstimada = 0, conSocio = 0;
  for (const c of todasCuentas) {
    const tieneSocio = c.socioId != null;
    if (tieneSocio) conSocio++;
    const concepto = `${CONCEPTO_PREFIJO}${c.puesto.codigo}`;
    const startIdx = monthIndex(c.inicioPeriodo);
    const tarifa = Number(c.tarifaMensual);
    for (let idx = startIdx; idx <= hastaIdx; idx++) {
      const periodo = periodoFromIndex(idx);
      const pendiente = !cov.get(c.puestoId)?.has(periodo);
      if (pendiente) deudaEstimada += tarifa; // deuda de TODAS las cuentas activas
      if (!tieneSocio) continue; // solo las cuentas con socio generan cargo
      const k = `${c.socioId}|${periodo}|${concepto}`;
      if (claves.has(k)) colisiones++; else claves.add(k);
      planFilas++;
      if (pendiente) planPendiente += tarifa;
    }
  }
  assert.equal(colisiones, 0, "cada puesto genera un concepto único (sin colisiones con la unique)");
  assert.ok(planPendiente <= deudaEstimada + 0.5, `pendiente con socio (${planPendiente}) <= deuda estimada total (${deudaEstimada})`);
  console.log(
    `  ✓ plan de cargos: ${planFilas} filas · ${conSocio} cuentas c/socio · pendiente S/${Math.round(planPendiente).toLocaleString("es-PE")} (≤ estimada S/${Math.round(deudaEstimada).toLocaleString("es-PE")}) · 0 colisiones`,
  );

  const cuentas = await prisma.guardianiaCuenta.count();
  const pagos = await prisma.guardianiaPago.count();
  console.log(`\n✅ verify-guardiania OK · ${pagos} pagos · ${cuentas} cuentas`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("✗", e);
  process.exit(1);
});
