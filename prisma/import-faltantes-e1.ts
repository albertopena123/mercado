// Importa los socios FALTANTES de Etapa 1 (los 3×3) desde prisma/_faltantes_e1.json.
// Crea los socios nuevos (por DNI) y los asigna a su puesto (etapa 1, bloque,
// número) si existe, es puesto y está libre. Salta los ya asignados (p.ej. el
// Bloque A que ya se hizo) y los conflictos (un número con 2 socios distintos).
//
//   npx tsx prisma/import-faltantes-e1.ts            (DRY-RUN)
//   npx tsx prisma/import-faltantes-e1.ts --apply
import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { buildSocioSearchKey } from "../src/lib/socios/normalize";
import { nextCodigo } from "../src/lib/socios/codigo";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const MARCA = "[Padrón 2026]";
const FECHA_BASE = new Date("2021-01-01T00:00:00.000Z");
type Row = { bloque: string; parcela: string; numero: string; nombre: string; dni: string; padron: string; celular: string };
const normDni = (r: string) => { const s = (r ?? "").trim().replace(/\s+/g, ""); if (!/^\d+$/.test(s)) return null; if (s.length >= 5 && s.length <= 7) return s.padStart(8, "0"); if (s.length === 8) return s; return null; };
const parseNombre = (raw: string) => { const t = raw.trim().replace(/\s+/g, " ").split(" "); if (t.length === 1) return { apellidoPaterno: t[0], apellidoMaterno: null, nombres: "—" }; if (t.length === 2) return { apellidoPaterno: t[0], apellidoMaterno: null, nombres: t[1] }; return { apellidoPaterno: t[0], apellidoMaterno: t[1], nombres: t.slice(2).join(" ") }; };
const cleanCel = (r: string) => (/^\d{6,12}$/.test((r ?? "").trim()) ? r.trim() : null);

async function main() {
  const apply = process.argv.includes("--apply");
  const rows: Row[] = JSON.parse(readFileSync(path.join(process.cwd(), "prisma", "_faltantes_e1.json"), "utf8").replace(/^﻿/, ""));

  const existing = await prisma.socio.findMany({ where: { tipoDocumento: "DNI" }, select: { id: true, numeroDocumento: true } });
  const idByDni = new Map(existing.map((s) => [s.numeroDocumento, s.id]));

  // Conflictos: (bloque,numero) con 2+ DNIs distintos.
  const dnisPorPuesto = new Map<string, Set<string>>();
  for (const r of rows) {
    const dni = normDni(r.dni); const n = parseInt(String(r.numero), 10);
    if (!dni || !Number.isInteger(n)) continue;
    const k = `${(r.bloque || "").toUpperCase()}|${n}`;
    (dnisPorPuesto.get(k) ?? dnisPorPuesto.set(k, new Set()).get(k)!).add(dni);
  }
  const conflictKeys = new Set([...dnisPorPuesto].filter(([, s]) => s.size > 1).map(([k]) => k));

  type It = { dni: string; bloque: string; numero: number; row: Row };
  const items: It[] = []; const sinDni: string[] = []; const conflictos = new Set<string>(); const noPuesto: string[] = [];
  for (const r of rows) {
    const dni = normDni(r.dni); const numero = parseInt(String(r.numero), 10); const bloque = (r.bloque || "").toUpperCase();
    if (!dni) { sinDni.push(`${bloque}-${r.numero} ${r.nombre.trim()}`); continue; }
    if (conflictKeys.has(`${bloque}|${numero}`)) { conflictos.add(`${bloque}-${numero}`); continue; }
    items.push({ dni, bloque, numero, row: r });
  }

  const nuevos = new Map<string, Row>();
  for (const it of items) if (!idByDni.has(it.dni) && !nuevos.has(it.dni)) nuevos.set(it.dni, it.row);

  console.log(`Filas: ${rows.length} · candidatas: ${items.length} · socios nuevos: ${nuevos.size} · conflictos: ${conflictos.size} · sin DNI: ${sinDni.length}`);
  if (conflictos.size) console.log("  conflictos (no se tocan): " + [...conflictos].join(", "));
  if (sinDni.length) console.log("  sin DNI: " + sinDni.join("; "));

  if (apply) {
    const last = await prisma.socio.findFirst({ orderBy: { codigo: "desc" }, select: { codigo: true } });
    let codigo = last?.codigo ?? null;
    for (const [dni, r] of nuevos) {
      codigo = nextCodigo(codigo); const p = parseNombre(r.nombre);
      const s = await prisma.socio.create({ data: { codigo, tipoDocumento: "DNI", numeroDocumento: dni, apellidoPaterno: p.apellidoPaterno, apellidoMaterno: p.apellidoMaterno, nombres: p.nombres, telefono: cleanCel(r.celular), fechaIngreso: FECHA_BASE, estado: "activo", observaciones: `${MARCA} 3×3 · Nº padrón ${r.padron || "—"} · nombre original: "${r.nombre.trim()}"`, searchKey: buildSocioSearchKey({ codigo, numeroDocumento: dni, apellidoPaterno: p.apellidoPaterno, apellidoMaterno: p.apellidoMaterno, nombres: p.nombres }) }, select: { id: true } });
      idByDni.set(dni, s.id);
    }
  }

  let asig = 0, yaAsig = 0; const noPuestoArr: string[] = [];
  for (const it of items) {
    const p = await prisma.puesto.findUnique({ where: { etapa_bloque_fila_numero: { etapa: 1, bloque: it.bloque, fila: 1, numero: it.numero } }, select: { id: true, tipo: true, observaciones: true, asignaciones: { where: { hasta: null }, select: { id: true } } } });
    if (!p) { noPuestoArr.push(`${it.bloque}-${it.numero}`); continue; }
    if (p.tipo !== "puesto" || (p.observaciones ?? "").toLowerCase().includes("alquiler")) { noPuestoArr.push(`${it.bloque}-${it.numero}(${p.tipo})`); continue; }
    if (p.asignaciones.length > 0) { yaAsig++; continue; }
    if (apply) {
      await prisma.puestoAsignacion.create({ data: { puestoId: p.id, socioId: idByDni.get(it.dni)!, desde: FECHA_BASE, motivo: "Padrón 2026" } });
      await prisma.puesto.update({ where: { id: p.id }, data: { estado: "activo" } });
    }
    asig++;
  }
  console.log(`${apply ? "✅ APLICADO" : "DRY-RUN"}: ${apply ? nuevos.size + " socios creados · " : ""}${asig} puestos ${apply ? "asignados" : "a asignar"} · ${yaAsig} ya tenían socio (saltados)`);
  if (noPuestoArr.length) console.log("  ⚠ sin puesto válido: " + noPuestoArr.join(", "));
  if (!apply) console.log("(usa --apply para escribir)");
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error("✗", e); await prisma.$disconnect(); process.exit(1); });
