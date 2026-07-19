import "dotenv/config";
import { readFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { searchTokens, normalizeToken } from "../src/lib/socios/normalize";

// Importa la matriz histórica de guardianía (Excel de seguridad 2023-2025) ya
// limpiada a JSON (scripts/clean_guardiania.py → {pagos, cuentas}). Matchea contra
// el padrón OFICIAL vigente en la BD: socio por Nº de padrón (fallback nombre) y
// puesto por (etapa, bloque, número). Los pagos se importan TODOS (con snapshot,
// aunque el socio/puesto no exista en el padrón); las CUENTAS de morosidad solo se
// crean para puestos oficiales. Idempotente: borra los pagos origen=import antes.

type PagoIn = {
  fecha: string; fechaCorregida: boolean; nroRecibo: string | null;
  periodo: string; mesEtiqueta: string | null; importe: number;
  etapa: number | null; bloque: string | null; numeroPuesto: number | null;
  parcela: string | null; socioNombre: string; numeroPadron: number | null;
};
type CuentaIn = {
  etapa: number | null; bloque: string | null; numeroPuesto: number | null;
  parcela: string | null; socioNombre: string; numeroPadron: number | null;
  celular: string | null; tarifaMensual: number | null; inicioPeriodo: string | null;
  totalCancelado: number | null; deudaBaseline: number | null;
};

const tokKey = (s: string) => [...new Set(searchTokens(s))].sort().join(" ");
const puestoKey = (e: number | null, b: string | null, n: number | null) =>
  `${e ?? ""}|${(b ?? "").toUpperCase()}|${n ?? ""}`;

async function main() {
  const jsonPath = process.argv[2];
  if (!jsonPath) throw new Error("uso: import-guardiania <guardiania-clean.json>");
  const { pagos, cuentas } = JSON.parse(readFileSync(jsonPath, "utf8")) as {
    pagos: PagoIn[]; cuentas: CuentaIn[];
  };

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  // --- Índices del padrón OFICIAL ---
  const socios = await prisma.socio.findMany({
    select: { id: true, numeroPadron: true, apellidoPaterno: true, apellidoMaterno: true, nombres: true },
  });
  const byPadron = new Map<number, typeof socios>();
  const byName = new Map<string, typeof socios>();
  for (const s of socios) {
    if (s.numeroPadron != null) (byPadron.get(s.numeroPadron) ?? byPadron.set(s.numeroPadron, []).get(s.numeroPadron)!).push(s);
    const k = tokKey(`${s.apellidoPaterno} ${s.apellidoMaterno ?? ""} ${s.nombres}`);
    (byName.get(k) ?? byName.set(k, []).get(k)!).push(s);
  }
  const puestos = await prisma.puesto.findMany({ select: { id: true, etapa: true, bloque: true, numero: true } });
  const byPuesto = new Map<string, typeof puestos>();
  for (const p of puestos) {
    const k = puestoKey(p.etapa, p.bloque, p.numero);
    (byPuesto.get(k) ?? byPuesto.set(k, []).get(k)!).push(p);
  }

  function matchSocio(padron: number | null, nombre: string): string | null {
    const nk = tokKey(nombre);
    const byN = byName.get(nk) ?? [];
    if (padron != null) {
      const cands = byPadron.get(padron) ?? [];
      if (cands.length === 1) return cands[0].id;
      if (cands.length > 1) {
        const inter = cands.filter((c) => tokKey(`${c.apellidoPaterno} ${c.apellidoMaterno ?? ""} ${c.nombres}`) === nk);
        if (inter.length === 1) return inter[0].id;
        return null;
      }
    }
    return byN.length === 1 ? byN[0].id : null;
  }
  function matchPuesto(etapa: number | null, bloque: string | null, numero: number | null): string | null {
    const cands = byPuesto.get(puestoKey(etapa ?? 1, bloque, numero)) ?? [];
    return cands.length === 1 ? cands[0].id : null;
  }

  // --- Idempotencia: borrar import previo ---
  const del = await prisma.guardianiaPago.deleteMany({ where: { origen: "import" } });
  console.log(`borrados pagos origen=import previos: ${del.count}`);

  // --- Insertar pagos ---
  let mSocio = 0, mPuesto = 0;
  const data = pagos.map((p) => {
    const socioId = matchSocio(p.numeroPadron, p.socioNombre);
    const puestoId = matchPuesto(p.etapa, p.bloque, p.numeroPuesto);
    if (socioId) mSocio++;
    if (puestoId) mPuesto++;
    const searchKey = [p.socioNombre, p.nroRecibo, p.bloque, p.numeroPuesto != null ? String(p.numeroPuesto) : null, p.numeroPadron != null ? String(p.numeroPadron) : null]
      .filter((x): x is string => Boolean(x)).map(normalizeToken).join(" ");
    return {
      fecha: new Date(`${p.fecha}T00:00:00.000Z`),
      nroRecibo: p.nroRecibo, periodo: p.periodo, mesEtiqueta: p.mesEtiqueta,
      importe: p.importe, socioId, puestoId,
      etapa: p.etapa, bloque: p.bloque, numeroPuesto: p.numeroPuesto, parcela: p.parcela,
      socioNombre: p.socioNombre, numeroPadron: p.numeroPadron,
      origen: "import" as const,
      observacion: p.fechaCorregida ? "fecha estimada (mes cubierto)" : null,
      searchKey,
    };
  });
  const CHUNK = 500;
  for (let i = 0; i < data.length; i += CHUNK) {
    await prisma.guardianiaPago.createMany({ data: data.slice(i, i + CHUNK) });
  }
  console.log(`pagos insertados: ${data.length}`);
  console.log(`  con socio oficial: ${mSocio} (${((mSocio / data.length) * 100).toFixed(1)}%)`);
  console.log(`  con puesto oficial: ${mPuesto} (${((mPuesto / data.length) * 100).toFixed(1)}%)`);

  // --- Cuentas de morosidad (solo puestos oficiales) ---
  const seen = new Set<string>();
  let cCreadas = 0, cSaltadas = 0;
  for (const c of cuentas) {
    const puestoId = matchPuesto(c.etapa, c.bloque, c.numeroPuesto);
    if (!puestoId || seen.has(puestoId)) { cSaltadas++; continue; }
    seen.add(puestoId);
    const socioId = matchSocio(c.numeroPadron, c.socioNombre);
    const tarifa = c.tarifaMensual ?? (c.parcela && c.parcela.includes("3*5") ? 45 : 30);
    const inicio = c.inicioPeriodo ?? "2023-10";
    await prisma.guardianiaCuenta.upsert({
      where: { puestoId },
      create: { puestoId, socioId, tarifaMensual: tarifa, inicioPeriodo: inicio, deudaBaseline: c.deudaBaseline ?? null, activo: true },
      update: { socioId, tarifaMensual: tarifa, inicioPeriodo: inicio, deudaBaseline: c.deudaBaseline ?? null },
    });
    cCreadas++;
  }
  console.log(`cuentas creadas (puestos oficiales): ${cCreadas}   saltadas (sin puesto oficial/dup): ${cSaltadas}`);

  const totImporte = await prisma.guardianiaPago.aggregate({ _sum: { importe: true }, where: { origen: "import" } });
  console.log(`\nverificacion: importe total en BD = S/ ${Number(totImporte._sum.importe ?? 0).toLocaleString("es-PE")}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error("x", e); process.exit(1); });
