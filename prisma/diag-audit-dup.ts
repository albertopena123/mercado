// AUDITORÍA (solo lectura): para cada socio SIN-DNI, busca fichas que YA tienen
// DNI y comparten apellido paterno + nombres (tolerando el materno, como pasó con
// Jara VILLASANTE/VILLAZANTE). Clasifica por confianza según el parecido del
// apellido materno. NO escribe nada.
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { normalizeToken } from "../src/lib/socios/normalize";
import { DOC_PENDIENTE_PREFIX } from "../src/lib/socios/document";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

function toks(...p: (string | null)[]): string[] {
  return p.filter(Boolean).join(" ").split(/[^\p{L}\p{N}]+/u).map(normalizeToken).filter(Boolean);
}
function key(pat: string, nom: string): string {
  return [...toks(pat), ...toks(nom)].sort().join(" ");
}
function lev(a: string, b: string): number {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}

async function main() {
  const socios = await prisma.socio.findMany({
    select: { codigo: true, numeroDocumento: true, apellidoPaterno: true, apellidoMaterno: true, nombres: true },
  });
  const conDni = socios.filter((s) => !s.numeroDocumento.startsWith(DOC_PENDIENTE_PREFIX));
  const sinDni = socios.filter((s) => s.numeroDocumento.startsWith(DOC_PENDIENTE_PREFIX));

  const idx = new Map<string, typeof conDni>();
  for (const s of conDni) {
    const k = key(s.apellidoPaterno, s.nombres);
    if (!idx.has(k)) idx.set(k, []);
    idx.get(k)!.push(s);
  }

  const strong: string[] = [], weak: string[] = [];
  for (const s of sinDni) {
    const hits = idx.get(key(s.apellidoPaterno, s.nombres));
    if (!hits?.length) continue;
    for (const h of hits) {
      const mS = normalizeToken(s.apellidoMaterno ?? "");
      const mH = normalizeToken(h.apellidoMaterno ?? "");
      const dist = lev(mS, mH);
      const line = `${s.codigo} [${s.apellidoPaterno} ${s.apellidoMaterno} ${s.nombres}]  ⇔  ${h.codigo}(${h.numeroDocumento}) [${h.apellidoPaterno} ${h.apellidoMaterno} ${h.nombres}]  materno-dist=${dist}`;
      if (mS === mH || dist <= 2) strong.push(line);
      else weak.push(line);
    }
  }

  console.log(`SIN-DNI: ${sinDni.length} | fichas con DNI: ${conDni.length}`);
  console.log(`\n===== ALTA CONFIANZA (materno igual o casi; probable MISMA persona → consolidar): ${strong.length} =====`);
  for (const l of strong) console.log("  ", l);
  console.log(`\n===== BAJA CONFIANZA (paterno+nombres iguales pero materno distinto; revisar): ${weak.length} =====`);
  for (const l of weak) console.log("  ", l);

  // PASO 2: fuzzy sobre nombre completo (captura variantes en CUALQUIER campo,
  // incl. paterno). Reporta cuando el nombre completo difiere en ≤2 caracteres
  // o exactamente en 1 token (resto idéntico).
  console.log(`\n===== FUZZY nombre completo (dist ≤2 o 1 token distinto) =====`);
  const full = (s: { apellidoPaterno: string; apellidoMaterno: string | null; nombres: string }) =>
    toks(s.apellidoPaterno, s.apellidoMaterno, s.nombres).sort();
  let n = 0;
  for (const s of sinDni) {
    const fs = full(s), fsStr = fs.join(" ");
    for (const h of conDni) {
      const fh = full(h), fhStr = fh.join(" ");
      const d = lev(fsStr, fhStr);
      const setS = new Set(fs), setH = new Set(fh);
      const inter = [...setS].filter((t) => setH.has(t)).length;
      const oneTokenOff = fs.length >= 2 && Math.abs(fs.length - fh.length) <= 1 && inter >= Math.max(fs.length, fh.length) - 1;
      if ((d > 0 && d <= 2) || (oneTokenOff && d <= 6)) {
        console.log(`   ${s.codigo} [${fsStr}]  ~  ${h.codigo}(${h.numeroDocumento}) [${fhStr}]  dist=${d} inter=${inter}/${Math.max(fs.length, fh.length)}`);
        n++;
      }
    }
  }
  if (!n) console.log("   (ninguno)");
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
