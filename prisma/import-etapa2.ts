// Importa los socios de Etapa 2 desde prisma/_etapa2_socios.json. Este padrón NO
// trae DNI, así que: si la persona ya existe por nombre (p.ej. está en Etapa 1)
// se reusa; si no, se crea con documento temporal "SD-####" (pendiente de DNI).
// Asigna cada socio a su puesto (etapa 2, bloque, número) si está libre.
//
//   npx tsx prisma/import-etapa2.ts            (DRY-RUN)
//   npx tsx prisma/import-etapa2.ts --apply
import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { buildSocioSearchKey, normalizeToken } from "../src/lib/socios/normalize";
import { nextCodigo } from "../src/lib/socios/codigo";
import { DOC_PENDIENTE_PREFIX } from "../src/lib/socios/document";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const MARCA = "[Padrón 2026]"; const FECHA_BASE = new Date("2021-01-01T00:00:00.000Z");
type Row = { bloque: string; parcela: string; numero: string; nombre: string; padron: string; celular: string };
const nameKey = (s: string) => normalizeToken((s ?? "").trim().replace(/\s+/g, " "));
const parseNombre = (raw: string) => { const t = raw.trim().replace(/\s+/g, " ").split(" "); if (t.length === 1) return { apellidoPaterno: t[0], apellidoMaterno: null, nombres: "—" }; if (t.length === 2) return { apellidoPaterno: t[0], apellidoMaterno: null, nombres: t[1] }; return { apellidoPaterno: t[0], apellidoMaterno: t[1], nombres: t.slice(2).join(" ") }; };
const cleanCel = (r: string) => (/^\d{6,12}$/.test((r ?? "").trim()) ? r.trim() : null);

async function main() {
  const apply = process.argv.includes("--apply");
  const rows: Row[] = JSON.parse(readFileSync(path.join(process.cwd(), "prisma", "_etapa2_socios.json"), "utf8").replace(/^﻿/, ""));

  // Agrupar por nombre → puestos.
  const byName = new Map<string, { rep: Row; puestos: { bloque: string; numero: number }[] }>();
  for (const r of rows) {
    const k = nameKey(r.nombre); if (!k) continue;
    const n = parseInt(String(r.numero), 10); if (!Number.isInteger(n)) continue;
    const g = byName.get(k) ?? { rep: r, puestos: [] };
    g.puestos.push({ bloque: (r.bloque || "").toUpperCase(), numero: n });
    byName.set(k, g);
  }

  // Socios existentes por nombre.
  const existing = await prisma.socio.findMany({ select: { id: true, apellidoPaterno: true, apellidoMaterno: true, nombres: true } });
  const idByName = new Map(existing.map((s) => [nameKey([s.apellidoPaterno, s.apellidoMaterno, s.nombres].filter(Boolean).join(" ")), s.id]));

  const reusar = [...byName.keys()].filter((k) => idByName.has(k)).length;
  const crear = byName.size - reusar;
  console.log(`Filas: ${rows.length} · personas distintas: ${byName.size} (reusar: ${reusar} · crear SD-: ${crear})`);

  if (!apply) { console.log("\n(DRY-RUN — usa --apply.)"); await prisma.$disconnect(); return; }

  const last = await prisma.socio.findFirst({ orderBy: { codigo: "desc" }, select: { codigo: true } });
  let codigo = last?.codigo ?? null;
  const sdRows = await prisma.socio.findMany({ where: { numeroDocumento: { startsWith: DOC_PENDIENTE_PREFIX } }, select: { numeroDocumento: true } });
  let sd = sdRows.reduce((m, s) => Math.max(m, parseInt(s.numeroDocumento.slice(DOC_PENDIENTE_PREFIX.length), 10) || 0), 0);

  let creados = 0, reusados = 0, asig = 0, ocupado = 0;
  for (const [k, g] of byName) {
    let socioId = idByName.get(k);
    if (!socioId) {
      codigo = nextCodigo(codigo); const numDoc = DOC_PENDIENTE_PREFIX + String(++sd).padStart(4, "0"); const p = parseNombre(g.rep.nombre);
      const s = await prisma.socio.create({ data: { codigo, tipoDocumento: "DNI", numeroDocumento: numDoc, apellidoPaterno: p.apellidoPaterno, apellidoMaterno: p.apellidoMaterno, nombres: p.nombres, telefono: cleanCel(g.rep.celular), fechaIngreso: FECHA_BASE, estado: "activo", observaciones: `${MARCA} Etapa 2 · SIN DNI — pendiente de regularizar · Nº padrón ${g.rep.padron || "—"} · nombre original: "${g.rep.nombre.trim()}"`, searchKey: buildSocioSearchKey({ codigo, numeroDocumento: numDoc, apellidoPaterno: p.apellidoPaterno, apellidoMaterno: p.apellidoMaterno, nombres: p.nombres }) }, select: { id: true } });
      socioId = s.id; idByName.set(k, socioId); creados++;
    } else reusados++;
    for (const pu of g.puestos) {
      const p = await prisma.puesto.findUnique({ where: { etapa_bloque_fila_numero: { etapa: 2, bloque: pu.bloque, fila: 1, numero: pu.numero } }, select: { id: true, tipo: true, asignaciones: { where: { hasta: null }, select: { id: true } } } });
      if (!p || p.tipo !== "puesto") continue;
      if (p.asignaciones.length > 0) { ocupado++; continue; }
      await prisma.puestoAsignacion.create({ data: { puestoId: p.id, socioId, desde: FECHA_BASE, motivo: "Padrón 2026 (Etapa 2, sin DNI)" } });
      await prisma.puesto.update({ where: { id: p.id }, data: { estado: "activo" } });
      asig++;
    }
  }
  console.log(`\n✅ APLICADO Etapa 2: ${creados} socios SD- creados · ${reusados} reusados · ${asig} puestos asignados${ocupado ? ` · ${ocupado} ya ocupados` : ""}.`);
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error("✗", e); await prisma.$disconnect(); process.exit(1); });
