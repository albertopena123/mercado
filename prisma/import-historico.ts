// Importa el padrón histórico (4 empadronamientos) desde prisma/_historico.json.
//   npx tsx prisma/import-historico.ts              DRY-RUN: solo reporta
//   npx tsx prisma/import-historico.ts --apply      escribe
//   npx tsx prisma/import-historico.ts --rollback   borra lo importado
//
// El puesto se identifica por (etapa, bloque, número) — la parcela se ignora,
// igual que en import-etapa.ts. El enlace a socio se hace SOLO por DNI y solo
// el empadronamiento 2021 lo trae.
import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { normalizeToken } from "../src/lib/socios/normalize";
import { buildPadronRegistroSearchKey } from "../src/lib/padron/searchKey";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const FUENTE = "[Import Excel] RELACION DE PUESTOS (version 5).xlsx · hoja PADRON 2022";

const GESTIONES = [
  { key: "e2014", anio: 2014, nombre: "Gestión 2014", orden: 1 },
  { key: "e2017", anio: 2017, nombre: "Santos 2017", orden: 2 },
  { key: "e2019", anio: 2019, nombre: "Raymundo 2019", orden: 3 },
  { key: "e2021", anio: 2021, nombre: "Gestión Santos 2021", orden: 4 },
] as const;

type Celda = { nombre: string | null; padron: number | null; dni?: string | null };
type Fila = {
  filaExcel: number; etapa: number; bloque: string; numero: number;
  e2014: Celda; e2017: Celda; e2019: Celda; e2021: Celda;
};

// 5-7 dígitos → el Excel perdió el 0 a la izquierda. 9+ → dedazo: NO se corrige.
// Quitarle un dígito a un documento de identidad es adivinar; se reporta y lo
// resuelve la Fase 2 de reconciliación con la directiva a la vista.
function normDni(raw: unknown): string | null {
  const s = String(raw ?? "").trim().replace(/\s+/g, "");
  if (!/^\d+$/.test(s)) return null;
  if (s.length >= 5 && s.length <= 7) return s.padStart(8, "0");
  if (s.length === 8) return s;
  return null;
}

// Separa "APELLIDOS NOMBRES (vendido 2023)" en nombre limpio + anotación.
function partirNombre(raw: string | null): { nombre: string | null; observacion: string | null } {
  if (!raw) return { nombre: null, observacion: null };
  const m = raw.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
  if (!m) return { nombre: raw.replace(/\s+/g, " ").trim() || null, observacion: null };
  return {
    nombre: m[1].replace(/\s+/g, " ").trim() || null,
    observacion: m[2].trim() || null,
  };
}

// Tokens significativos de un nombre, para el VETO (nunca para unir).
function tokensNombre(s: string | null): Set<string> {
  return new Set(
    normalizeToken(s ?? "")
      .replace(/\([^)]*\)/g, " ")
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2),
  );
}

async function main() {
  const apply = process.argv.includes("--apply");
  const rollback = process.argv.includes("--rollback");

  if (rollback) {
    // Solo borra los empadronamientos importados (por `fuente`). Si algún día el
    // sistema registra el empadronamiento 2026 de forma nativa, este rollback no
    // debe tocarlo. Los registros caen por ON DELETE CASCADE.
    const del = await prisma.empadronamiento.deleteMany({ where: { fuente: FUENTE } });
    console.log(`rollback: ${del.count} empadronamiento(s) eliminados (registros en cascada)`);
    return;
  }

  const filas: Fila[] = JSON.parse(
    readFileSync(path.join(process.cwd(), "prisma", "_historico.json"), "utf8"),
  );

  const puestos = await prisma.puesto.findMany({
    select: { id: true, etapa: true, bloque: true, numero: true, codigo: true },
  });
  const puestoPorLlave = new Map(
    puestos.map((p) => [`${p.etapa}-${p.bloque}-${p.numero}`, p]),
  );

  const socios = await prisma.socio.findMany({
    select: { id: true, numeroDocumento: true, apellidoPaterno: true, apellidoMaterno: true, nombres: true },
  });
  const socioPorDni = new Map(socios.map((s) => [s.numeroDocumento, s]));

  const stats = {
    sinPuesto: 0, registros: 0, conDni: 0,
    enlazados: 0, vetados: 0, dniInvalido: 0, dniSinSocio: 0,
  };
  const incidencias: string[] = [];

  type Pendiente = {
    gestionKey: string; puestoId: string; filaExcel: number;
    nombreOriginal: string | null; nombre: string | null; observacion: string | null;
    numeroPadron: number | null; numeroDocumento: string | null;
    socioId: string | null; searchKey: string;
  };
  const pendientes: Pendiente[] = [];

  for (const f of filas) {
    const p = puestoPorLlave.get(`${f.etapa}-${f.bloque}-${f.numero}`);
    if (!p) {
      stats.sinPuesto++;
      incidencias.push(`SIN PUESTO EN BD: E${f.etapa}-${f.bloque}-${f.numero} (fila ${f.filaExcel})`);
      continue;
    }
    for (const g of GESTIONES) {
      const celda = f[g.key] as Celda;
      if (!celda.nombre && celda.padron === null) continue; // sin dato = sin fila

      const { nombre, observacion: anotacion } = partirNombre(celda.nombre);
      const notas: string[] = [];
      if (anotacion) notas.push(anotacion);

      let numeroDocumento: string | null = null;
      let socioId: string | null = null;

      if (g.key === "e2021" && celda.dni != null && String(celda.dni).trim() !== "") {
        stats.conDni++;
        const dni = normDni(celda.dni);
        if (!dni) {
          stats.dniInvalido++;
          notas.push(`DNI inválido en origen: ${String(celda.dni).trim()}`);
          incidencias.push(`DNI INVÁLIDO ${p.codigo}: "${String(celda.dni).trim()}" (${nombre ?? "?"})`);
        } else {
          numeroDocumento = dni;
          const s = socioPorDni.get(dni);
          if (!s) {
            stats.dniSinSocio++;
            incidencias.push(`DNI SIN SOCIO ${p.codigo}: ${dni} (${nombre ?? "?"})`);
          } else {
            // VETO: el nombre no crea el enlace, solo puede impedirlo. Si el DNI
            // calza con un socio de nombre ajeno, el dato de origen es sospechoso
            // y enlazar sería peor que no hacerlo.
            const tSocio = tokensNombre(`${s.apellidoPaterno} ${s.apellidoMaterno ?? ""} ${s.nombres}`);
            const tOrigen = tokensNombre(nombre);
            if (tOrigen.size === 0) {
              // Celda sin nombre (en blanco, o solo una anotación entre paréntesis
              // que `partirNombre` ya extrajo aparte): no hay nada con qué comparar.
              // Eso NO es una contradicción — el veto solo existe para detectar un
              // nombre ajeno, y la ausencia de nombre no es ajena a nada. El DNI
              // sigue siendo la única fuente de verdad del enlace, así que se
              // enlaza igual; se deja constancia para que un humano lo revise.
              socioId = s.id;
              stats.enlazados++;
              notas.push(`enlazado por DNI sin nombre en origen para verificar`);
              incidencias.push(
                `ENLAZADO SIN NOMBRE ${p.codigo}: dni=${dni} (celda sin nombre en el Excel) -> bd="${s.apellidoPaterno} ${s.nombres}"`,
              );
            } else {
              const comparte = [...tOrigen].some((t) => tSocio.has(t));
              if (comparte) {
                socioId = s.id;
                stats.enlazados++;
              } else {
                stats.vetados++;
                notas.push(`enlace vetado: DNI ${dni} corresponde a otro nombre en el padrón`);
                incidencias.push(
                  `VETADO ${p.codigo}: dni=${dni} excel="${nombre}" vs bd="${s.apellidoPaterno} ${s.nombres}"`,
                );
              }
            }
          }
        }
      }

      pendientes.push({
        gestionKey: g.key,
        puestoId: p.id,
        filaExcel: f.filaExcel,
        nombreOriginal: celda.nombre,
        nombre,
        observacion: notas.length ? notas.join(" · ") : null,
        numeroPadron: celda.padron,
        numeroDocumento,
        socioId,
        searchKey: buildPadronRegistroSearchKey({
          nombreOriginal: celda.nombre,
          numeroDocumento,
          numeroPadron: celda.padron,
          puestoCodigo: p.codigo,
        }),
      });
      stats.registros++;
    }
  }

  console.log(`\nfilas leídas        : ${filas.length}`);
  console.log(`puestos sin resolver: ${stats.sinPuesto}`);
  console.log(`registros a escribir: ${stats.registros}`);
  for (const g of GESTIONES) {
    console.log(`  ${g.nombre}: ${pendientes.filter((x) => x.gestionKey === g.key).length}`);
  }
  console.log(`\nceldas con DNI 2021 : ${stats.conDni}`);
  console.log(`  enlazados         : ${stats.enlazados}`);
  console.log(`  vetados           : ${stats.vetados}`);
  console.log(`  DNI sin socio     : ${stats.dniSinSocio}`);
  console.log(`  DNI inválido      : ${stats.dniInvalido}`);
  if (incidencias.length) {
    console.log(`\nincidencias (${incidencias.length}):`);
    incidencias.forEach((i) => console.log("  " + i));
  }

  if (!apply) {
    console.log("\nDRY-RUN: nada se escribió. Repite con --apply.");
    return;
  }

  const idPorGestion = new Map<string, string>();
  for (const g of GESTIONES) {
    const e = await prisma.empadronamiento.upsert({
      where: { anio: g.anio },
      update: { nombre: g.nombre, orden: g.orden, fuente: FUENTE },
      create: { anio: g.anio, nombre: g.nombre, orden: g.orden, fuente: FUENTE },
    });
    idPorGestion.set(g.key, e.id);
  }

  let escritos = 0;
  for (const x of pendientes) {
    const empadronamientoId = idPorGestion.get(x.gestionKey)!;
    const datos = {
      nombreOriginal: x.nombreOriginal, nombre: x.nombre, observacion: x.observacion,
      numeroPadron: x.numeroPadron, numeroDocumento: x.numeroDocumento,
      socioId: x.socioId, searchKey: x.searchKey, filaExcel: x.filaExcel,
    };
    await prisma.padronRegistro.upsert({
      where: { empadronamientoId_puestoId: { empadronamientoId, puestoId: x.puestoId } },
      update: datos,
      create: { empadronamientoId, puestoId: x.puestoId, ...datos },
    });
    escritos++;
  }
  console.log(`\nAPLICADO: ${escritos} registros (upsert, idempotente).`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
