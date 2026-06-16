// Importador del inventario 2026 (bienes). Lee prisma/_inventario.json
// (exportado del Excel "INVENTARIO FERIA MILAGROS 2026.xlsx") y crea los bienes
// de oficina + almacén + archivadores documentados. Modos:
//   (sin flag) DRY-RUN: solo reporta, no escribe.
//   --apply    : crea los bienes (marca "[Inventario 2026]").
//   --rollback : elimina los bienes importados (y su kardex en cascada).
import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  Prisma,
  PrismaClient,
  type UbicacionBien,
  type EstadoBien,
} from "../src/generated/prisma/client";
import { normalizeToken } from "../src/lib/socios/normalize";
import { nextCodigo } from "../src/lib/inventario/codigo";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const MARCA = "[Inventario 2026]";

type Raw = {
  ubicacion: "oficina" | "almacen";
  seccion: "bien" | "documento";
  nombre: string;
  unidad: string;
  marca: string;
  cantidadRaw: string;
  estadoRaw: string;
  folios: string;
};

// Estados canónicos "limpios" (si el texto es exactamente uno, no anotamos nada).
const CLEAN = new Set([
  "CONSERVADO",
  "NUEVO",
  "NUEVA",
  "NUEVAS",
  "EN USO",
  "SIN USAR",
  "DESUSO",
  "MAL ESTADO",
  "ROTA",
  "ROTO",
  "BAJA",
]);

// Orden de prioridad: ante texto mixto ("18 CONSERVADO/1 ROTA") gana el estado
// "principal" (el grueso suele estar bien) antes que los de daño.
function mapEstado(raw: string): EstadoBien {
  const s = (raw || "").toUpperCase();
  if (/NUEV/.test(s)) return "nuevo";
  if (/CONSERVAD/.test(s)) return "conservado";
  if (/EN USO/.test(s)) return "en_uso";
  if (/SIN USAR/.test(s)) return "sin_usar";
  if (/DESUSO/.test(s)) return "desuso";
  if (/MAL ESTADO/.test(s)) return "mal_estado";
  if (/ROT[AO]/.test(s)) return "roto";
  if (/BAJA/.test(s)) return "baja";
  return "conservado";
}

function parseCantidad(raw: string): { cantidad: number; nota: string | null } {
  const s = (raw || "").trim();
  if (/^\d+$/.test(s)) return { cantidad: parseInt(s, 10), nota: null };
  if (!s) return { cantidad: 0, nota: null };
  return { cantidad: 0, nota: `Cantidad original: "${s}"` };
}

function cleanMarca(raw: string): string | null {
  const s = (raw || "").trim();
  if (!s || /^\d+$/.test(s)) return null; // "1" es relleno, no una marca real
  return s;
}

function searchKey(codigo: string, nombre: string, marca: string | null, unidad: string): string {
  return [codigo, nombre, marca, unidad]
    .filter((x): x is string => Boolean(x))
    .map(normalizeToken)
    .join(" ");
}

async function main() {
  const mode = process.argv.includes("--apply")
    ? "apply"
    : process.argv.includes("--rollback")
      ? "rollback"
      : "dry";

  if (mode === "rollback") {
    const del = await prisma.bien.deleteMany({
      where: { observaciones: { startsWith: MARCA } },
    });
    console.log(`🗑  rollback: ${del.count} bienes eliminados (con su kardex).`);
    await prisma.$disconnect();
    return;
  }

  const json = readFileSync(
    path.join(process.cwd(), "prisma", "_inventario.json"),
    "utf8",
  ).replace(/^﻿/, "");
  const rows: Raw[] = JSON.parse(json);

  // Construir los registros mapeados.
  type Out = {
    ubicacion: UbicacionBien;
    nombre: string;
    unidad: string;
    marcaModelo: string | null;
    cantidad: number;
    estado: EstadoBien;
    observaciones: string;
  };
  const out: Out[] = rows.map((r) => {
    const esDoc = r.seccion === "documento";
    const nombre = esDoc ? `Archivador: ${r.nombre}` : r.nombre;
    const unidad = (r.unidad || "UND").toUpperCase().replace(/^RLLOS?$/, "ROLLOS");
    const marcaModelo = cleanMarca(r.marca);
    const { cantidad, nota } = parseCantidad(r.cantidadRaw);
    const estado = esDoc ? "conservado" : mapEstado(r.estadoRaw);

    const notas: string[] = [];
    if (esDoc) {
      notas.push("Documento archivado");
      if (r.folios) notas.push(`Folios: ${r.folios}`);
    }
    if (nota) notas.push(nota);
    if (!esDoc && r.estadoRaw && !CLEAN.has(r.estadoRaw.trim().toUpperCase())) {
      notas.push(`Estado original: "${r.estadoRaw.trim()}"`);
    }
    const observaciones = [MARCA, ...notas].join(" · ");

    return {
      ubicacion: r.ubicacion as UbicacionBien,
      nombre,
      unidad,
      marcaModelo,
      cantidad,
      estado,
      observaciones,
    };
  });

  // Resumen
  const porEstado = new Map<string, number>();
  for (const o of out) porEstado.set(o.estado, (porEstado.get(o.estado) ?? 0) + 1);
  const unidades = out.reduce((a, o) => a + o.cantidad, 0);
  console.log("═══════════ IMPORTACIÓN INVENTARIO 2026 (bienes) ═══════════");
  console.log(`Registros a crear:   ${out.length}`);
  console.log(`  · oficina:         ${out.filter((o) => o.ubicacion === "oficina").length}`);
  console.log(`  · almacén:         ${out.filter((o) => o.ubicacion === "almacen").length}`);
  console.log(`Unidades (Σ):        ${unidades}`);
  console.log(`Por estado:          ${[...porEstado].map(([k, v]) => `${k}=${v}`).join("  ")}`);
  console.log("Muestra:");
  for (const o of out.slice(0, 5))
    console.log(`  [${o.ubicacion}] ${o.nombre} — ${o.cantidad} ${o.unidad} · ${o.estado}`);

  const yaMarcados = await prisma.bien.count({
    where: { observaciones: { startsWith: MARCA } },
  });
  if (yaMarcados > 0) {
    console.log(
      `\n⚠ Ya hay ${yaMarcados} bienes importados con la marca "${MARCA}".`,
    );
    console.log("   Para reimportar primero: npx tsx prisma/import-inventario.ts --rollback");
    await prisma.$disconnect();
    return;
  }

  if (mode === "dry") {
    console.log("\n(DRY-RUN — no se escribió nada. Usa --apply para crear.)");
    await prisma.$disconnect();
    return;
  }

  // APPLY: códigos correlativos desde el máximo actual.
  const last = await prisma.bien.findFirst({
    orderBy: { codigo: "desc" },
    select: { codigo: true },
  });
  let codigo = last?.codigo ?? null;

  const data: Prisma.BienCreateManyInput[] = out.map((o) => {
    codigo = nextCodigo(codigo);
    return {
      codigo,
      nombre: o.nombre,
      ubicacion: o.ubicacion,
      unidad: o.unidad,
      marcaModelo: o.marcaModelo,
      cantidad: o.cantidad,
      estado: o.estado,
      observaciones: o.observaciones,
      searchKey: searchKey(codigo, o.nombre, o.marcaModelo, o.unidad),
    };
  });

  const res = await prisma.bien.createMany({ data });
  console.log(`\n✅ APLICADO: ${res.count} bienes creados (marca "${MARCA}").`);
  console.log("   Para revertir: npx tsx prisma/import-inventario.ts --rollback");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("✗", e);
  await prisma.$disconnect();
  process.exit(1);
});
