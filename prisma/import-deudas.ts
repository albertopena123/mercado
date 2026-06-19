// Migra las DEUDAS del Excel (columnas con monto) al módulo de Cuotas, como
// cuotas PENDIENTES. Lee prisma/_deudas1.json y _deudas2.json (todas las
// columnas). Una celda con número = lo que el socio debe en ese concepto.
// "CONFORME"/vacío/texto = sin deuda en ese concepto.
//
// - Deduplica por socio (si tiene varios puestos, la deuda se cuenta una vez).
// - Empareja por DNI; si la fila no tiene DNI, por nombre (socios SD-####).
// - No duplica: la unique (socioId, periodo, concepto) evita recargas dobles.
//
//   npx tsx prisma/import-deudas.ts            (DRY-RUN)
//   npx tsx prisma/import-deudas.ts --apply
import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../src/generated/prisma/client";
import { normalizeToken } from "../src/lib/socios/normalize";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

function normDni(raw: string): string | null {
  const s = (raw ?? "").trim().replace(/\s+/g, "");
  if (!/^\d+$/.test(s)) return null;
  if (s.length >= 5 && s.length <= 7) return s.padStart(8, "0");
  if (s.length === 8) return s;
  return null;
}
const nameKey = (s: string) => normalizeToken((s ?? "").trim().replace(/\s+/g, " "));

// Header (normalizado) → concepto + periodo. Solo columnas monetarias.
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
  return null; // pago lastre/terreno, contrato, carta, alcabala, multas anterior, exoneraciones, observación
}
function parseMonto(v: string): number | null {
  let s = (v ?? "").trim();
  if (s === "" || /^conforme$/i.test(s)) return null;
  s = s.replace(/s\/\.?/gi, "").replace(/[,\s]/g, "");
  if (!/^\d+(\.\d+)?$/.test(s)) return null; // texto/compuesto → no es monto limpio
  const n = parseFloat(s);
  return n > 0 ? n : null;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const DNI = "DNI", NOMBRE = "APELLIDOS Y NOMBRES 2021 - GESTION SANTOS";
  // Por ahora solo Etapa 1 (3×5). Pasa --etapa2 o --todas para incluir más.
  const etapas = process.argv.includes("--todas") ? [1, 2] : process.argv.includes("--etapa2") ? [2] : [1];
  const rows: any[] = [];
  for (const e of etapas) {
    try { rows.push(...JSON.parse(readFileSync(path.join(process.cwd(), "prisma", `_deudas${e}.json`), "utf8").replace(/^﻿/, ""))); } catch {}
  }

  // Mapas socio: por DNI y por nombre.
  const socios = await prisma.socio.findMany({ select: { id: true, numeroDocumento: true, apellidoPaterno: true, apellidoMaterno: true, nombres: true } });
  const idByDni = new Map<string, string>();
  const idByName = new Map<string, string>();
  for (const s of socios) {
    idByDni.set(s.numeroDocumento, s.id);
    idByName.set(nameKey([s.apellidoPaterno, s.apellidoMaterno, s.nombres].filter(Boolean).join(" ")), s.id);
  }

  // (socioId|concepto) → {periodo, monto}. Dedup: max monto entre filas del socio.
  type D = { socioId: string; concepto: string; periodo: string; monto: number };
  const deudas = new Map<string, D>();
  let sinSocio = 0, noNumerico = 0;
  const sinSocioNombres = new Set<string>();
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const debtCols = headers.map((h) => ({ h, def: debtCol(h) })).filter((x) => x.def);

  for (const r of rows) {
    const dni = normDni(r[DNI]);
    const socioId = dni ? idByDni.get(dni) : idByName.get(nameKey(r[NOMBRE]));
    let rowHasDebt = false;
    for (const { h, def } of debtCols) {
      const raw = String(r[h] ?? "").trim();
      const monto = parseMonto(raw);
      if (raw !== "" && !/^conforme$/i.test(raw) && monto === null) noNumerico++;
      if (monto === null) continue;
      rowHasDebt = true;
      if (!socioId) continue;
      const key = `${socioId}|${def!.concepto}`;
      const cur = deudas.get(key);
      if (!cur || monto > cur.monto) deudas.set(key, { socioId, concepto: def!.concepto, periodo: def!.periodo, monto });
    }
    if (rowHasDebt && !socioId) { sinSocio++; sinSocioNombres.add(String(r[NOMBRE] ?? "").trim()); }
  }

  // Totales por concepto.
  const porConcepto = new Map<string, { n: number; suma: number }>();
  let total = 0;
  for (const d of deudas.values()) {
    const c = porConcepto.get(d.concepto) ?? { n: 0, suma: 0 };
    c.n++; c.suma += d.monto; porConcepto.set(d.concepto, c);
    total += d.monto;
  }
  const sociosAfectados = new Set([...deudas.values()].map((d) => d.socioId)).size;

  console.log("══════ MIGRACIÓN DE DEUDAS → CUOTAS (pendientes) ══════");
  console.log(`Columnas de deuda detectadas: ${debtCols.length}`);
  console.log(`Cuotas a crear: ${deudas.size}  ·  socios con deuda: ${sociosAfectados}  ·  TOTAL: S/ ${total.toFixed(2)}`);
  console.log("Por concepto:");
  for (const [c, v] of [...porConcepto.entries()].sort((a, b) => b[1].suma - a[1].suma))
    console.log(`   ${c.padEnd(30)} ${String(v.n).padStart(3)} socios · S/ ${v.suma.toFixed(2)}`);
  if (noNumerico) console.log(`⚠ Celdas con valor no numérico (no importadas): ${noNumerico}`);
  if (sinSocio) console.log(`⚠ Filas con deuda sin socio en BD: ${sinSocio} (${[...sinSocioNombres].slice(0, 5).join("; ")}…)`);

  if (!apply) { console.log("\n(DRY-RUN — usa --apply para crear las cuotas.)"); await prisma.$disconnect(); return; }

  const admin = await prisma.user.findFirst({ where: { roles: { some: { role: { key: "superadmin" } } } }, select: { id: true } });
  const data: Prisma.CuotaCreateManyInput[] = [...deudas.values()].map((d) => ({
    socioId: d.socioId, periodo: d.periodo, concepto: d.concepto,
    monto: new Prisma.Decimal(d.monto), estado: "pendiente", createdById: admin?.id ?? null,
  }));
  const res = await prisma.cuota.createMany({ data, skipDuplicates: true });
  console.log(`\n✅ APLICADO: ${res.count} cuotas pendientes creadas (S/ ${total.toFixed(2)} en deuda).`);
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error("✗", e); await prisma.$disconnect(); process.exit(1); });
