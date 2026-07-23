// Anexa a Socio.observaciones las observaciones de los Excel del padrón:
//   - RELACION DE PUESTOS (version 5).xlsx · hoja "PADRON 2022" (col 40)
//   - PADRON ACTUALIZADO AL 2026.xlsx · hoja vigente "PADRON ACTUALIZADO 2026" (col 42)
//     (la copia de esa hoja dentro de RELACION también se lee; se deduplica por texto)
// Lee prisma/_obs_raw.json (extraído por el paso Python previo, ver sesión).
//
// Reglas:
//   - "CONFORME" (y variantes triviales) NO es observación: es un estado, no se guarda.
//   - Dedup por socio + texto normalizado (multi-puesto repite la misma nota).
//   - ANEXA con etiqueta de fuente ([Obs. padrón 2022] / [Obs. padrón 2026]); nunca
//     reemplaza lo existente. Idempotente: si la ficha ya contiene el texto, se salta.
//   - Match por DNI normalizado → nombre exacto → tokens ordenados (solo si unívoco).
//
//   npx tsx prisma/import-observaciones.ts            (DRY-RUN)
//   npx tsx prisma/import-observaciones.ts --apply
import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
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
const nameKeySorted = (s: string) =>
  normalizeToken((s ?? "").trim()).split(/[^a-z0-9]+/).filter(Boolean).sort().join(" ");
// Texto normalizado para dedup (no para guardar): mayúsculas y espacios colapsados.
const obsKey = (s: string) => s.toUpperCase().replace(/\s+/g, " ").trim();

type Obs = { fuente: string; fila: number; nombre: string; dni: string; obs: string };

const ETIQUETA: Record<string, string> = {
  "PADRON 2022": "[Obs. padrón 2022]",
  "PA2026(relacion)": "[Obs. padrón 2026]",
  "PA2026(vigente)": "[Obs. padrón 2026]",
};

// Aliases VERIFICADOS a mano contra la BD (variantes de grafía del Excel que el
// match por nombre no alcanza). Mapean nombre-del-Excel → DNI del socio real.
// NO agregar aquí sin verificar identidad: un alias equivocado le cuelga la
// observación a otra persona.
const ALIAS_DNI: Record<string, string> = {
  // Caso conocido Julia Mondragón (la ficha real es "Mondragon Condori Julia Paulina")
  "mondragon condori julia": "09608161",
  // Variante S/Z: en BD es JARA VILLAZANTE JUAN PEDRO
  "jara villasante juan pedro": "01687765",
};

async function main() {
  const apply = process.argv.includes("--apply");
  const raw: Obs[] = JSON.parse(readFileSync(path.join(process.cwd(), "prisma", "_obs_raw.json"), "utf8"));

  const socios = await prisma.socio.findMany({
    select: { id: true, codigo: true, numeroDocumento: true, apellidoPaterno: true, apellidoMaterno: true, nombres: true, observaciones: true },
  });
  const idByDni = new Map<string, string>();
  const idByName = new Map<string, string>();
  const idByNameSorted = new Map<string, string | null>();
  const socioById = new Map(socios.map((s) => [s.id, s]));
  for (const s of socios) {
    idByDni.set(s.numeroDocumento, s.id);
    const full = [s.apellidoPaterno, s.apellidoMaterno, s.nombres].filter(Boolean).join(" ");
    idByName.set(nameKey(full), s.id);
    const sorted = nameKeySorted(full);
    idByNameSorted.set(sorted, idByNameSorted.has(sorted) ? null : s.id);
  }

  // socioId → lista de líneas nuevas "[etiqueta] texto" (dedup por texto normalizado).
  const porSocio = new Map<string, { linea: string; key: string }[]>();
  let conformes = 0, sinSocio = 0, duplicadas = 0;
  const sinSocioDetalle = new Map<string, number>();

  for (const o of raw) {
    const texto = o.obs.replace(/\s+/g, " ").trim();
    if (/^CONFORME[\s.]*$/i.test(texto)) { conformes++; continue; }
    const dni = normDni(o.dni);
    const aliasDni = ALIAS_DNI[nameKey(o.nombre)];
    const socioId =
      (dni && idByDni.get(dni)) ||
      idByName.get(nameKey(o.nombre)) ||
      idByNameSorted.get(nameKeySorted(o.nombre)) ||
      (aliasDni && idByDni.get(aliasDni)) ||
      null;
    if (!socioId) {
      sinSocio++;
      const k = `${o.nombre} (${o.dni || "sin dni"})`;
      sinSocioDetalle.set(k, (sinSocioDetalle.get(k) ?? 0) + 1);
      continue;
    }
    const key = obsKey(texto);
    const lista = porSocio.get(socioId) ?? [];
    if (lista.some((x) => x.key === key)) { duplicadas++; continue; }
    // Idempotencia contra la ficha actual: si ya contiene el texto, no re-anexar.
    const actual = socioById.get(socioId)?.observaciones ?? "";
    if (obsKey(actual).includes(key)) { duplicadas++; continue; }
    lista.push({ linea: `${ETIQUETA[o.fuente] ?? "[Obs.]"} ${texto}`, key });
    porSocio.set(socioId, lista);
  }

  const totalLineas = [...porSocio.values()].reduce((n, l) => n + l.length, 0);
  console.log("══════ OBSERVACIONES DEL PADRÓN → FICHA DEL SOCIO ══════");
  console.log(`Observaciones leídas: ${raw.length}`);
  console.log(`  descartadas "CONFORME": ${conformes}`);
  console.log(`  duplicadas (mismo socio, mismo texto, o ya en la ficha): ${duplicadas}`);
  console.log(`  sin socio en BD: ${sinSocio}`);
  console.log(`A anexar: ${totalLineas} línea(s) en ${porSocio.size} socio(s)\n`);

  let mostrados = 0;
  for (const [socioId, lineas] of porSocio) {
    if (mostrados++ >= 12) break;
    const s = socioById.get(socioId)!;
    console.log(`· ${s.codigo} ${[s.apellidoPaterno, s.nombres].join(" ")} (${s.numeroDocumento})`);
    lineas.forEach((l) => console.log(`     + ${l.linea.slice(0, 100)}`));
  }
  if (porSocio.size > 12) console.log(`… y ${porSocio.size - 12} socios más`);
  if (sinSocioDetalle.size) {
    console.log(`\nSin socio (${sinSocioDetalle.size} identidades):`);
    [...sinSocioDetalle.entries()].slice(0, 10).forEach(([k, n]) => console.log(`   ? ${k} ×${n}`));
    if (sinSocioDetalle.size > 10) console.log(`   … y ${sinSocioDetalle.size - 10} más`);
  }

  if (!apply) { console.log("\n(DRY-RUN — usa --apply para escribir.)"); return; }

  let actualizados = 0;
  for (const [socioId, lineas] of porSocio) {
    const s = socioById.get(socioId)!;
    const base = (s.observaciones ?? "").trimEnd();
    const nuevo = [base, ...lineas.map((l) => l.linea)].filter(Boolean).join("\n");
    await prisma.socio.update({ where: { id: socioId }, data: { observaciones: nuevo } });
    actualizados++;
  }
  console.log(`\n✅ APLICADO: ${totalLineas} observación(es) anexadas en ${actualizados} socio(s).`);
}

main()
  .catch((e) => { console.error("✗", e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
