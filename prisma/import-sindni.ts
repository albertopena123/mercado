// Registra los socios del padrón que vienen SIN DNI (solo nombre), con un
// documento TEMPORAL marcado ("SD-####", tipo DNI) para regularizar después.
// - Deduplica por nombre; si la persona ya existe en la BD (por nombre), la reusa.
// - Asigna su puesto SOLO si está libre y ese (etapa,bloque,número) no está en
//   conflicto (lo reclama más de una persona). Los conflictos NO se tocan.
// Lee prisma/_etapa1.json y prisma/_etapa2.json.
//
//   npx tsx prisma/import-sindni.ts            (DRY-RUN)
//   npx tsx prisma/import-sindni.ts --apply
import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { buildSocioSearchKey, normalizeToken } from "../src/lib/socios/normalize";
import { nextCodigo } from "../src/lib/socios/codigo";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const MARCA = "[Padrón 2026]";
const FECHA_BASE = new Date("2021-01-01T00:00:00.000Z");

type Row = { bloque: string; parcela: string; numero: string; nombre: string; dni: string; padron: string; celular: string };

function normDni(raw: string): string | null {
  const s = (raw ?? "").trim().replace(/\s+/g, "");
  if (!/^\d+$/.test(s)) return null;
  if (s.length >= 5 && s.length <= 7) return s.padStart(8, "0");
  if (s.length === 8) return s;
  return null;
}
function parseNombre(raw: string) {
  const t = raw.trim().replace(/\s+/g, " ").split(" ");
  if (t.length === 1) return { apellidoPaterno: t[0], apellidoMaterno: null, nombres: "—" };
  if (t.length === 2) return { apellidoPaterno: t[0], apellidoMaterno: null, nombres: t[1] };
  return { apellidoPaterno: t[0], apellidoMaterno: t[1], nombres: t.slice(2).join(" ") };
}
const nameKey = (s: string) => normalizeToken((s ?? "").trim().replace(/\s+/g, " "));
const cleanCel = (raw: string): string | null => (/^\d{6,12}$/.test((raw ?? "").trim()) ? raw.trim() : null);

type Puesto = { etapa: number; bloque: string; numero: number };

async function main() {
  const apply = process.argv.includes("--apply");
  const data: { etapa: number; rows: Row[] }[] = [];
  for (const e of [1, 2]) {
    try {
      const j = JSON.parse(readFileSync(path.join(process.cwd(), "prisma", `_etapa${e}.json`), "utf8").replace(/^﻿/, ""));
      data.push({ etapa: e, rows: Array.isArray(j) ? j : [j] });
    } catch { /* etapa sin json */ }
  }

  // Mapa de reclamantes por (etapa,bloque,número): identidad = DNI o nombre.
  const idOf = (r: Row) => normDni(r.dni) ?? "n:" + nameKey(r.nombre);
  const claimants = new Map<string, Set<string>>();
  for (const { etapa, rows } of data) for (const r of rows) {
    const n = parseInt(String(r.numero), 10);
    if (!Number.isInteger(n)) continue;
    const k = `${etapa}|${(r.bloque || "").toUpperCase()}|${n}`;
    (claimants.get(k) ?? claimants.set(k, new Set()).get(k)!).add(idOf(r));
  }

  // Socios SIN DNI agrupados por nombre, con sus puestos.
  const byName = new Map<string, { rep: Row; puestos: Puesto[] }>();
  for (const { etapa, rows } of data) for (const r of rows) {
    if (normDni(r.dni)) continue;
    const n = parseInt(String(r.numero), 10);
    const key = nameKey(r.nombre);
    if (!key || !Number.isInteger(n)) continue;
    const g = byName.get(key) ?? { rep: r, puestos: [] };
    g.puestos.push({ etapa, bloque: (r.bloque || "").toUpperCase(), numero: n });
    byName.set(key, g);
  }

  // Socios existentes por nombre (para no duplicar a quien ya está en la BD).
  const existing = await prisma.socio.findMany({ select: { id: true, apellidoPaterno: true, apellidoMaterno: true, nombres: true } });
  const idByName = new Map<string, string>();
  for (const s of existing) idByName.set(nameKey([s.apellidoPaterno, s.apellidoMaterno, s.nombres].filter(Boolean).join(" ")), s.id);

  let crear = 0, reusar = 0, asignables = 0, enConflicto = 0;
  for (const [key, g] of byName) {
    if (idByName.has(key)) reusar++; else crear++;
    for (const pu of g.puestos) {
      const sz = claimants.get(`${pu.etapa}|${pu.bloque}|${pu.numero}`)?.size ?? 0;
      if (sz > 1) enConflicto++; else asignables++;
    }
  }
  console.log(`══ Socios SIN DNI ══`);
  console.log(`Nombres distintos: ${byName.size}  (nuevos a crear: ${crear} · ya existen por nombre: ${reusar})`);
  console.log(`Puestos a reservar (libres y sin conflicto): ${asignables}  ·  en conflicto (no se tocan): ${enConflicto}`);
  console.log(`Documento temporal: tipo DNI, número "SD-####" (marca "${MARCA} SIN DNI")`);

  if (!apply) { console.log("\n(DRY-RUN — usa --apply para escribir.)"); await prisma.$disconnect(); return; }

  const last = await prisma.socio.findFirst({ orderBy: { codigo: "desc" }, select: { codigo: true } });
  let codigo = last?.codigo ?? null;
  // Continuar la secuencia SD-#### desde la más alta existente.
  const sdMax = await prisma.socio.findMany({ where: { numeroDocumento: { startsWith: "SD-" } }, select: { numeroDocumento: true } });
  let sdSeq = sdMax.reduce((m, s) => Math.max(m, parseInt(s.numeroDocumento.slice(3), 10) || 0), 0);

  let creados = 0, reusados = 0, asignados = 0, saltados = 0;
  for (const [key, g] of byName) {
    let socioId = idByName.get(key);
    if (!socioId) {
      codigo = nextCodigo(codigo);
      const numDoc = "SD-" + String(++sdSeq).padStart(4, "0");
      const p = parseNombre(g.rep.nombre);
      const s = await prisma.socio.create({
        data: {
          codigo, tipoDocumento: "DNI", numeroDocumento: numDoc,
          apellidoPaterno: p.apellidoPaterno, apellidoMaterno: p.apellidoMaterno, nombres: p.nombres,
          telefono: cleanCel(g.rep.celular), fechaIngreso: FECHA_BASE, estado: "activo",
          observaciones: `${MARCA} SIN DNI — pendiente de regularizar · nombre original: "${g.rep.nombre.trim()}"`,
          searchKey: buildSocioSearchKey({ codigo, numeroDocumento: numDoc, apellidoPaterno: p.apellidoPaterno, apellidoMaterno: p.apellidoMaterno, nombres: p.nombres }),
        }, select: { id: true },
      });
      socioId = s.id; idByName.set(key, socioId); creados++;
    } else reusados++;

    for (const pu of g.puestos) {
      if ((claimants.get(`${pu.etapa}|${pu.bloque}|${pu.numero}`)?.size ?? 0) > 1) { saltados++; continue; }
      const dbp = await prisma.puesto.findUnique({
        where: { etapa_bloque_fila_numero: { etapa: pu.etapa, bloque: pu.bloque, fila: 1, numero: pu.numero } },
        select: { id: true, tipo: true, observaciones: true, asignaciones: { where: { hasta: null }, select: { id: true } } },
      });
      if (!dbp || dbp.tipo !== "puesto" || (dbp.observaciones ?? "").toLowerCase().includes("alquiler") || dbp.asignaciones.length > 0) { saltados++; continue; }
      await prisma.puestoAsignacion.create({ data: { puestoId: dbp.id, socioId, desde: FECHA_BASE, motivo: "Padrón 2026 (sin DNI)" } });
      await prisma.puesto.update({ where: { id: dbp.id }, data: { estado: "activo" } });
      asignados++;
    }
  }
  console.log(`\n✅ APLICADO: socios creados=${creados} · reusados=${reusados} · puestos reservados=${asignados} · saltados=${saltados}`);
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error("✗", e); await prisma.$disconnect(); process.exit(1); });
