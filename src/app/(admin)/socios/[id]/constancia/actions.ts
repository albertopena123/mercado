"use server";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/server";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { toNumber } from "@/lib/money";
import { appBaseUrl } from "@/lib/url";
import {
  anioLima,
  formatFolio,
  generarCodigoVerificacion,
} from "@/lib/constancia/codigo";
import { generarQrSvg } from "@/lib/constancia/qr";
import type { ActionResult } from "../../types";
import { VIGENCIA_DIAS, type EmitResult, type TipoConstancia } from "./shared";
import { contarInasistenciasInjustificadas } from "./asistencia";

function fail(error: string): ActionResult<EmitResult> {
  return { ok: false, error };
}
function ok(data: EmitResult): ActionResult<EmitResult> {
  return { ok: true, data };
}

function isP2002(e: unknown): boolean {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002"
  );
}

// Deuda detectada DENTRO de la transacción de emisión (re-validación anti-TOCTOU
// para la constancia de no adeudo). Se propaga con su mensaje hasta el catch.
class DeudaError extends Error {}

// Tolerancia para comparar montos en coma flotante (medio centavo).
const EPS = 0.005;

/**
 * Emite (registra) una constancia de socio hábil. Vuelve a validar en el
 * servidor que el socio esté ACTIVO y SIN deuda — el candado no puede saltarse
 * desde el cliente. Devuelve el folio, el código de verificación, la vigencia y
 * el QR (SVG) que enlaza a la página pública de validación.
 */
export async function emitirConstancia(
  socioId: string,
  tipo: TipoConstancia = "socio_habil",
  motivo?: string,
): Promise<ActionResult<EmitResult>> {
  try {
    // Emitir CREA un registro oficial y consume un folio: exige permiso de
    // escritura, no solo lectura. (La vista previa en page.tsx sí usa
    // "socios.read": ver la previa no genera nada.)
    const me = await requirePermission("socios.write");

    // Finalidad: obligatoria en la constancia de socio (nominatividad: el
    // documento se emite "para" algo concreto, no genérico). Opcional en la de
    // no adeudo, cuyo fin (transferencia / acreditar estar al día) es implícito.
    const motivoClean = (motivo ?? "").trim();
    if (tipo === "socio_habil" && !motivoClean)
      return fail("Indica la finalidad de la constancia (para qué se solicita).");

    const socio = await prisma.socio.findUnique({
      where: { id: socioId },
      include: {
        cuotas: { where: { estado: "pendiente" }, select: { monto: true } },
      },
    });
    if (!socio) return fail("Socio no encontrado.");

    const deuda = socio.cuotas.reduce((acc, c) => acc + toNumber(c.monto), 0);
    if (socio.estado !== "activo")
      return fail("Solo se puede emitir la constancia a socios activos.");
    // La de socio (membresía) se emite aunque haya deuda; la de no adeudo no.
    if (tipo === "no_adeudo" && deuda > 0)
      return fail(
        "El socio mantiene deuda pendiente; no se puede emitir la constancia de no adeudo.",
      );
    // La de no adeudo exige además estar al día en asambleas (Reglamento Interno
    // de Administración, Disp. CUARTA): sin inasistencias injustificadas a
    // asambleas ya concluidas. Se subsanan justificando esas asistencias.
    if (tipo === "no_adeudo") {
      const inasistencias = await contarInasistenciasInjustificadas(socio.id);
      if (inasistencias > 0)
        return fail(
          `El socio registra ${inasistencias} inasistencia(s) injustificada(s) a asambleas; regularícelas (justificándolas) antes de emitir la constancia de no adeudo.`,
        );
    }

    const nombre = `${socio.nombres} ${socio.apellidoPaterno} ${
      socio.apellidoMaterno ?? ""
    }`
      .replace(/\s+/g, " ")
      .trim();

    const now = new Date();
    const anio = anioLima(now);
    const validoHasta = new Date(now.getTime() + VIGENCIA_DIAS * 86_400_000);

    // Reintentos por si el folio (correlativo dentro de la transacción) o el
    // código aleatorio colisionan con otra emisión concurrente.
    let row: { folio: string; codigo: string } | null = null;
    for (let intento = 0; intento < 6; intento++) {
      const codigo = generarCodigoVerificacion(anio);
      try {
        row = await prisma.$transaction(async (tx) => {
          // Lock por año (se libera al commit): serializa el cálculo del
          // correlativo para que dos emisiones simultáneas no obtengan el mismo
          // folio. count()+1 por sí solo no es atómico.
          // $executeRaw (no $queryRaw): la función devuelve void y $queryRaw no
          // puede deserializar esa columna; $executeRaw solo ejecuta.
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`constancia-folio-${anio}`}))`;
          // Correlativo POR AÑO (reinicia en 000001 cada año). Perú es UTC-5
          // fijo (sin horario de verano), por eso el offset -05:00 es seguro.
          const desde = new Date(`${anio}-01-01T00:00:00-05:00`);
          const hasta = new Date(`${anio + 1}-01-01T00:00:00-05:00`);
          const n = await tx.constancia.count({
            where: { emitidoEn: { gte: desde, lt: hasta } },
          });
          const folio = formatFolio(n + 1, anio);
          // Re-validación AUTORITATIVA de la deuda dentro de la transacción: una
          // cuota pendiente creada entre la lectura inicial y este commit haría
          // falsa la afirmación de "no adeudo". habil refleja la realidad al
          // momento de emitir (activo y sin deuda), no un valor fijo.
          const pendTx = await tx.cuota.findMany({
            where: { socioId: socio.id, estado: "pendiente" },
            select: { monto: true },
          });
          const deudaTx = pendTx.reduce((acc, c) => acc + toNumber(c.monto), 0);
          if (tipo === "no_adeudo" && deudaTx > EPS)
            throw new DeudaError(
              "El socio mantiene deuda pendiente; no se puede emitir la constancia de no adeudo.",
            );
          const habil = socio.estado === "activo" && deudaTx <= EPS;

          // Una sola vigente por socio (solo la de socio/membresía, que es la
          // que se presta al mal uso): al emitir una nueva, se anulan las
          // vigentes anteriores del mismo socio. Así toda copia/fotocopia previa
          // pasa a verificarse como ANULADA por su QR.
          if (tipo === "socio_habil") {
            await tx.constancia.updateMany({
              where: {
                socioId: socio.id,
                tipo: "socio_habil",
                anulada: false,
                validoHasta: { gt: now },
              },
              data: {
                anulada: true,
                anuladaEn: now,
                anuladaPorId: me.id,
                motivoAnulacion: `Reemplazada por la constancia ${folio}`,
              },
            });
          }

          return tx.constancia.create({
            data: {
              folio,
              codigo,
              tipo,
              motivo: motivoClean || null,
              socioId: socio.id,
              socioCodigo: socio.codigo,
              socioNombre: nombre,
              tipoDocumento: socio.tipoDocumento,
              numeroDocumento: socio.numeroDocumento,
              estadoSnapshot: socio.estado,
              habil,
              emitidoEn: now,
              validoHasta,
              emitidoPorId: me.id,
            },
            select: { folio: true, codigo: true },
          });
        });
        break;
      } catch (e) {
        if (isP2002(e) && intento < 5) continue;
        throw e;
      }
    }
    if (!row) return fail("No se pudo generar el folio de la constancia.");

    const verifyUrl = `${await appBaseUrl()}/verificar/${row.codigo}`;
    const qrSvg = await generarQrSvg(verifyUrl);

    // Refresca el historial de constancias del socio (una emisión puede haber
    // anulado la vigente anterior).
    revalidatePath(`/socios/${socioId}/constancia`);

    return ok({
      folio: row.folio,
      codigo: row.codigo,
      emitidoEn: now.toISOString(),
      validoHasta: validoHasta.toISOString(),
      verifyUrl,
      qrSvg,
    });
  } catch (e) {
    // requirePermission redirige lanzando NEXT_REDIRECT; re-lanzarlo para no
    // tragarnos la redirección a /403 mostrando un error genérico.
    unstable_rethrow(e);
    if (e instanceof DeudaError) return fail(e.message);
    console.error("emitirConstancia", e);
    return fail("No se pudo emitir la constancia.");
  }
}

/**
 * Anula (revoca) una constancia. Al anularla, su verificación pública por QR
 * pasa a mostrar "ANULADA" para toda copia impresa/fotocopia. Se usa cuando el
 * mercado detecta un mal uso (p. ej. una constancia de socio exhibida para
 * "vender" un puesto). Registra quién, cuándo y por qué (auditoría).
 */
export async function anularConstancia(
  constanciaId: string,
  motivo: string,
): Promise<ActionResult> {
  try {
    const me = await requirePermission("socios.write");
    const motivoClean = (motivo ?? "").trim();
    if (!motivoClean)
      return { ok: false, error: "Indica el motivo de la anulación." };

    const c = await prisma.constancia.findUnique({
      where: { id: constanciaId },
      select: { socioId: true, anulada: true },
    });
    if (!c) return { ok: false, error: "Constancia no encontrada." };
    if (c.anulada) return { ok: false, error: "La constancia ya estaba anulada." };

    // Transición condicional (anulada=false → true) para no pisar una anulación
    // concurrente ni re-anular.
    const res = await prisma.constancia.updateMany({
      where: { id: constanciaId, anulada: false },
      data: {
        anulada: true,
        anuladaEn: new Date(),
        anuladaPorId: me.id,
        motivoAnulacion: motivoClean,
      },
    });
    if (res.count !== 1)
      return { ok: false, error: "La constancia ya estaba anulada." };

    if (c.socioId) revalidatePath(`/socios/${c.socioId}/constancia`);
    return { ok: true };
  } catch (e) {
    unstable_rethrow(e);
    console.error("anularConstancia", e);
    return { ok: false, error: "No se pudo anular la constancia." };
  }
}
