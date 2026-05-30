"use server";

import { headers } from "next/headers";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/server";
import { unstable_rethrow } from "next/navigation";
import { toNumber } from "@/lib/money";
import {
  anioLima,
  formatFolio,
  generarCodigoVerificacion,
} from "@/lib/constancia/codigo";
import { generarQrSvg } from "@/lib/constancia/qr";
import type { ActionResult } from "../../types";
import { VIGENCIA_DIAS, type EmitResult } from "./shared";

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

async function baseUrl(): Promise<string> {
  const env = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "");
  if (env) return env;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ??
    (process.env.NODE_ENV === "production" ? "https" : "http");
  return `${proto}://${host}`;
}

/**
 * Emite (registra) una constancia de socio hábil. Vuelve a validar en el
 * servidor que el socio esté ACTIVO y SIN deuda — el candado no puede saltarse
 * desde el cliente. Devuelve el folio, el código de verificación, la vigencia y
 * el QR (SVG) que enlaza a la página pública de validación.
 */
export async function emitirConstancia(
  socioId: string,
): Promise<ActionResult<EmitResult>> {
  try {
    // Emitir CREA un registro oficial y consume un folio: exige permiso de
    // escritura, no solo lectura. (La vista previa en page.tsx sí usa
    // "socios.read": ver la previa no genera nada.)
    const me = await requirePermission("socios.write");

    const socio = await prisma.socio.findUnique({
      where: { id: socioId },
      include: {
        cuotas: { where: { estado: "pendiente" }, select: { monto: true } },
      },
    });
    if (!socio) return fail("Socio no encontrado.");

    const deuda = socio.cuotas.reduce((acc, c) => acc + toNumber(c.monto), 0);
    if (socio.estado !== "activo")
      return fail(
        "Solo los socios activos pueden recibir una constancia de socio hábil.",
      );
    if (deuda > 0)
      return fail(
        "El socio mantiene deuda pendiente; debe regularizarla antes de emitir la constancia.",
      );

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
          return tx.constancia.create({
            data: {
              folio,
              codigo,
              socioId: socio.id,
              socioCodigo: socio.codigo,
              socioNombre: nombre,
              tipoDocumento: socio.tipoDocumento,
              numeroDocumento: socio.numeroDocumento,
              estadoSnapshot: socio.estado,
              habil: true,
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

    const verifyUrl = `${await baseUrl()}/verificar/${row.codigo}`;
    const qrSvg = await generarQrSvg(verifyUrl);

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
    console.error("emitirConstancia", e);
    return fail("No se pudo emitir la constancia.");
  }
}
