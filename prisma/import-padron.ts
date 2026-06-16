// Importador del padrón 2026 (socios). Lee prisma/_padron.json (exportado del
// Excel) y crea los socios únicos por DNI. Modos:
//   (sin flag) DRY-RUN: solo reporta, no escribe.
//   --apply    : crea los socios nuevos.
//   --rollback : elimina los socios importados (marca "[Padrón 2026]").
//
// NO importa puestos: el layout del Excel (bloque + sub-fila 1/2/3 + número) no
// calza con la grilla (etapa,bloque,número) del sistema y tiene 34 conflictos
// de doble propietario; eso requiere reconciliación con la directiva.
import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../src/generated/prisma/client";
import { buildSocioSearchKey, normalizeToken } from "../src/lib/socios/normalize";
import { nextCodigo } from "../src/lib/socios/codigo";
import { puestoCodigo, bandaPorNumero } from "../src/lib/puestos/giro";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const MARCA = "[Padrón 2026]";
const FECHA_BASE = new Date("2021-01-01T00:00:00.000Z"); // baseline (gestión 2021)

type Row = {
  fila: number;
  dni: string;
  nombre: string;
  celular: string;
  padron: string;
  bloque: string;
  parcela: string;
  numero: string;
};

function normDni(raw: string): string | null {
  const s = (raw ?? "").trim().replace(/\s+/g, "");
  if (!/^\d+$/.test(s)) return null;
  if (s.length >= 5 && s.length <= 7) return s.padStart(8, "0"); // Excel perdió el 0
  if (s.length === 8) return s;
  return null;
}

function parseNombre(raw: string): {
  apellidoPaterno: string;
  apellidoMaterno: string | null;
  nombres: string;
} {
  const t = raw.trim().replace(/\s+/g, " ").split(" ");
  if (t.length === 1) return { apellidoPaterno: t[0], apellidoMaterno: null, nombres: "—" };
  if (t.length === 2) return { apellidoPaterno: t[0], apellidoMaterno: null, nombres: t[1] };
  return { apellidoPaterno: t[0], apellidoMaterno: t[1], nombres: t.slice(2).join(" ") };
}

function etapaDe(parcela: string): 1 | 2 | 0 {
  if (parcela.includes("3*5")) return 1;
  if (parcela.includes("3*3")) return 2;
  return 0;
}
function filaDe(parcela: string): number {
  const m = parcela.trim().match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

// Importa los PUESTOS del padrón (canónico) RENUMERANDO corrido por (etapa,
// bloque): cada etapa de cada bloque queda 1,2,3… sin huecos ni repetidos
// (Etapa 1 = 3×5, Etapa 2 = 3×3). El número original del Excel se guarda en
// observaciones. Bloque M = 1 fila de 12 (el "local"). Puestos con doble
// propietario se crean vacíos y marcados para que la directiva resuelva.
async function importPuestos(rows: Row[], apply: boolean) {
  const socios = await prisma.socio.findMany({
    select: { id: true, numeroDocumento: true, tipoDocumento: true },
  });
  const dniToId = new Map<string, string>();
  for (const s of socios)
    if (s.tipoDocumento === "DNI") dniToId.set(s.numeroDocumento, s.id);

  type Cell = {
    etapa: number;
    bloque: string;
    filaOrig: number;
    numeroOrig: number;
    dim: "d3x5" | "d3x3";
    owners: Set<string>;
  };
  // Posiciones únicas por (etapa,bloque,fila,número original), EXCEPTO M.
  const cells = new Map<string, Cell>();
  let sinEtapa = 0;
  for (const r of rows) {
    if (r.bloque === "M") continue;
    const etapa = etapaDe(r.parcela || "");
    if (!etapa) { sinEtapa++; continue; }
    const filaOrig = filaDe(r.parcela || "");
    const numeroOrig = parseInt(String(r.numero), 10);
    if (!Number.isInteger(numeroOrig) || filaOrig === 0) continue;
    const key = `${etapa}|${r.bloque}|${filaOrig}|${numeroOrig}`;
    let c = cells.get(key);
    if (!c) {
      c = { etapa, bloque: r.bloque, filaOrig, numeroOrig, dim: etapa === 1 ? "d3x5" : "d3x3", owners: new Set() };
      cells.set(key, c);
    }
    const dni = normDni(r.dni);
    if (dni && dniToId.has(dni)) c.owners.add(dni);
  }

  // Renumerar corrido 1..N por (etapa,bloque), respetando el orden físico.
  type Final = {
    etapa: number;
    bloque: string;
    numero: number;
    dim: "d3x5" | "d3x3";
    owners: Set<string>;
    ref: string;
    tipo?: "puesto" | "sshh" | "almacen";
    estado?: "activo" | "vacio" | "clausurado" | "construccion";
  };
  const finals: Final[] = [];
  const groups = new Map<string, Cell[]>();
  for (const c of cells.values()) {
    const k = `${c.etapa}|${c.bloque}`;
    const a = groups.get(k);
    if (a) a.push(c); else groups.set(k, [c]);
  }
  for (const arr of groups.values()) {
    arr.sort((a, b) => a.filaOrig - b.filaOrig || a.numeroOrig - b.numeroOrig);
    let seq = 0;
    for (const c of arr) {
      seq++;
      finals.push({ etapa: c.etapa, bloque: c.bloque, numero: seq, dim: c.dim, owners: c.owners, ref: `Excel: fila ${c.filaOrig} n.º ${c.numeroOrig}` });
    }
  }

  // Bloque M: 1 fila de 12 puestos (Etapa 2 / 3×3). Dueños por número (1–12).
  const mOwners = new Map<number, Set<string>>();
  for (const r of rows) {
    if (r.bloque !== "M") continue;
    const numero = parseInt(String(r.numero), 10);
    if (!Number.isInteger(numero) || numero < 1 || numero > 12) continue;
    const dni = normDni(r.dni);
    if (!mOwners.has(numero)) mOwners.set(numero, new Set());
    if (dni && dniToId.has(dni)) mOwners.get(numero)!.add(dni);
  }
  for (let n = 1; n <= 12; n++) {
    finals.push({ etapa: 2, bloque: "M", numero: n, dim: "d3x3", owners: mOwners.get(n) ?? new Set(), ref: "Bloque M (local)" });
  }

  // Espacios de la ASOCIACIÓN en Etapa 1 bloque A (no están en el padrón de
  // socios): 2 puestos en alquiler + 1 SS-HH. Se numeran después de los de socios.
  {
    const e1aNums = finals.filter((f) => f.etapa === 1 && f.bloque === "A").map((f) => f.numero);
    let nx = e1aNums.length ? Math.max(...e1aNums) : 0;
    finals.push({ etapa: 1, bloque: "A", numero: ++nx, dim: "d3x5", owners: new Set(), ref: "En alquiler — propiedad de la asociación", estado: "activo" });
    finals.push({ etapa: 1, bloque: "A", numero: ++nx, dim: "d3x5", owners: new Set(), ref: "En alquiler — propiedad de la asociación", estado: "activo" });
    finals.push({ etapa: 1, bloque: "A", numero: ++nx, dim: "d3x5", owners: new Set(), ref: "SS-HH — propiedad de la asociación", tipo: "sshh", estado: "activo" });
  }

  let conUno = 0, sinDueno = 0, conflictos = 0;
  for (const f of finals) {
    if (f.owners.size > 1) conflictos++;
    else if (f.owners.size === 1) conUno++;
    else sinDueno++;
  }
  const cnt = new Map<string, number>();
  for (const f of finals) { const k = `E${f.etapa}-${f.bloque}`; cnt.set(k, (cnt.get(k) ?? 0) + 1); }

  console.log("═══════ IMPORTACIÓN PUESTOS (renumerado corrido, padrón 2026) ═══════");
  console.log(`Puestos totales: ${finals.length}  (sin etapa omitidas: ${sinEtapa})`);
  console.log(`  · con dueño:   ${conUno}`);
  console.log(`  · sin dueño:   ${sinDueno}`);
  console.log(`  · conflicto:   ${conflictos} (vacíos, marcados)`);
  console.log("Por etapa-bloque:");
  console.log("  " + [...cnt.entries()].sort().map(([k, v]) => `${k}=${v}`).join("  "));

  if (!apply) {
    console.log("\n(DRY-RUN puestos — usa --puestos --apply para crear.)");
    return;
  }

  const puestoData: Prisma.PuestoCreateManyInput[] = finals.map((f) => {
    const codigo = puestoCodigo(f.etapa, f.bloque, f.numero);
    const owner = f.owners.size === 1 ? [...f.owners][0] : null;
    return {
      etapa: f.etapa,
      bloque: f.bloque,
      fila: 1,
      numero: f.numero,
      banda: bandaPorNumero(f.numero, f.etapa),
      dimension: f.dim,
      tipo: f.tipo ?? "puesto",
      codigo,
      estado: f.estado ?? (owner ? "activo" : "vacio"),
      observaciones:
        f.owners.size > 1
          ? `${MARCA} CONFLICTO doble propietario: ${[...f.owners].join(", ")} · ${f.ref}`
          : `${MARCA} ${f.ref}`,
      searchKey: [codigo, f.bloque].map(normalizeToken).join(" "),
    };
  });
  const ownerByCodigo = new Map<string, string>();
  for (const f of finals)
    if (f.owners.size === 1)
      ownerByCodigo.set(puestoCodigo(f.etapa, f.bloque, f.numero), dniToId.get([...f.owners][0])!);

  const delA = await prisma.puestoAsignacion.deleteMany({});
  const delP = await prisma.puesto.deleteMany({});
  console.log(`\nGrilla anterior eliminada: ${delP.count} puestos, ${delA.count} asignaciones.`);

  const cr = await prisma.puesto.createMany({ data: puestoData });
  const created = await prisma.puesto.findMany({
    where: { observaciones: { startsWith: MARCA } },
    select: { id: true, codigo: true },
  });
  const codeToId = new Map(created.map((p) => [p.codigo, p.id]));
  const asignData: Prisma.PuestoAsignacionCreateManyInput[] = [];
  for (const [codigo, socioId] of ownerByCodigo) {
    const pid = codeToId.get(codigo);
    if (pid) asignData.push({ puestoId: pid, socioId, desde: FECHA_BASE, motivo: "Padrón 2026" });
  }
  const crA = await prisma.puestoAsignacion.createMany({ data: asignData });
  console.log(`✅ Puestos creados: ${cr.count} | asignaciones: ${crA.count}`);
  console.log(`   Para revertir: npx tsx prisma/import-padron.ts --rollback`);
}

async function main() {
  const mode = process.argv.includes("--apply")
    ? "apply"
    : process.argv.includes("--rollback")
      ? "rollback"
      : "dry";

  if (mode === "rollback") {
    // Orden: asignaciones → puestos → socios (la FK puesto es Restrict).
    const asg = await prisma.puestoAsignacion.deleteMany({
      where: { motivo: "Padrón 2026" },
    });
    const pst = await prisma.puesto.deleteMany({
      where: { observaciones: { startsWith: MARCA } },
    });
    const del = await prisma.socio.deleteMany({
      where: { observaciones: { startsWith: MARCA } },
    });
    console.log(
      `🗑  rollback: ${del.count} socios, ${pst.count} puestos, ${asg.count} asignaciones eliminados.`,
    );
    await prisma.$disconnect();
    return;
  }

  const json = readFileSync(
    path.join(process.cwd(), "prisma", "_padron.json"),
    "utf8",
  ).replace(/^﻿/, ""); // PowerShell Out-File utf8 antepone un BOM
  const rows: Row[] = JSON.parse(json);

  if (process.argv.includes("--puestos")) {
    await importPuestos(rows, mode === "apply");
    await prisma.$disconnect();
    return;
  }

  // Agrupar por DNI (un socio = un DNI). Conserva primer nombre/celular/padrón.
  const porDni = new Map<string, { rep: Row; puestos: number }>();
  let sinDni = 0;
  let dniInvalido = 0;
  for (const r of rows) {
    const dni = normDni(r.dni);
    if (!r.dni) { sinDni++; continue; }
    if (!dni) { dniInvalido++; continue; }
    const cur = porDni.get(dni);
    if (cur) cur.puestos++;
    else porDni.set(dni, { rep: { ...r, dni }, puestos: 1 });
  }

  // Socios ya existentes (los 3 reales o importaciones previas) → no duplicar.
  const existentes = await prisma.socio.findMany({
    where: { tipoDocumento: "DNI" },
    select: { numeroDocumento: true },
  });
  const existSet = new Set(existentes.map((s) => s.numeroDocumento));

  const nuevos: { dni: string; rep: Row; puestos: number }[] = [];
  let yaExisten = 0;
  for (const [dni, v] of porDni) {
    if (existSet.has(dni)) { yaExisten++; continue; }
    nuevos.push({ dni, rep: v.rep, puestos: v.puestos });
  }

  console.log("═══════════════ IMPORTACIÓN PADRÓN 2026 (socios) ═══════════════");
  console.log(`Filas totales:            ${rows.length}`);
  console.log(`DNIs únicos válidos:      ${porDni.size}`);
  console.log(`  · ya existen en BD:     ${yaExisten}`);
  console.log(`  · NUEVOS a crear:       ${nuevos.length}`);
  console.log(`Filas sin DNI (omitidas): ${sinDni}`);
  console.log(`DNIs inválidos (omitidos):${dniInvalido}`);
  console.log("─── Muestra de parseo de nombre (revisar apellidos) ───");
  for (const n of nuevos.slice(0, 8)) {
    const p = parseNombre(n.rep.nombre);
    console.log(
      `  ${n.dni} | "${n.rep.nombre}" → ap='${p.apellidoPaterno}' am='${p.apellidoMaterno ?? ""}' nom='${p.nombres}' (${n.puestos} puesto/s)`,
    );
  }

  if (mode === "dry") {
    console.log("\n(DRY-RUN — no se escribió nada. Usa --apply para crear.)");
    await prisma.$disconnect();
    return;
  }

  // APPLY: generar códigos secuenciales desde el máximo actual y crear en lote.
  const last = await prisma.socio.findFirst({
    orderBy: { codigo: "desc" },
    select: { codigo: true },
  });
  let codigo = last?.codigo ?? null;

  const data: Prisma.SocioCreateManyInput[] = nuevos.map((n) => {
    codigo = nextCodigo(codigo);
    const p = parseNombre(n.rep.nombre);
    const obs =
      `${MARCA} Nº padrón ${n.rep.padron || "—"} · ${n.puestos} puesto(s) en el padrón · ` +
      `nombre original: "${n.rep.nombre.trim()}"`;
    return {
      codigo,
      tipoDocumento: "DNI" as const,
      numeroDocumento: n.dni,
      apellidoPaterno: p.apellidoPaterno,
      apellidoMaterno: p.apellidoMaterno,
      nombres: p.nombres,
      telefono: n.rep.celular || null,
      fechaIngreso: FECHA_BASE,
      estado: "activo" as const,
      observaciones: obs,
      searchKey: buildSocioSearchKey({
        codigo,
        numeroDocumento: n.dni,
        apellidoPaterno: p.apellidoPaterno,
        apellidoMaterno: p.apellidoMaterno,
        nombres: p.nombres,
      }),
    };
  });

  const res = await prisma.socio.createMany({ data, skipDuplicates: true });
  console.log(`\n✅ APLICADO: ${res.count} socios creados (marca "${MARCA}").`);
  console.log(`   Para revertir: npx tsx prisma/import-padron.ts --rollback`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("✗", e);
  await prisma.$disconnect();
  process.exit(1);
});
