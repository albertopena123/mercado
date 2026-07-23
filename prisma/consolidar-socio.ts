// Consolida DOS fichas del MISMO socio (duplicado) en una sola. Mueve todas las
// relaciones (puestos, cuotas, guardianía, comprobantes, caja, etc.) de DROP a
// KEEP, elimina duplicados que colisionan por índice único, y borra DROP.
//
//   npx tsx prisma/consolidar-socio.ts <KEEP> <DROP>            DRY-RUN (no escribe)
//   npx tsx prisma/consolidar-socio.ts <KEEP> <DROP> --apply    ejecuta en 1 transacción
//
// KEEP/DROP son códigos de socio (p. ej. SOC-000354 SOC-000420). KEEP es la ficha
// que SOBREVIVE (típicamente la que tiene DNI real).
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { buildSocioSearchKey, normalizeToken } from "../src/lib/socios/normalize";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const [KEEP_COD, DROP_COD] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const APPLY = process.argv.includes("--apply");
// --set-name "PATERNO|MATERNO|NOMBRES" corrige el nombre de la ficha que sobrevive
// (útil cuando la ficha con DNI tiene los campos desordenados). Reconstruye searchKey.
const SET_NAME = (process.argv.find((a) => a.startsWith("--set-name=")) ?? "").replace("--set-name=", "");

function toks(...p: (string | null)[]): string[] {
  return p.filter(Boolean).join(" ").split(/[^\p{L}\p{N}]+/u).map(normalizeToken).filter(Boolean);
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
  if (!KEEP_COD || !DROP_COD) throw new Error("uso: consolidar-socio.ts <KEEP> <DROP> [--apply]");
  const keep = await prisma.socio.findUnique({ where: { codigo: KEEP_COD } });
  const drop = await prisma.socio.findUnique({ where: { codigo: DROP_COD } });
  if (!keep) throw new Error("KEEP no existe: " + KEEP_COD);
  if (!drop) throw new Error("DROP no existe: " + DROP_COD);
  if (keep.id === drop.id) throw new Error("KEEP y DROP son la misma ficha");

  // GUARDA de seguridad por CONJUNTO de tokens (no por campo): los dos deben
  // compartir todos-menos-uno de sus tokens de nombre completo, y el token que
  // difiere debe ser una variante ortográfica cercana (lev ≤ 2). Así tolera
  // campos desordenados (pat/mat/nom) y una S/Z, pero rechaza a dos personas
  // distintas (p. ej. QUISPE TUEROS vs QUISPE HUANCA). Aborta si no calza.
  const tK = toks(keep.apellidoPaterno, keep.apellidoMaterno, keep.nombres);
  const tD = toks(drop.apellidoPaterno, drop.apellidoMaterno, drop.nombres);
  const setK = new Set(tK), setD = new Set(tD);
  const inter = [...setK].filter((t) => setD.has(t)).length;
  const maxN = Math.max(tK.length, tD.length);
  const restoK = tK.filter((t) => !setD.has(t));
  const restoD = tD.filter((t) => !setK.has(t));
  const variante = restoK.length <= 1 && restoD.length <= 1 &&
    (restoK.length === 0 || restoD.length === 0 || lev(restoK[0], restoD[0]) <= 2);
  if (!(inter >= maxN - 1 && variante)) {
    throw new Error(
      `GUARDA: no parecen la misma persona (inter=${inter}/${maxN}, difK=[${restoK}], difD=[${restoD}]).\n  KEEP: ${keep.apellidoPaterno} ${keep.apellidoMaterno} / ${keep.nombres}\n  DROP: ${drop.apellidoPaterno} ${drop.apellidoMaterno} / ${drop.nombres}`,
    );
  }

  console.log(`KEEP ${KEEP_COD}: ${keep.tipoDocumento} ${keep.numeroDocumento} · ${keep.apellidoPaterno} ${keep.apellidoMaterno} ${keep.nombres}`);
  console.log(`DROP ${DROP_COD}: ${drop.tipoDocumento} ${drop.numeroDocumento} · ${drop.apellidoPaterno} ${drop.apellidoMaterno} ${drop.nombres}`);

  // Asistencias que colisionan (misma asamblea ya registrada en KEEP) → se borran.
  const keepAsist = new Set((await prisma.asistencia.findMany({ where: { socioId: keep.id }, select: { asambleaId: true } })).map((a) => a.asambleaId));
  const dropAsist = await prisma.asistencia.findMany({ where: { socioId: drop.id }, select: { id: true, asambleaId: true } });
  const asistBorrar = dropAsist.filter((a) => keepAsist.has(a.asambleaId)).map((a) => a.id);
  const asistMover = dropAsist.filter((a) => !keepAsist.has(a.asambleaId)).map((a) => a.id);

  // Cuotas que colisionan por (periodo, concepto) → NO se pueden mover; abortan.
  const keepCuotaKey = new Set((await prisma.cuota.findMany({ where: { socioId: keep.id }, select: { periodo: true, concepto: true } })).map((c) => `${c.periodo}|${c.concepto}`));
  const dropCuotas = await prisma.cuota.findMany({ where: { socioId: drop.id }, select: { id: true, periodo: true, concepto: true } });
  const cuotaColision = dropCuotas.filter((c) => keepCuotaKey.has(`${c.periodo}|${c.concepto}`));

  // Conteos de todo lo que se mueve.
  const [puestos, cuotasN, gCuentas, comprobantes, caja, constancias, renuncias,
    adjuntos, estadoLog, solic, regsPub, regsPadron, transTrans, transAdq, directivos, gPagos] = await Promise.all([
    prisma.puestoAsignacion.count({ where: { socioId: drop.id } }),
    prisma.cuota.count({ where: { socioId: drop.id } }),
    prisma.guardianiaCuenta.count({ where: { socioId: drop.id } }),
    prisma.comprobante.count({ where: { socioId: drop.id } }),
    prisma.movimientoCaja.count({ where: { socioId: drop.id } }),
    prisma.constancia.count({ where: { socioId: drop.id } }),
    prisma.renuncia.count({ where: { socioId: drop.id } }),
    prisma.socioAdjunto.count({ where: { socioId: drop.id } }),
    prisma.socioEstadoLog.count({ where: { socioId: drop.id } }),
    prisma.solicitudActualizacionDatos.count({ where: { socioId: drop.id } }),
    prisma.solicitudRegistroPublico.count({ where: { socioVinculadoId: drop.id } }),
    prisma.padronRegistro.count({ where: { socioId: drop.id } }),
    prisma.transferencia.count({ where: { transferenteId: drop.id } }),
    prisma.transferencia.count({ where: { adquirienteSocioId: drop.id } }),
    prisma.directivo.count({ where: { socioId: drop.id } }),
    prisma.guardianiaPago.count({ where: { socioId: drop.id } }),
  ]);

  console.log("\nPLAN de consolidación (DROP → KEEP):");
  console.log("  puestoAsignacion mover:", puestos);
  console.log("  cuotas mover:", cuotasN, cuotaColision.length ? `(¡${cuotaColision.length} COLISIONAN!)` : "");
  console.log("  guardianiaCuenta mover:", gCuentas, "| guardianiaPago mover:", gPagos);
  console.log("  comprobantes:", comprobantes, "| caja:", caja, "| constancias:", constancias, "| renuncias:", renuncias);
  console.log("  adjuntos:", adjuntos, "| estadoLog:", estadoLog, "| solicitudes:", solic, "| regPublico:", regsPub, "| padronRegistro:", regsPadron);
  console.log("  transferencias(transferente):", transTrans, "| (adquiriente):", transAdq, "| directivos:", directivos);
  console.log("  asistencias: borrar", asistBorrar.length, "(redundantes) · mover", asistMover.length);
  if (SET_NAME) {
    const [p, m, n] = SET_NAME.split("|");
    console.log(`  corregir nombre KEEP → pat="${p}" mat="${m}" nom="${n}" (+ searchKey)`);
  }
  console.log("  → borrar ficha DROP:", DROP_COD);

  if (cuotaColision.length) {
    console.error("\nABORTADO: hay cuotas que colisionan por (periodo, concepto). Requiere resolución manual:");
    for (const c of cuotaColision) console.error("  ", c.periodo, c.concepto);
    process.exit(1);
  }
  if (transTrans > 0) {
    console.error("\nABORTADO: DROP es transferente en", transTrans, "transferencia(s) (onDelete Cascade). Revisar a mano.");
    process.exit(1);
  }

  if (!APPLY) {
    console.log("\nDRY-RUN. Nada se escribió. Reejecuta con --apply para consolidar.");
    await prisma.$disconnect();
    return;
  }

  await prisma.$transaction(async (tx) => {
    const to = { socioId: keep.id };
    await tx.puestoAsignacion.updateMany({ where: { socioId: drop.id }, data: to });
    await tx.cuota.updateMany({ where: { socioId: drop.id }, data: to });
    await tx.guardianiaCuenta.updateMany({ where: { socioId: drop.id }, data: to });
    await tx.guardianiaPago.updateMany({ where: { socioId: drop.id }, data: to });
    await tx.comprobante.updateMany({ where: { socioId: drop.id }, data: to });
    await tx.movimientoCaja.updateMany({ where: { socioId: drop.id }, data: to });
    await tx.constancia.updateMany({ where: { socioId: drop.id }, data: to });
    await tx.renuncia.updateMany({ where: { socioId: drop.id }, data: to });
    await tx.socioAdjunto.updateMany({ where: { socioId: drop.id }, data: to });
    await tx.socioEstadoLog.updateMany({ where: { socioId: drop.id }, data: to });
    await tx.solicitudActualizacionDatos.updateMany({ where: { socioId: drop.id }, data: to });
    await tx.padronRegistro.updateMany({ where: { socioId: drop.id }, data: to });
    await tx.directivo.updateMany({ where: { socioId: drop.id }, data: to });
    await tx.transferencia.updateMany({ where: { adquirienteSocioId: drop.id }, data: { adquirienteSocioId: keep.id } });
    await tx.solicitudRegistroPublico.updateMany({ where: { socioVinculadoId: drop.id }, data: { socioVinculadoId: keep.id } });
    // asistencias: mover las no-colisionantes, borrar las redundantes
    if (asistMover.length) await tx.asistencia.updateMany({ where: { id: { in: asistMover } }, data: to });
    if (asistBorrar.length) await tx.asistencia.deleteMany({ where: { id: { in: asistBorrar } } });

    // Nota de auditoría en KEEP (y limpia el "SIN DNI pendiente" si aplica).
    const nota = `[Consolidado ${new Date().toISOString().slice(0, 10)}] fusionada ficha duplicada ${DROP_COD} (era ${drop.numeroDocumento}); se le sumó el puesto y sus obligaciones.`;
    const obsLimpia = (keep.observaciones ?? "").replace(/\s*·?\s*SIN DNI — pendiente de regularizar/gi, "");
    const upd: {
      observaciones: string;
      apellidoPaterno?: string;
      apellidoMaterno?: string | null;
      nombres?: string;
      searchKey?: string;
    } = { observaciones: `${obsLimpia}\n${nota}`.trim() };
    if (SET_NAME) {
      const [p, m, n] = SET_NAME.split("|").map((x) => x.trim());
      upd.apellidoPaterno = p;
      upd.apellidoMaterno = m || null;
      upd.nombres = n;
      upd.searchKey = buildSocioSearchKey({
        codigo: keep.codigo,
        numeroDocumento: keep.numeroDocumento,
        numeroPadron: keep.numeroPadron,
        apellidoPaterno: p,
        apellidoMaterno: m || null,
        nombres: n,
      });
    }
    await tx.socio.update({ where: { id: keep.id }, data: upd });

    // Finalmente, borra la ficha vacía.
    await tx.socio.delete({ where: { id: drop.id } });
  });

  console.log("\n✔ Consolidado. Verificando…");
  const post = await prisma.socio.findUnique({ where: { codigo: KEEP_COD }, include: { asignacionesPuesto: { include: { puesto: { select: { codigo: true } } } } } });
  const cuotasPost = await prisma.cuota.count({ where: { socioId: keep.id } });
  const gc = await prisma.guardianiaCuenta.count({ where: { socioId: keep.id } });
  const dropGone = await prisma.socio.findUnique({ where: { codigo: DROP_COD } });
  console.log("KEEP puestos:", post?.asignacionesPuesto.map((a) => a.puesto.codigo));
  console.log("KEEP cuotas:", cuotasPost, "| guardianiaCuentas:", gc);
  console.log("DROP existe?:", dropGone ? "SÍ (ERROR)" : "no ✔");
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
