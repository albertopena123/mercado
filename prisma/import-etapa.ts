// Importa SOCIOS de una etapa desde prisma/_etapa{N}.json (exportado del Excel).
// El puesto se identifica por (etapa, bloque, número) — la PARCELA se ignora.
// Crea los socios nuevos (por DNI), reusa los existentes, y asigna cada socio a
// su puesto. Si 2 socios distintos reclaman el mismo (bloque, número) → CONFLICTO:
// no se asigna, se reporta para que la directiva resuelva.
//
//   npx tsx prisma/import-etapa.ts --etapa 2                 (DRY-RUN, todos los bloques)
//   npx tsx prisma/import-etapa.ts --etapa 2 --apply         (aplica todos)
//   npx tsx prisma/import-etapa.ts --etapa 2 --bloque C      (un bloque)
import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { buildSocioSearchKey } from "../src/lib/socios/normalize";
import { nextCodigo } from "../src/lib/socios/codigo";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const MARCA = "[Padrón 2026]";
const ALQ = "En alquiler — propiedad de la asociación";
const FECHA_BASE = new Date("2021-01-01T00:00:00.000Z");

type Row = { bloque: string; parcela: string; numero: string; nombre: string; dni: string; padron: string; celular: string };

function normDni(raw: string): string | null {
  const s = (raw ?? "").trim().replace(/\s+/g, "");
  if (!/^\d+$/.test(s)) return null;
  if (s.length >= 5 && s.length <= 7) return s.padStart(8, "0");
  if (s.length === 8) return s;
  return null; // 9+ dígitos = error de tipeo
}
function parseNombre(raw: string) {
  const t = raw.trim().replace(/\s+/g, " ").split(" ");
  if (t.length === 1) return { apellidoPaterno: t[0], apellidoMaterno: null, nombres: "—" };
  if (t.length === 2) return { apellidoPaterno: t[0], apellidoMaterno: null, nombres: t[1] };
  return { apellidoPaterno: t[0], apellidoMaterno: t[1], nombres: t.slice(2).join(" ") };
}
const cleanCel = (raw: string): string | null => (/^\d{6,12}$/.test((raw ?? "").trim()) ? raw.trim() : null);

async function ensureBloqueAStruct() {
  // Solo Etapa 1: banda baja del bloque A = 1,2 socio · 3,4 ALQUILER · 5-8 SS-HH.
  for (const c of [
    { numero: 1, obs: null as string | null, estado: "vacio" as const },
    { numero: 2, obs: null, estado: "vacio" as const },
    { numero: 3, obs: ALQ, estado: "activo" as const },
    { numero: 4, obs: ALQ, estado: "activo" as const },
  ]) {
    await prisma.puesto.update({
      where: { etapa_bloque_fila_numero: { etapa: 1, bloque: "A", fila: 1, numero: c.numero } },
      data: { observaciones: c.obs, estado: c.estado, tipo: "puesto" },
    });
  }
}

async function importBloque(etapa: number, bloque: string, rows: Row[], apply: boolean,
  idByDni: Map<string, string>, getCodigo: () => string) {
  const puestos = await prisma.puesto.findMany({
    where: { etapa, bloque },
    select: { id: true, numero: true, tipo: true, observaciones: true,
      asignaciones: { where: { hasta: null }, select: { id: true } } },
  });
  const puestoByNum = new Map(puestos.map((p) => [p.numero, p]));

  type Item = { dni: string; numero: number; row: Row };
  const items: Item[] = [];
  const sinDni: string[] = [];
  for (const r of rows) {
    const dni = normDni(r.dni);
    const numero = parseInt(String(r.numero), 10);
    if (!dni) { sinDni.push(`#${r.numero} ${r.nombre.trim()}`); continue; }
    if (!Number.isInteger(numero)) continue;
    const p = puestoByNum.get(numero);
    if (!p) continue; // no existe ese número en la grilla
    if (p.tipo !== "puesto" || (p.observaciones ?? "").toLowerCase().includes("alquiler")) continue;
    items.push({ dni, numero, row: r });
  }

  // Conflictos: un (bloque,número) con 2+ DNIs distintos.
  const dnisPorNum = new Map<number, Set<string>>();
  for (const it of items) (dnisPorNum.get(it.numero) ?? dnisPorNum.set(it.numero, new Set()).get(it.numero)!).add(it.dni);
  const conflictNums = new Set([...dnisPorNum].filter(([, s]) => s.size > 1).map(([n]) => n));

  const asignables = items.filter((it) => !conflictNums.has(it.numero));
  const conflictos = [...conflictNums].sort((a, b) => a - b).map((n) => ({
    numero: n,
    socios: [...new Set(items.filter((it) => it.numero === n).map((it) => it.row.nombre.trim() + " (" + it.dni + ")"))],
  }));

  // Crear socios nuevos (de filas asignables; los socios en conflicto se crean
  // igual porque son personas reales, pero su puesto queda sin asignar).
  const nuevos = new Map<string, Row>();
  for (const it of items) if (!idByDni.has(it.dni) && !nuevos.has(it.dni)) nuevos.set(it.dni, it.row);

  if (apply) {
    for (const [dni, r] of nuevos) {
      const codigo = getCodigo();
      const p = parseNombre(r.nombre);
      const s = await prisma.socio.create({
        data: {
          codigo, tipoDocumento: "DNI", numeroDocumento: dni,
          apellidoPaterno: p.apellidoPaterno, apellidoMaterno: p.apellidoMaterno, nombres: p.nombres,
          telefono: cleanCel(r.celular), fechaIngreso: FECHA_BASE, estado: "activo",
          observaciones: `${MARCA} Nº padrón ${r.padron || "—"} · nombre original: "${r.nombre.trim()}"`,
          searchKey: buildSocioSearchKey({ codigo, numeroDocumento: dni,
            apellidoPaterno: p.apellidoPaterno, apellidoMaterno: p.apellidoMaterno, nombres: p.nombres }),
        }, select: { id: true },
      });
      idByDni.set(dni, s.id);
    }
  }

  // Asignar (saltar conflictos y puestos ya asignados).
  let asignados = 0;
  const vistos = new Set<number>();
  if (apply) {
    for (const it of asignables) {
      if (vistos.has(it.numero)) continue;
      const p = puestoByNum.get(it.numero)!;
      if (p.asignaciones.length > 0) { vistos.add(it.numero); continue; }
      const socioId = idByDni.get(it.dni)!;
      await prisma.puestoAsignacion.create({ data: { puestoId: p.id, socioId, desde: FECHA_BASE, motivo: "Padrón 2026" } });
      await prisma.puesto.update({ where: { id: p.id }, data: { estado: "activo" } });
      vistos.add(it.numero); asignados++;
    }
  } else {
    asignados = new Set(asignables.map((it) => it.numero)).size;
  }

  return { bloque, total: rows.length, asignables: new Set(asignables.map(i=>i.numero)).size, asignados,
    nuevos: nuevos.size, conflictos, sinDni };
}

async function main() {
  const ie = process.argv.indexOf("--etapa");
  const etapa = ie >= 0 ? parseInt(process.argv[ie + 1], 10) : 1;
  const ib = process.argv.indexOf("--bloque");
  const bloqueArg = ib >= 0 ? process.argv[ib + 1].toUpperCase() : "ALL";
  const apply = process.argv.includes("--apply");

  const json = JSON.parse(readFileSync(path.join(process.cwd(), "prisma", `_etapa${etapa}.json`), "utf8").replace(/^﻿/, ""));
  const all: Row[] = Array.isArray(json) ? json : [json];
  const bloques = bloqueArg === "ALL"
    ? [...new Set(all.map((r) => (r.bloque ?? "").toUpperCase()))].filter((b) => /^[A-M]$/.test(b)).sort()
    : [bloqueArg];

  console.log(`══════ IMPORT SOCIOS · Etapa ${etapa} · Bloques: ${bloques.join(",")} ══════\n`);
  if (etapa === 1 && bloques.includes("A") && apply) await ensureBloqueAStruct();

  const existentes = await prisma.socio.findMany({ where: { tipoDocumento: "DNI" }, select: { id: true, numeroDocumento: true } });
  const idByDni = new Map(existentes.map((s) => [s.numeroDocumento, s.id]));
  const last = await prisma.socio.findFirst({ orderBy: { codigo: "desc" }, select: { codigo: true } });
  let codigoActual = last?.codigo ?? null;
  const getCodigo = () => { codigoActual = nextCodigo(codigoActual); return codigoActual; };

  let totAsig = 0, totConf = 0, totSinDni = 0;
  const conflictReport: string[] = [];
  for (const b of bloques) {
    const rows = all.filter((r) => (r.bloque ?? "").toUpperCase() === b);
    if (!rows.length) continue;
    const res = await importBloque(etapa, b, rows, apply, idByDni, getCodigo);
    console.log(`  ${b}: ${res.asignados} asignados · ${res.conflictos.length} conflictos · ${res.sinDni.length} sin DNI · (${res.nuevos} socios nuevos)`);
    totAsig += res.asignados; totConf += res.conflictos.length; totSinDni += res.sinDni.length;
    for (const c of res.conflictos) conflictReport.push(`  ${b}-${c.numero}: ${c.socios.join("  vs  ")}`);
  }

  console.log(`\n${apply ? "✅ APLICADO" : "DRY-RUN"} · Etapa ${etapa}: ${totAsig} asignados · ${totConf} conflictos · ${totSinDni} sin DNI`);
  if (conflictReport.length) {
    console.log(`\n─── CONFLICTOS (mismo puesto, 2+ socios — NO asignados) ───`);
    conflictReport.forEach((c) => console.log(c));
  }
  if (!apply) console.log("\n(Usa --apply para escribir.)");
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error("✗", e); await prisma.$disconnect(); process.exit(1); });
