"use server";

import { revalidatePath } from "next/cache";
import { Prisma, type Prisma as PrismaNS } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/server";
import type { PermissionKey } from "@/lib/auth/permissions";
import { toNumber } from "@/lib/money";
import { inicioDiaUTC } from "@/lib/fecha";
import { anioLima } from "@/lib/constancia/codigo";
import { nextCodigoFromList } from "@/lib/socios/codigo";
import { buildSocioSearchKey, normalizeToken } from "@/lib/socios/normalize";
import { GIRO_LABEL, DIMENSION_LABEL } from "@/lib/puestos/giro";
import { lookupDniUnamad, type DniLookupResult } from "@/lib/socios/dni-lookup";
import { validateUpload, sniffMime, SNIFF_BYTES } from "@/lib/socios/limits";
import {
  writeDocumento,
  removeDocumento,
  removeTransferenciaDir,
  extFromMime,
} from "@/lib/transferencias/storage";
import type {
  ActionResult,
  TransferenciaRow,
  ListTransferenciasParams,
  ListTransferenciasResult,
  TransferenciaDetail,
  CreateTransferenciaInput,
  FormalizarResult,
  TransferenteOption,
} from "./types";

const PAGE_SIZE = 25;
const PAGE_SIZES = [25, 50, 100];
function clampSize(n?: number): number {
  return n && PAGE_SIZES.includes(n) ? n : PAGE_SIZE;
}

class Denied extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Denied";
  }
}
async function authorize(perm: PermissionKey): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new Denied("No autenticado.");
  if (!user.permissions.has(perm))
    throw new Denied("No tienes permisos para esta acción.");
  return user;
}
function fail(error: string, fieldErrors?: Record<string, string>): ActionResult {
  return { ok: false, error, fieldErrors };
}
function ok<T>(data?: T): ActionResult<T> {
  return { ok: true, data };
}
function refresh(id?: string) {
  revalidatePath("/transferencias");
  if (id) revalidatePath(`/transferencias/${id}`);
  revalidatePath("/socios");
  revalidatePath("/puestos");
}
function isP2002(e: unknown): boolean {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002"
  );
}

function nombre(s: {
  apellidoPaterno: string;
  apellidoMaterno: string | null;
  nombres: string;
}): string {
  return `${s.apellidoPaterno} ${s.apellidoMaterno ?? ""}, ${s.nombres}`.replace(
    /\s+,/,
    ",",
  );
}

export async function listTransferencias(
  params: ListTransferenciasParams,
): Promise<ActionResult<ListTransferenciasResult>> {
  try {
    await authorize("transferencias.read");
    const p = Math.max(1, params.page ?? 1);
    const pageSize = clampSize(params.pageSize);
    const where: PrismaNS.TransferenciaWhereInput = {};
    if (params.estado) where.estado = params.estado;
    const q = params.q?.trim();
    if (q) {
      // Búsqueda multi-palabra: cada token debe aparecer (AND entre tokens) en
      // algún campo (OR entre campos). Antes se usaba el query COMPLETO como un
      // único `contains` por campo, así que un nombre de varias palabras —
      // repartido entre nombres y apellidos del adquiriente, o contra el
      // searchKey del transferente— no cabía en ningún campo y devolvía 0
      // resultados. Ahora el orden de las palabras deja de importar.
      const tokens = q.split(/\s+/).filter((t) => t.length > 0);
      if (tokens.length > 0) {
        where.AND = tokens.map((tok) => ({
          OR: [
            { codigo: { contains: tok, mode: "insensitive" } },
            { adqNumeroDocumento: { contains: tok, mode: "insensitive" } },
            { adqApellidoPaterno: { contains: tok, mode: "insensitive" } },
            { adqApellidoMaterno: { contains: tok, mode: "insensitive" } },
            { adqNombres: { contains: tok, mode: "insensitive" } },
            // El transferente es un Socio con searchKey normalizado (sin tildes).
            { transferente: { searchKey: { contains: normalizeToken(tok) } } },
            { puesto: { codigo: { contains: tok, mode: "insensitive" } } },
          ],
        }));
      }
    }

    const [total, rows] = await Promise.all([
      prisma.transferencia.count({ where }),
      prisma.transferencia.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (p - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          codigo: true,
          fecha: true,
          estado: true,
          monto: true,
          adqApellidoPaterno: true,
          adqApellidoMaterno: true,
          adqNombres: true,
          puesto: { select: { codigo: true } },
          transferente: {
            select: {
              codigo: true,
              apellidoPaterno: true,
              apellidoMaterno: true,
              nombres: true,
            },
          },
        },
      }),
    ]);

    const items: TransferenciaRow[] = rows.map((t) => ({
      id: t.id,
      codigo: t.codigo,
      fecha: t.fecha.toISOString(),
      estado: t.estado,
      transferenteNombre: nombre(t.transferente),
      transferenteCodigo: t.transferente.codigo,
      adquirienteNombre: nombre({
        apellidoPaterno: t.adqApellidoPaterno,
        apellidoMaterno: t.adqApellidoMaterno,
        nombres: t.adqNombres,
      }),
      puestoCodigo: t.puesto.codigo,
      monto: t.monto != null ? Number(t.monto) : null,
    }));

    return ok({ items, total, page: p, pageSize });
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("listTransferencias", e);
    return fail("No se pudieron cargar las transferencias.");
  }
}

export async function getTransferencia(
  id: string,
): Promise<ActionResult<TransferenciaDetail>> {
  try {
    await authorize("transferencias.read");
    const t = await prisma.transferencia.findUnique({
      where: { id },
      include: {
        puesto: {
          select: {
            codigo: true,
            giro: true,
            dimension: true,
            bloque: true,
            numero: true,
            etapa: true,
          },
        },
        transferente: {
          select: {
            codigo: true,
            tipoDocumento: true,
            numeroDocumento: true,
            numeroPadron: true,
            apellidoPaterno: true,
            apellidoMaterno: true,
            nombres: true,
          },
        },
        adquirienteSocio: { select: { codigo: true } },
        renunciaUploadedBy: { select: { name: true } },
        contratoUploadedBy: { select: { name: true } },
      },
    });
    if (!t) return fail("Transferencia no encontrada.");

    const pend = await prisma.cuota.findMany({
      where: { socioId: t.transferenteId, estado: "pendiente" },
      select: { monto: true },
    });
    const deuda = pend.reduce((a, c) => a + toNumber(c.monto), 0);

    return ok({
      id: t.id,
      codigo: t.codigo,
      fecha: t.fecha.toISOString(),
      estado: t.estado,
      transferenteNombre: nombre(t.transferente),
      transferenteCodigo: t.transferente.codigo,
      transferenteId: t.transferenteId,
      transferenteDoc: `${t.transferente.tipoDocumento} ${t.transferente.numeroDocumento}`,
      transferentePadron: t.transferente.numeroPadron,
      transferenteDeuda: deuda,
      puestoId: t.puestoId,
      puestoCodigo: t.puesto.codigo,
      puestoGiro: t.puesto.giro ? (GIRO_LABEL[t.puesto.giro] ?? null) : null,
      puestoDimension: DIMENSION_LABEL[t.puesto.dimension],
      puestoBloque: t.puesto.bloque,
      puestoNumero: t.puesto.numero,
      puestoEtapa: t.puesto.etapa,
      adquirienteNombre: nombre({
        apellidoPaterno: t.adqApellidoPaterno,
        apellidoMaterno: t.adqApellidoMaterno,
        nombres: t.adqNombres,
      }),
      adquiriente: {
        tipoDocumento: t.adqTipoDocumento,
        numeroDocumento: t.adqNumeroDocumento,
        apellidoPaterno: t.adqApellidoPaterno,
        apellidoMaterno: t.adqApellidoMaterno,
        nombres: t.adqNombres,
        estadoCivil: t.adqEstadoCivil,
        direccion: t.adqDireccion,
        distrito: t.adqDistrito,
        provincia: t.adqProvincia,
        departamento: t.adqDepartamento,
        telefono: t.adqTelefono,
      },
      adquirienteSocioId: t.adquirienteSocioId,
      adquirienteSocioCodigo: t.adquirienteSocio?.codigo ?? null,
      completadaEn: t.completadaEn ? t.completadaEn.toISOString() : null,
      createdEn: t.createdAt.toISOString(),
      monto: t.monto != null ? Number(t.monto) : null,
      renunciaUrl: t.renunciaUrl,
      contratoUrl: t.contratoUrl,
      renunciaUploadedPor: t.renunciaUploadedBy?.name ?? null,
      renunciaUploadedEn: t.renunciaUploadedAt
        ? t.renunciaUploadedAt.toISOString()
        : null,
      contratoUploadedPor: t.contratoUploadedBy?.name ?? null,
      contratoUploadedEn: t.contratoUploadedAt
        ? t.contratoUploadedAt.toISOString()
        : null,
    });
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("getTransferencia", e);
    return fail("No se pudo cargar la transferencia.");
  }
}

export async function createTransferencia(
  input: CreateTransferenciaInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const me = await authorize("transferencias.write");
    const fe: Record<string, string> = {};

    const transferente = await prisma.socio.findUnique({
      where: { id: input.transferenteId },
      select: { id: true, estado: true },
    });
    if (!transferente) return fail("Transferente no encontrado.");
    if (transferente.estado !== "activo")
      return fail("El transferente debe ser un socio activo.");

    // El puesto debe estar asignado AHORA al transferente.
    const asig = await prisma.puestoAsignacion.findFirst({
      where: {
        socioId: input.transferenteId,
        puestoId: input.puestoId,
        hasta: null,
      },
      select: { id: true },
    });
    if (!asig)
      return fail(
        "El puesto seleccionado no está asignado actualmente al transferente.",
      );

    // No permitir dos expedientes en borrador para el mismo puesto: el segundo
    // quedaría obsoleto al formalizar el primero.
    const yaBorrador = await prisma.transferencia.findFirst({
      where: { puestoId: input.puestoId, estado: "borrador" },
      select: { codigo: true },
    });
    if (yaBorrador)
      return fail(
        `Ya existe un expediente en borrador (${yaBorrador.codigo}) para este puesto. Formalízalo o anúlalo antes de crear otro.`,
      );

    const adqDoc = (input.adqNumeroDocumento ?? "").trim();
    if (input.adqTipoDocumento === "DNI" && !/^\d{8}$/.test(adqDoc))
      fe.adqNumeroDocumento = "El DNI debe tener 8 dígitos.";
    else if (!adqDoc) fe.adqNumeroDocumento = "Obligatorio.";
    if (!(input.adqApellidoPaterno ?? "").trim())
      fe.adqApellidoPaterno = "Obligatorio.";
    if (!(input.adqNombres ?? "").trim()) fe.adqNombres = "Obligatorio.";

    if (adqDoc && !fe.adqNumeroDocumento) {
      const existe = await prisma.socio.findUnique({
        where: {
          tipoDocumento_numeroDocumento: {
            tipoDocumento: input.adqTipoDocumento,
            numeroDocumento: adqDoc,
          },
        },
        select: { codigo: true },
      });
      if (existe)
        fe.adqNumeroDocumento = `Ese documento ya pertenece al socio ${existe.codigo}.`;
    }

    let monto: number | null = null;
    if (input.monto != null && String(input.monto) !== "") {
      const m = Number(input.monto);
      if (isNaN(m) || m < 0) fe.monto = "Monto inválido.";
      else monto = m > 0 ? m : null;
    }

    const fecha = inicioDiaUTC(input.fecha);
    if (isNaN(fecha.getTime())) fe.fecha = "Fecha inválida.";

    if (Object.keys(fe).length > 0)
      return fail("Revisa los campos marcados.", fe);

    const anio = anioLima(new Date());
    for (let intento = 0; intento < 5; intento++) {
      const n = await prisma.transferencia.count({
        where: { codigo: { startsWith: `TR-${anio}-` } },
      });
      const codigo = `TR-${anio}-${String(n + 1).padStart(4, "0")}`;
      try {
        const created = await prisma.transferencia.create({
          data: {
            codigo,
            transferenteId: input.transferenteId,
            puestoId: input.puestoId,
            adqTipoDocumento: input.adqTipoDocumento,
            adqNumeroDocumento: adqDoc,
            adqApellidoPaterno: input.adqApellidoPaterno.trim(),
            adqApellidoMaterno: input.adqApellidoMaterno?.trim() || null,
            adqNombres: input.adqNombres.trim(),
            adqEstadoCivil: input.adqEstadoCivil?.trim() || null,
            adqDireccion: input.adqDireccion?.trim() || null,
            adqDistrito: input.adqDistrito?.trim() || null,
            adqProvincia: input.adqProvincia?.trim() || null,
            adqDepartamento: input.adqDepartamento?.trim() || null,
            adqTelefono: input.adqTelefono?.trim() || null,
            monto: monto != null ? new Prisma.Decimal(monto.toFixed(2)) : null,
            fecha,
            createdById: me.id,
          },
          select: { id: true },
        });
        refresh();
        return ok({ id: created.id });
      } catch (e) {
        if (isP2002(e) && intento < 4) continue;
        throw e;
      }
    }
    return fail("No se pudo generar el código de la transferencia.");
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("createTransferencia", e);
    return fail("No se pudo crear la transferencia.");
  }
}

// FORMALIZAR: en UNA transacción → da de alta al adquiriente como socio nuevo,
// mueve el puesto (cierra la asignación del transferente, abre la del nuevo) y,
// si el transferente queda sin puestos, lo retira.
export async function formalizarTransferencia(
  id: string,
): Promise<ActionResult<FormalizarResult>> {
  try {
    const me = await authorize("transferencias.write");
    const head = await prisma.transferencia.findUnique({
      where: { id },
      select: { id: true, estado: true },
    });
    if (!head) return fail("Transferencia no encontrada.");
    if (head.estado !== "borrador")
      return fail("Esta transferencia ya fue formalizada o anulada.");

    // Toda la formalización ocurre dentro de UNA transacción y TODAS las
    // validaciones (estado borrador, documento duplicado, deuda, asignación
    // vigente) se re-verifican AHÍ DENTRO, tras bloquear la fila del puesto con
    // FOR UPDATE. Así una reasignación/pago/segunda formalización concurrente no
    // puede colarse entre el chequeo y la escritura (TOCTOU). El bucle reintenta
    // ante colisión de código/documento (P2002), igual que createSocio.
    for (let intento = 0; intento < 5; intento++) {
      try {
        const result = await prisma.$transaction(async (tx) => {
          const t = await tx.transferencia.findUnique({
            where: { id },
            include: { transferente: { select: { estado: true } } },
          });
          if (!t) throw new Denied("Transferencia no encontrada.");
          if (t.estado !== "borrador")
            throw new Denied("Esta transferencia ya fue formalizada o anulada.");

          // Bloquea la fila del puesto para serializar contra assignPuesto y
          // otras formalizaciones del mismo puesto.
          await tx.$queryRaw`SELECT id FROM "Puesto" WHERE id = ${t.puestoId} FOR UPDATE`;

          // El documento del adquiriente no debe pertenecer ya a un socio.
          const dup = await tx.socio.findUnique({
            where: {
              tipoDocumento_numeroDocumento: {
                tipoDocumento: t.adqTipoDocumento,
                numeroDocumento: t.adqNumeroDocumento,
              },
            },
            select: { codigo: true },
          });
          if (dup)
            throw new Denied(
              `El documento del adquiriente ya pertenece al socio ${dup.codigo}.`,
            );

          // El transferente no debe tener deuda (igual que la constancia de no adeudo).
          const pend = await tx.cuota.findMany({
            where: { socioId: t.transferenteId, estado: "pendiente" },
            select: { monto: true },
          });
          const deuda = pend.reduce((a, c) => a + toNumber(c.monto), 0);
          if (deuda > 0)
            throw new Denied(
              `El transferente mantiene una deuda de S/ ${deuda.toFixed(2)}; debe regularizarla antes de formalizar.`,
            );

          // Evidencia firmada obligatoria: carta de renuncia + contrato.
          if (!t.renunciaUrl || !t.contratoUrl)
            throw new Denied(
              "Falta subir la carta de renuncia y el contrato firmados (escaneados) para poder formalizar.",
            );

          // Aún debe tener ESTE puesto asignado.
          const asig = await tx.puestoAsignacion.findFirst({
            where: { socioId: t.transferenteId, puestoId: t.puestoId, hasta: null },
            select: { id: true },
          });
          if (!asig)
            throw new Denied("El transferente ya no tiene asignado ese puesto.");

          // 1. Alta del adquiriente como socio nuevo. El código se calcula por
          // valor numérico (no lexicográfico) para no duplicar pasado 6 dígitos.
          const codigos = await tx.socio.findMany({
            where: { codigo: { startsWith: "SOC-" } },
            select: { codigo: true },
          });
          const codigo = nextCodigoFromList(codigos.map((s) => s.codigo));
          const searchKey = buildSocioSearchKey({
            codigo,
            numeroDocumento: t.adqNumeroDocumento,
            numeroPadron: null,
            apellidoPaterno: t.adqApellidoPaterno,
            apellidoMaterno: t.adqApellidoMaterno,
            nombres: t.adqNombres,
          });
          const nuevo = await tx.socio.create({
            data: {
              codigo,
              searchKey,
              tipoDocumento: t.adqTipoDocumento,
              numeroDocumento: t.adqNumeroDocumento,
              apellidoPaterno: t.adqApellidoPaterno,
              apellidoMaterno: t.adqApellidoMaterno,
              nombres: t.adqNombres,
              estadoCivil: t.adqEstadoCivil,
              direccion: t.adqDireccion,
              distrito: t.adqDistrito,
              provincia: t.adqProvincia,
              departamento: t.adqDepartamento,
              telefono: t.adqTelefono,
              fechaIngreso: t.fecha,
              observaciones: `Alta por transferencia ${t.codigo}`,
              createdById: me.id,
              updatedById: me.id,
            },
            select: { id: true, estado: true },
          });
          await tx.socioEstadoLog.create({
            data: {
              socioId: nuevo.id,
              fromEstado: nuevo.estado,
              toEstado: nuevo.estado,
              motivo: `Alta por transferencia ${t.codigo} del puesto ${t.puestoId}`,
              byUserId: me.id,
            },
          });

          // 2. Cerrar SOLO la asignación vigente del transferente para ESTE
          // puesto (scoped por socioId) y abrir la del nuevo. Si no cierra
          // exactamente una, el estado cambió bajo nuestros pies → abortar.
          const closed = await tx.puestoAsignacion.updateMany({
            where: {
              puestoId: t.puestoId,
              socioId: t.transferenteId,
              hasta: null,
            },
            data: { hasta: t.fecha, motivo: `Transferencia ${t.codigo}` },
          });
          if (closed.count !== 1)
            throw new Denied(
              "El estado del puesto cambió durante la formalización; reintenta.",
            );
          await tx.puestoAsignacion.create({
            data: {
              puestoId: t.puestoId,
              socioId: nuevo.id,
              desde: t.fecha,
              motivo: `Transferencia ${t.codigo}`,
              byUserId: me.id,
            },
          });
          await tx.puesto.update({
            where: { id: t.puestoId },
            data: { estado: "activo" },
          });

          // 3. Si el transferente queda sin puestos vigentes → retirarlo.
          const restantes = await tx.puestoAsignacion.count({
            where: { socioId: t.transferenteId, hasta: null },
          });
          let retirado = false;
          if (restantes === 0 && t.transferente.estado === "activo") {
            await tx.socio.update({
              where: { id: t.transferenteId },
              data: { estado: "retirado" },
            });
            await tx.socioEstadoLog.create({
              data: {
                socioId: t.transferenteId,
                fromEstado: t.transferente.estado,
                toEstado: "retirado",
                motivo: `Renuncia y transferencia ${t.codigo} de su puesto`,
                byUserId: me.id,
              },
            });
            retirado = true;
          }

          // 4. Completar la transferencia condicionalmente (claim atómico): si
          // otra ejecución ya la completó, abortamos sin duplicar nada.
          const done = await tx.transferencia.updateMany({
            where: { id, estado: "borrador" },
            data: {
              estado: "completada",
              adquirienteSocioId: nuevo.id,
              completadaEn: new Date(),
            },
          });
          if (done.count !== 1)
            throw new Denied("La transferencia ya fue procesada.");

          return {
            adquirienteSocioCodigo: codigo,
            transferenteRetirado: retirado,
          };
        });

        refresh(id);
        return ok(result);
      } catch (e) {
        if (isP2002(e) && intento < 4) continue;
        throw e;
      }
    }
    return fail("No se pudo formalizar la transferencia.");
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("formalizarTransferencia", e);
    return fail("No se pudo formalizar la transferencia.");
  }
}

export async function anularTransferencia(
  id: string,
): Promise<ActionResult> {
  try {
    await authorize("transferencias.write");
    const t = await prisma.transferencia.findUnique({
      where: { id },
      select: { estado: true },
    });
    if (!t) return fail("Transferencia no encontrada.");
    if (t.estado === "completada")
      return fail("No se puede anular una transferencia ya formalizada.");
    await prisma.transferencia.update({
      where: { id },
      data: {
        estado: "anulada",
        renunciaUrl: null,
        contratoUrl: null,
        renunciaUploadedById: null,
        renunciaUploadedAt: null,
        contratoUploadedById: null,
        contratoUploadedAt: null,
      },
    });
    // Expediente muerto: no conservar los escaneos firmados (datos personales).
    await removeTransferenciaDir(id);
    refresh(id);
    return ok();
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("anularTransferencia", e);
    return fail("No se pudo anular la transferencia.");
  }
}

export async function deleteTransferencia(id: string): Promise<ActionResult> {
  try {
    await authorize("transferencias.write");
    const t = await prisma.transferencia.findUnique({
      where: { id },
      select: { estado: true },
    });
    if (!t) return fail("Transferencia no encontrada.");
    if (t.estado === "completada")
      return fail("No se puede eliminar una transferencia formalizada.");
    await prisma.transferencia.delete({ where: { id } });
    await removeTransferenciaDir(id);
    refresh();
    return ok();
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("deleteTransferencia", e);
    return fail("No se pudo eliminar la transferencia.");
  }
}

// Sube el escaneo FIRMADO de un documento (carta de renuncia o contrato). Son
// requeridos para poder formalizar. Solo en borrador.
export async function subirDocumento(
  id: string,
  tipo: "renuncia" | "contrato",
  file: File,
): Promise<ActionResult<{ url: string }>> {
  try {
    const me = await authorize("transferencias.write");
    const t = await prisma.transferencia.findUnique({
      where: { id },
      select: { estado: true, renunciaUrl: true, contratoUrl: true },
    });
    if (!t) return fail("Transferencia no encontrada.");
    if (t.estado !== "borrador")
      return fail("Solo se pueden adjuntar documentos mientras está en borrador.");

    const head = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
    const sniffed = sniffMime(head);
    const err = validateUpload(file, "doc", sniffed);
    if (err) return fail(err);

    // No confiar en file.type (lo controla el cliente): exigir que el contenido
    // real se reconozca por sus magic bytes.
    if (!sniffed)
      return fail(
        "No se reconoció el contenido del archivo. Sube un PDF o una imagen (JPG/PNG) válidos.",
      );
    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = extFromMime(sniffed);
    const fileName = `${tipo}-${Date.now()}.${ext}`;
    const url = await writeDocumento(id, fileName, buffer);

    const prev = tipo === "renuncia" ? t.renunciaUrl : t.contratoUrl;
    await prisma.transferencia.update({
      where: { id },
      data:
        tipo === "renuncia"
          ? {
              renunciaUrl: url,
              renunciaUploadedById: me.id,
              renunciaUploadedAt: new Date(),
            }
          : {
              contratoUrl: url,
              contratoUploadedById: me.id,
              contratoUploadedAt: new Date(),
            },
    });
    // Reemplazo: borrar el escaneo anterior para no acumular huérfanos.
    const prevFile = prev?.split("/").pop();
    if (prevFile && prevFile !== fileName) await removeDocumento(id, prevFile);
    refresh(id);
    return ok({ url });
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("subirDocumento", e);
    return fail("No se pudo subir el documento.");
  }
}

// Quita un escaneo firmado (vuelve a "pendiente"). Solo en borrador.
export async function quitarDocumento(
  id: string,
  tipo: "renuncia" | "contrato",
): Promise<ActionResult> {
  try {
    await authorize("transferencias.write");
    const t = await prisma.transferencia.findUnique({
      where: { id },
      select: { estado: true, renunciaUrl: true, contratoUrl: true },
    });
    if (!t) return fail("Transferencia no encontrada.");
    if (t.estado !== "borrador")
      return fail("Solo se pueden quitar documentos mientras está en borrador.");
    const url = tipo === "renuncia" ? t.renunciaUrl : t.contratoUrl;
    const fileName = url?.split("/").pop();
    if (fileName) await removeDocumento(id, fileName);
    await prisma.transferencia.update({
      where: { id },
      data:
        tipo === "renuncia"
          ? {
              renunciaUrl: null,
              renunciaUploadedById: null,
              renunciaUploadedAt: null,
            }
          : {
              contratoUrl: null,
              contratoUploadedById: null,
              contratoUploadedAt: null,
            },
    });
    refresh(id);
    return ok();
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("quitarDocumento", e);
    return fail("No se pudo quitar el documento.");
  }
}

// Busca socios ACTIVOS con puesto vigente (candidatos a transferente) por nombre
// o código, con sus puestos vigentes para elegir cuál se transfiere.
export async function buscarSociosConPuesto(
  q: string,
): Promise<ActionResult<TransferenteOption[]>> {
  try {
    await authorize("transferencias.read");
    const term = (q ?? "").trim();
    if (term.length < 2) return ok([]);
    const token = normalizeToken(term);
    const socios = await prisma.socio.findMany({
      where: {
        estado: "activo",
        searchKey: { contains: token },
        asignacionesPuesto: { some: { hasta: null } },
      },
      take: 8,
      orderBy: { apellidoPaterno: "asc" },
      select: {
        id: true,
        codigo: true,
        apellidoPaterno: true,
        apellidoMaterno: true,
        nombres: true,
        asignacionesPuesto: {
          where: { hasta: null },
          select: {
            puesto: {
              select: { id: true, codigo: true, dimension: true, giro: true },
            },
          },
        },
      },
    });
    return ok(
      socios.map((s) => ({
        id: s.id,
        codigo: s.codigo,
        nombre: nombre(s),
        puestos: s.asignacionesPuesto.map((a) => ({
          id: a.puesto.id,
          codigo: a.puesto.codigo,
          dimensionLabel: DIMENSION_LABEL[a.puesto.dimension],
          giroLabel: a.puesto.giro ? (GIRO_LABEL[a.puesto.giro] ?? null) : null,
        })),
      })),
    );
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("buscarSociosConPuesto", e);
    return fail("No se pudo buscar.");
  }
}

// Totales por estado para la tira de resumen de la lista.
export async function transferenciasStats(): Promise<
  ActionResult<{
    total: number;
    borrador: number;
    completada: number;
    anulada: number;
  }>
> {
  try {
    await authorize("transferencias.read");
    const grouped = await prisma.transferencia.groupBy({
      by: ["estado"],
      _count: { _all: true },
    });
    const m = { total: 0, borrador: 0, completada: 0, anulada: 0 };
    for (const g of grouped) {
      m[g.estado] = g._count._all;
      m.total += g._count._all;
    }
    return ok(m);
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("transferenciasStats", e);
    return fail("No se pudieron cargar los totales.");
  }
}

// Consulta el DNI del adquiriente (RENIEC vía UNAMAD) para autocompletar el form.
export async function lookupDniAdquiriente(
  dni: string,
): Promise<ActionResult<DniLookupResult>> {
  try {
    await authorize("transferencias.write");
    const clean = (dni ?? "").trim();
    if (!/^\d{8}$/.test(clean)) return fail("El DNI debe tener 8 dígitos.");
    let data: DniLookupResult | null;
    try {
      data = await lookupDniUnamad(clean);
    } catch (e) {
      console.error("lookupDniAdquiriente fetch", e);
      return fail("No se pudo consultar el servicio de DNI.");
    }
    if (!data) return fail("No se encontró información para este DNI.");
    return ok(data);
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("lookupDniAdquiriente", e);
    return fail("No se pudo consultar el DNI.");
  }
}
