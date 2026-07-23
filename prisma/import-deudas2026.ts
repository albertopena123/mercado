// Concilia las deudas del PADRON ACTUALIZADO AL 2026.xlsx (hoja vigente, limpiada
// por import-deudas2026-clean.py a prisma/_deudas2026.json) contra las cuotas del
// sistema. El Excel es la verdad actualizada de la directiva:
//
//   - monto en el Excel y sin cuota en BD            → CREAR cuota pendiente
//   - monto en el Excel ≠ monto de la pendiente en BD → ACTUALIZAR el monto
//   - CONFORME en el Excel y pendiente en BD          → MARCAR PAGADA (conciliación)
//   - celda vacía y pendiente en BD                   → reporte (no se toca sin evidencia)
//   - monto en el Excel pero la cuota ya está pagada/exonerada en BD → reporte (conflicto)
//
// Mismo mapeo columna→concepto que import-deudas.ts (los conceptos YA existen en
// BD con esos nombres; cambiarlos rompería la unique socioId+periodo+concepto).
// Dedup por socio: si tiene varios puestos, gana el monto MÁXIMO; si ninguna fila
// trae monto pero alguna dice CONFORME, es CONFORME.
//
//   npx tsx prisma/import-deudas2026.ts            (DRY-RUN)
//   npx tsx prisma/import-deudas2026.ts --apply
import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../src/generated/prisma/client";
import { normalizeToken } from "../src/lib/socios/normalize";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const MOTIVO_CONCILIACION = "Conciliación padrón actualizado 2026 (CONFORME en Excel)";

function normDni(raw: string): string | null {
  const s = (raw ?? "").trim().replace(/\s+/g, "");
  if (!/^\d+$/.test(s)) return null;
  if (s.length >= 5 && s.length <= 7) return s.padStart(8, "0");
  if (s.length === 8) return s;
  return null;
}
const nameKey = (s: string) => normalizeToken((s ?? "").trim().replace(/\s+/g, " "));
// Fallback de emparejamiento: mismos tokens SIN importar el orden. El Excel a
// veces escribe "VALENTINA HUAMAN AYMA" donde la BD tiene "HUAMAN AYMA
// VALENTINA"; exigir el orden exacto dejaría la deuda sin socio. Solo se usa si
// el orden exacto no encontró nada, y la llave ordenada es unívoca (si dos
// socios distintos compartieran los mismos tokens, no se adivina).
const nameKeySorted = (s: string) =>
  normalizeToken((s ?? "").trim()).split(/[^a-z0-9]+/).filter(Boolean).sort().join(" ");

// Header (sin el prefijo "col|") → concepto + periodo. Idéntico a import-deudas.ts.
function debtCol(headerRaw: string): { concepto: string; periodo: string } | null {
  const h = (headerRaw ?? "").toUpperCase().replace(/\s+/g, " ").trim();
  if (h.includes("AUTOVALUO") && h.includes("2012")) return { concepto: "Autovalúo 2012-2017", periodo: "2017" };
  if (h.includes("AUTOVALUO") && h.includes("2018")) return { concepto: "Autovalúo 2018", periodo: "2018" };
  if (h.includes("AUTOVALUO") && (h.includes("2019") || h.includes("2021"))) return { concepto: "Autovalúo 2019-2021", periodo: "2021" };
  if (h.includes("AUTOVALUO") && h.includes("2023")) return { concepto: "Autovalúo 2023", periodo: "2023" };
  if (h.includes("ELECTRIFICACION")) return { concepto: "Electrificación S/90", periodo: "histórico" };
  if (h.includes("MULTAS ASAMBLEAS")) { const y = h.match(/20\d\d/)?.[0] ?? "?"; return { concepto: `Multa asambleas ${y}`, periodo: y }; }
  if (h.includes("FAENA")) return { concepto: "Multa faena 2025", periodo: "2025" };
  if (h.includes("ELECCIONES")) return { concepto: "Multa elecciones 2025", periodo: "2025" };
  if (h.includes("RI DE INGRESO")) return { concepto: "Derecho de ingreso (RI)", periodo: "histórico" };
  if (h.includes("RI DE SALIDA")) return { concepto: "Derecho de salida (RI)", periodo: "histórico" };
  if (h.includes("ANIVERSARIO") && h.includes("ANTERIORES")) return { concepto: "Aniversario (anteriores 2025)", periodo: "antes-2025" };
  if (h.includes("ANIVERSARIO")) return { concepto: "Aniversario 2025", periodo: "2025" };
  if (h.includes("NAVIDAD") && h.includes("ANTERIORES")) return { concepto: "Navidad (anteriores 2025)", periodo: "antes-2025" };
  if (h.includes("NAVIDAD")) return { concepto: "Navidad 2025", periodo: "2025" };
  if (h.includes("FIESTA PATRONAL")) return { concepto: "Fiesta patronal 2025", periodo: "2025" };
  if (h.includes("GASTOS ADMINISTRATIVOS")) return { concepto: "Gastos administrativos", periodo: "histórico" };
  return null;
}
function parseMonto(v: string): number | null {
  let s = (v ?? "").trim();
  if (s === "" || /^conforme$/i.test(s)) return null;
  s = s.replace(/s\/\.?/gi, "").replace(/[,\s]/g, "");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = parseFloat(s);
  return n > 0 ? n : null;
}

type Fila = {
  filaExcel: number; etapa: string; bloque: string; puesto: string;
  nombre: string; dni: string; celdas: Record<string, string>;
};

async function main() {
  const apply = process.argv.includes("--apply");
  const filas: Fila[] = JSON.parse(
    readFileSync(path.join(process.cwd(), "prisma", "_deudas2026.json"), "utf8"),
  );

  const socios = await prisma.socio.findMany({
    select: { id: true, codigo: true, numeroDocumento: true, apellidoPaterno: true, apellidoMaterno: true, nombres: true },
  });
  const idByDni = new Map<string, string>();
  const idByName = new Map<string, string>();
  const nombreById = new Map<string, string>();
  // Llave ordenada → id, o null si es AMBIGUA (dos socios con los mismos tokens).
  const idByNameSorted = new Map<string, string | null>();
  for (const s of socios) {
    idByDni.set(s.numeroDocumento, s.id);
    const full = [s.apellidoPaterno, s.apellidoMaterno, s.nombres].filter(Boolean).join(" ");
    idByName.set(nameKey(full), s.id);
    const sorted = nameKeySorted(full);
    idByNameSorted.set(sorted, idByNameSorted.has(sorted) ? null : s.id);
    nombreById.set(s.id, `${full} (${s.numeroDocumento})`);
  }

  // Estado del Excel por (socioId|concepto): monto máximo, o CONFORME, o vacío.
  type Celda = { monto: number | null; conforme: boolean; periodo: string; concepto: string };
  const excel = new Map<string, Celda>();
  let sinSocio = 0; const sinSocioNombres = new Set<string>(); let noNumerico = 0;
  const noNumericoMuestras: string[] = [];
  const observaciones: string[] = [];

  for (const f of filas) {
    const dni = normDni(f.dni);
    const socioId =
      (dni && idByDni.get(dni)) ||
      idByName.get(nameKey(f.nombre)) ||
      idByNameSorted.get(nameKeySorted(f.nombre)) || // null si ambigua
      null;
    let tieneDato = false;
    for (const [colHeader, raw] of Object.entries(f.celdas)) {
      const header = colHeader.split("|").slice(1).join("|");
      if (/OBSERVACION/i.test(header) && raw.trim() !== "") {
        observaciones.push(`fila ${f.filaExcel} ${f.nombre}: ${raw.trim()}`);
        continue;
      }
      const def = debtCol(header);
      if (!def) continue;
      const val = raw.trim();
      const monto = parseMonto(val);
      const esConforme = /^conforme$/i.test(val);
      if (val !== "" && !esConforme && monto === null) {
        noNumerico++;
        if (noNumericoMuestras.length < 70)
          noNumericoMuestras.push(`fila ${f.filaExcel} ${f.nombre} · ${header}: "${val}"`);
        continue;
      }
      if (val === "") continue; // vacío no aporta señal por sí solo
      tieneDato = true;
      if (!socioId) continue;
      const key = `${socioId}|${def.concepto}`;
      const cur = excel.get(key) ?? { monto: null, conforme: false, periodo: def.periodo, concepto: def.concepto };
      if (monto !== null) cur.monto = cur.monto === null ? monto : Math.max(cur.monto, monto);
      if (esConforme) cur.conforme = true;
      excel.set(key, cur);
    }
    if (tieneDato && !socioId) { sinSocio++; sinSocioNombres.add(f.nombre); }
  }

  // Cuotas existentes en BD para los conceptos del padrón.
  const CONCEPTOS = [
    "Autovalúo 2012-2017", "Autovalúo 2018", "Autovalúo 2019-2021", "Autovalúo 2023",
    "Electrificación S/90", "Multa asambleas 2021", "Multa asambleas 2022", "Multa asambleas 2023",
    "Multa asambleas 2024", "Multa asambleas 2025", "Multa faena 2025", "Multa elecciones 2025",
    "Derecho de ingreso (RI)", "Derecho de salida (RI)", "Aniversario (anteriores 2025)",
    "Aniversario 2025", "Navidad (anteriores 2025)", "Navidad 2025", "Fiesta patronal 2025",
    "Gastos administrativos",
  ];
  const cuotas = await prisma.cuota.findMany({
    where: { concepto: { in: CONCEPTOS } },
    select: { id: true, socioId: true, concepto: true, periodo: true, monto: true, estado: true },
  });
  const cuotaByKey = new Map(cuotas.map((c) => [`${c.socioId}|${c.concepto}`, c]));

  // Clasificación.
  const crear: { socioId: string; concepto: string; periodo: string; monto: number }[] = [];
  const actualizar: { cuotaId: string; socioId: string; concepto: string; de: number; a: number }[] = [];
  const marcarPagada: { cuotaId: string; socioId: string; concepto: string; monto: number }[] = [];
  const conflictoYaPagada: string[] = [];
  const pendienteSinRespaldo: string[] = [];

  for (const [key, e] of excel) {
    const [socioId] = key.split("|");
    const cuota = cuotaByKey.get(key);
    if (e.monto !== null) {
      // El Excel dice que DEBE e.monto.
      if (!cuota) crear.push({ socioId, concepto: e.concepto, periodo: e.periodo, monto: e.monto });
      else if (cuota.estado === "pendiente") {
        const bd = Number(cuota.monto);
        if (Math.abs(bd - e.monto) > 0.009) actualizar.push({ cuotaId: cuota.id, socioId, concepto: e.concepto, de: bd, a: e.monto });
      } else {
        conflictoYaPagada.push(`${nombreById.get(socioId)} · ${e.concepto}: Excel debe S/${e.monto} pero BD está "${cuota.estado}"`);
      }
    } else if (e.conforme) {
      // El Excel dice CONFORME (al día) en este concepto.
      if (cuota && cuota.estado === "pendiente") {
        marcarPagada.push({ cuotaId: cuota.id, socioId, concepto: e.concepto, monto: Number(cuota.monto) });
      }
    }
  }

  // Pendientes en BD cuyo Excel quedó VACÍO (ni monto ni CONFORME): sin evidencia.
  for (const c of cuotas) {
    if (c.estado !== "pendiente") continue;
    const e = excel.get(`${c.socioId}|${c.concepto}`);
    if (!e) pendienteSinRespaldo.push(`${nombreById.get(c.socioId) ?? c.socioId} · ${c.concepto} S/${c.monto}`);
  }

  const sum = (xs: { monto: number }[]) => xs.reduce((a, x) => a + x.monto, 0);

  // Plan verificable: volcado a prisma/_plan2026.json para poder auditar el
  // resultado contra el Excel con una implementación independiente.
  const { writeFileSync } = await import("node:fs");
  writeFileSync(
    path.join(process.cwd(), "prisma", "_plan2026.json"),
    JSON.stringify({
      crear: crear.map((c) => ({ socio: nombreById.get(c.socioId), ...c })),
      actualizar, marcarPagada, conflictoYaPagada, pendienteSinRespaldo,
      totales: { crear: crear.length, sumaCrear: sum(crear) },
    }, null, 1),
    "utf8",
  );

  console.log("══════ CONCILIACIÓN PADRÓN ACTUALIZADO 2026 ══════");
  console.log(`Filas del Excel: ${filas.length} · celdas con dato mapeadas: ${excel.size}`);
  {
    const porConcepto = new Map<string, { n: number; suma: number }>();
    for (const c of crear) {
      const e = porConcepto.get(c.concepto) ?? { n: 0, suma: 0 };
      e.n++; e.suma += c.monto; porConcepto.set(c.concepto, e);
    }
    console.log("\nPor concepto (a crear):");
    for (const [c, v] of [...porConcepto.entries()].sort((a, b) => b[1].suma - a[1].suma))
      console.log(`   ${c.padEnd(32)} ${String(v.n).padStart(4)} · S/ ${v.suma.toFixed(2)}`);
  }
  console.log(`\n1) CREAR pendientes (deuda nueva)        : ${crear.length}  · S/ ${sum(crear).toFixed(2)}`);
  crear.slice(0, 15).forEach((x) => console.log(`     + ${nombreById.get(x.socioId)} · ${x.concepto} S/${x.monto}`));
  if (crear.length > 15) console.log(`     … y ${crear.length - 15} más`);
  console.log(`\n2) ACTUALIZAR monto de pendientes        : ${actualizar.length}`);
  actualizar.slice(0, 15).forEach((x) => console.log(`     ~ ${nombreById.get(x.socioId)} · ${x.concepto}: S/${x.de} → S/${x.a}`));
  if (actualizar.length > 15) console.log(`     … y ${actualizar.length - 15} más`);
  console.log(`\n3) MARCAR PAGADA (CONFORME en Excel)     : ${marcarPagada.length}  · S/ ${sum(marcarPagada).toFixed(2)}`);
  marcarPagada.slice(0, 15).forEach((x) => console.log(`     ✓ ${nombreById.get(x.socioId)} · ${x.concepto} S/${x.monto}`));
  if (marcarPagada.length > 15) console.log(`     … y ${marcarPagada.length - 15} más`);
  console.log(`\n4) CONFLICTO (Excel debe, BD ya saldada) : ${conflictoYaPagada.length}  [solo reporte]`);
  conflictoYaPagada.slice(0, 10).forEach((x) => console.log(`     ! ${x}`));
  console.log(`\n5) Pendiente en BD sin respaldo en Excel : ${pendienteSinRespaldo.length}  [solo reporte, no se toca]`);
  pendienteSinRespaldo.slice(0, 10).forEach((x) => console.log(`     ? ${x}`));
  if (pendienteSinRespaldo.length > 10) console.log(`     … y ${pendienteSinRespaldo.length - 10} más`);
  console.log(`\nFilas con deuda sin socio en BD: ${sinSocio} (${[...sinSocioNombres].slice(0, 5).join("; ")}${sinSocioNombres.size > 5 ? "…" : ""})`);
  console.log(`Celdas no numéricas ignoradas: ${noNumerico}`);
  noNumericoMuestras.forEach((m) => console.log(`     × ${m}`));
  if (observaciones.length) {
    console.log(`\nObservaciones del Excel (${observaciones.length}):`);
    observaciones.slice(0, 12).forEach((o) => console.log(`   · ${o}`));
  }

  if (!apply) { console.log("\n(DRY-RUN — usa --apply para ejecutar 1, 2 y 3.)"); return; }

  const admin = await prisma.user.findFirst({
    where: { roles: { some: { role: { key: "superadmin" } } } }, select: { id: true },
  });
  await prisma.$transaction(async (tx) => {
    if (crear.length) {
      await tx.cuota.createMany({
        data: crear.map((d) => ({
          socioId: d.socioId, periodo: d.periodo, concepto: d.concepto,
          monto: new Prisma.Decimal(d.monto), estado: "pendiente" as const, createdById: admin?.id ?? null,
        })),
        skipDuplicates: true,
      });
    }
    for (const u of actualizar) {
      // Solo si sigue pendiente (nadie la pagó entre el dry-run y el apply).
      await tx.cuota.updateMany({
        where: { id: u.cuotaId, estado: "pendiente" },
        data: { monto: new Prisma.Decimal(u.a) },
      });
    }
    for (const m of marcarPagada) {
      await tx.cuota.updateMany({
        where: { id: m.cuotaId, estado: "pendiente" },
        data: {
          estado: "pagada", pagadoEn: new Date(), pagadoMonto: new Prisma.Decimal(m.monto),
          motivo: MOTIVO_CONCILIACION, byUserId: admin?.id ?? null,
        },
      });
    }
  });
  console.log(`\n✅ APLICADO: ${crear.length} creadas · ${actualizar.length} montos actualizados · ${marcarPagada.length} marcadas pagadas (conciliación).`);
}

main()
  .catch((e) => { console.error("✗", e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
