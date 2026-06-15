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

// Importa los PUESTOS del padrón (canónico): limpia la grilla generada y crea
// cada puesto real (etapa por dimensión, fila por sub-fila) + su asignación al
// socio dueño. Los 34 puestos con doble propietario se crean SIN dueño (vacíos)
// y se marcan en observaciones para que la directiva resuelva.
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
    fila: number;
    numero: number;
    dim: "d3x5" | "d3x3";
    owners: Set<string>;
  };
  const cells = new Map<string, Cell>();
  let sinEtapa = 0;
  let invalido = 0;
  for (const r of rows) {
    const etapa = etapaDe(r.parcela || "");
    if (!etapa) { sinEtapa++; continue; }
    const fila = filaDe(r.parcela || "");
    const numero = parseInt(String(r.numero), 10);
    if (!Number.isInteger(numero) || fila === 0) { invalido++; continue; }
    const key = `${etapa}|${r.bloque}|${fila}|${numero}`;
    let c = cells.get(key);
    if (!c) {
      c = { etapa, bloque: r.bloque, fila, numero, dim: etapa === 1 ? "d3x5" : "d3x3", owners: new Set() };
      cells.set(key, c);
    }
    const dni = normDni(r.dni);
    if (dni && dniToId.has(dni)) c.owners.add(dni);
  }

  let conflictos = 0, conUno = 0, sinDueno = 0;
  const confSample: string[] = [];
  for (const c of cells.values()) {
    if (c.owners.size > 1) {
      conflictos++;
      if (confSample.length < 8)
        confSample.push(`E${c.etapa}-${c.bloque}-${c.fila}-${c.numero}: ${[...c.owners].join(" vs ")}`);
    } else if (c.owners.size === 1) conUno++;
    else sinDueno++;
  }

  console.log("═══════════ IMPORTACIÓN PUESTOS (padrón 2026) ═══════════");
  console.log(`Puestos únicos (etapa,bloque,fila,número): ${cells.size}`);
  console.log(`  · con 1 dueño (se asignan):  ${conUno}`);
  console.log(`  · sin dueño (vacíos):        ${sinDueno}`);
  console.log(`  · CONFLICTO 2+ dueños:       ${conflictos} (vacíos, marcados para resolver)`);
  console.log(`Filas sin etapa: ${sinEtapa} | inválidas: ${invalido}`);
  console.log("─── Muestra de conflictos ───");
  confSample.forEach((s) => console.log("  " + s));

  if (!apply) {
    console.log("\n(DRY-RUN puestos — usa --puestos --apply para crear.)");
    return;
  }

  const puestoData: Prisma.PuestoCreateManyInput[] = [];
  const asignByCodigo = new Map<string, string>();
  for (const c of cells.values()) {
    const codigo = puestoCodigo(c.etapa, c.bloque, c.numero, c.fila);
    const ownerDni = c.owners.size === 1 ? [...c.owners][0] : null;
    const socioId = ownerDni ? dniToId.get(ownerDni)! : null;
    puestoData.push({
      etapa: c.etapa,
      bloque: c.bloque,
      fila: c.fila,
      numero: c.numero,
      banda: bandaPorNumero(c.numero, c.etapa),
      dimension: c.dim,
      tipo: "puesto",
      codigo,
      estado: socioId ? "activo" : "vacio",
      observaciones:
        c.owners.size > 1
          ? `${MARCA} CONFLICTO doble propietario: ${[...c.owners].join(", ")}`
          : MARCA,
      searchKey: [codigo, c.bloque].map(normalizeToken).join(" "),
    });
    if (socioId) asignByCodigo.set(codigo, socioId);
  }

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
  for (const [codigo, socioId] of asignByCodigo) {
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
