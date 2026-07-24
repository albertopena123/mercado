"use server";

import { revalidatePath } from "next/cache";
import {
  Prisma,
  type EstadoAsistencia,
  type TipoAsamblea,
  type EstadoAsamblea,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/server";
import type { PermissionKey } from "@/lib/auth/permissions";
import { peruDateTime } from "@/lib/fecha";
import { toNumber } from "@/lib/money";
import { generarCodigoVerificacion, anioLima } from "@/lib/constancia/codigo";
import { generarQrSvg } from "@/lib/constancia/qr";
import { appBaseUrl } from "@/lib/url";
import { currentQrToken } from "@/lib/asambleas/qrToken";
import { buildStyledXlsx, type XlsxColumn } from "@/lib/xlsx";
import { ORG } from "@/lib/org";
import { esDocumentoPendiente } from "@/lib/socios/document";
import type {
  ActionResult,
  CreateAsambleaInput,
  UpdateAsambleaPatch,
  ListAsambleasResult,
  AsambleaDetail,
  AsambleaRow,
  CheckInResult,
  AplicarMultasResult,
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
  revalidatePath("/asambleas");
  if (id) revalidatePath(`/asambleas/${id}`);
}

function socioNombre(s: {
  apellidoPaterno: string;
  apellidoMaterno: string | null;
  nombres: string;
}): string {
  return `${s.apellidoPaterno} ${s.apellidoMaterno ?? ""}, ${s.nombres}`.replace(
    /\s+,/,
    ",",
  );
}

export async function listAsambleas(params: {
  page?: number;
  pageSize?: number;
  q?: string;
  estado?: EstadoAsamblea;
}): Promise<ActionResult<ListAsambleasResult>> {
  try {
    await authorize("asambleas.read");
    const p = Math.max(1, params.page ?? 1);
    const pageSize = clampSize(params.pageSize);
    const where: Prisma.AsambleaWhereInput = {};
    if (params.estado) where.estado = params.estado;
    const q = params.q?.trim();
    if (q) where.titulo = { contains: q, mode: "insensitive" };

    const [total, rows] = await Promise.all([
      prisma.asamblea.count({ where }),
      prisma.asamblea.findMany({
        where,
        orderBy: { fecha: "desc" },
        skip: (p - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          titulo: true,
          tipo: true,
          fecha: true,
          estado: true,
          quorumMinimo: true,
          _count: { select: { asistencias: true } },
          asistencias: {
            where: { estado: { in: ["presente", "tardanza"] } },
            select: { id: true },
          },
        },
      }),
    ]);

    const items: AsambleaRow[] = rows.map((a) => ({
      id: a.id,
      titulo: a.titulo,
      tipo: a.tipo,
      fecha: a.fecha.toISOString(),
      estado: a.estado,
      total: a._count.asistencias,
      asistieron: a.asistencias.length,
      quorumMinimo: a.quorumMinimo,
    }));

    return ok({ items, total, page: p, pageSize });
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("listAsambleas", e);
    return fail("No se pudieron cargar las asambleas.");
  }
}

export async function getAsamblea(
  id: string,
): Promise<ActionResult<AsambleaDetail>> {
  try {
    await authorize("asambleas.read");
    const a = await prisma.asamblea.findUnique({
      where: { id },
      include: {
        asistencias: {
          include: {
            socio: {
              select: {
                id: true,
                codigo: true,
                numeroDocumento: true,
                apellidoPaterno: true,
                apellidoMaterno: true,
                nombres: true,
              },
            },
          },
          orderBy: [
            { socio: { apellidoPaterno: "asc" } },
            { socio: { nombres: "asc" } },
          ],
        },
      },
    });
    if (!a) return fail("Asamblea no encontrada.");

    const counts = { presente: 0, ausente: 0, justificado: 0, tardanza: 0 };
    for (const x of a.asistencias) counts[x.estado]++;

    return ok({
      id: a.id,
      titulo: a.titulo,
      tipo: a.tipo,
      fecha: a.fecha.toISOString(),
      lugar: a.lugar,
      agenda: a.agenda,
      estado: a.estado,
      quorumMinimo: a.quorumMinimo,
      toleranciaMin: a.toleranciaMin,
      multaTardanza: a.multaTardanza != null ? Number(a.multaTardanza) : null,
      multaInasistencia:
        a.multaInasistencia != null ? Number(a.multaInasistencia) : null,
      multasAplicadasEn: a.multasAplicadasEn
        ? a.multasAplicadasEn.toISOString()
        : null,
      total: a.asistencias.length,
      presente: counts.presente,
      ausente: counts.ausente,
      justificado: counts.justificado,
      tardanza: counts.tardanza,
      asistencias: a.asistencias.map((x) => ({
        id: x.id,
        socioId: x.socioId,
        socioNombre: socioNombre(x.socio),
        socioCodigo: x.socio.codigo,
        // Documento real para buscar/escanear en el check-in; los socios sin DNI
        // llevan el placeholder SIN-DNI-#### que NO debe matchear una búsqueda por
        // número, así que lo dejamos en null (se busca por nombre/código).
        socioDni: esDocumentoPendiente(x.socio.numeroDocumento)
          ? null
          : x.socio.numeroDocumento,
        estado: x.estado,
        observacion: x.observacion,
        marcadoEn: x.updatedAt.toISOString(),
      })),
    });
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("getAsamblea", e);
    return fail("No se pudo cargar la asamblea.");
  }
}

// Valida un monto de multa (S/): vacío/null → null; debe ser 0–100000. Si es 0
// también queda null (sin multa de ese tipo).
function parseMulta(
  v: number | null | undefined,
  key: string,
  fe: Record<string, string>,
): number | null {
  if (v == null || String(v) === "") return null;
  const m = Number(v);
  if (isNaN(m) || m < 0 || m > 100000) {
    fe[key] = "Monto inválido (0–100000).";
    return null;
  }
  return m > 0 ? m : null;
}

export async function createAsamblea(
  input: CreateAsambleaInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const me = await authorize("asambleas.write");
    const titulo = (input.titulo ?? "").trim();
    const fe: Record<string, string> = {};
    if (titulo.length < 3) fe.titulo = "El título es obligatorio.";
    // fecha + hora de inicio combinadas, interpretadas como hora de Perú
    const fecha = input.fecha
      ? peruDateTime(input.fecha, input.hora ?? "00:00")
      : null;
    if (!fecha || isNaN(fecha.getTime())) fe.fecha = "Fecha inválida.";
    let quorum: number | null = null;
    if (input.quorumMinimo != null && String(input.quorumMinimo) !== "") {
      const n = Number(input.quorumMinimo);
      if (isNaN(n) || n < 0 || n > 100) fe.quorumMinimo = "Debe ser 0–100.";
      else quorum = n;
    }
    let tolerancia = 15;
    if (input.toleranciaMin != null && String(input.toleranciaMin) !== "") {
      const t = Number(input.toleranciaMin);
      if (isNaN(t) || t < 0 || t > 240) fe.toleranciaMin = "0–240 min.";
      else tolerancia = t;
    }
    const multaTardanza = parseMulta(input.multaTardanza, "multaTardanza", fe);
    const multaInasistencia = parseMulta(
      input.multaInasistencia,
      "multaInasistencia",
      fe,
    );
    if (Object.keys(fe).length > 0)
      return fail("Revisa los campos marcados.", fe);

    // Snapshot de socios activos al momento de crear la asamblea.
    const activos = await prisma.socio.findMany({
      where: { estado: "activo" },
      select: { id: true },
    });

    const created = await prisma.$transaction(async (tx) => {
      const asamblea = await tx.asamblea.create({
        data: {
          titulo,
          tipo: input.tipo,
          fecha: fecha!,
          lugar: input.lugar?.trim() || null,
          agenda: input.agenda?.trim() || null,
          quorumMinimo: quorum,
          toleranciaMin: tolerancia,
          multaTardanza,
          multaInasistencia,
          codigoVerificacion: generarCodigoVerificacion(anioLima()),
          createdById: me.id,
        },
      });
      if (activos.length > 0) {
        await tx.asistencia.createMany({
          data: activos.map((s) => ({
            asambleaId: asamblea.id,
            socioId: s.id,
            estado: "ausente" as EstadoAsistencia,
          })),
        });
      }
      return asamblea;
    });

    refresh();
    return ok({ id: created.id });
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("createAsamblea", e);
    return fail("No se pudo crear la asamblea.");
  }
}

export async function updateAsamblea(
  id: string,
  patch: UpdateAsambleaPatch,
): Promise<ActionResult> {
  try {
    await authorize("asambleas.write");
    const data: Prisma.AsambleaUpdateInput = {};
    if (patch.titulo !== undefined) {
      const t = patch.titulo.trim();
      if (t.length < 3) return fail("Título inválido.", { titulo: "Mínimo 3." });
      data.titulo = t;
    }
    if (patch.tipo !== undefined) {
      if (patch.tipo !== "ordinaria" && patch.tipo !== "extraordinaria")
        return fail("Tipo de asamblea inválido.", { tipo: "Inválido." });
      data.tipo = patch.tipo as TipoAsamblea;
    }
    // El estado (programada/en_curso/cerrada) es la "puerta" del registro de
    // asistencia y su cambio está reservado a setEstadoAsamblea, que exige el
    // permiso fuerte 'asambleas.attendance'. Esta acción solo edita datos de la
    // asamblea con 'asambleas.write': ignora patch.estado para que un rol con
    // write pero sin attendance no pueda abrir/cerrar el registro por esta vía.
    if (patch.fecha !== undefined) {
      // Combinar fecha + hora interpretadas como hora de Perú (igual que
      // createAsamblea); antes usaba new Date() (UTC/zona del servidor) e
      // ignoraba la hora, corriendo el instante de inicio.
      const d = peruDateTime(patch.fecha, patch.hora ?? "00:00");
      if (isNaN(d.getTime())) return fail("Fecha inválida.", { fecha: "Inválida." });
      data.fecha = d;
    }
    if (patch.lugar !== undefined) data.lugar = patch.lugar.trim() || null;
    if (patch.agenda !== undefined) data.agenda = patch.agenda.trim() || null;
    if (patch.quorumMinimo !== undefined) {
      if (patch.quorumMinimo == null || String(patch.quorumMinimo) === "") {
        data.quorumMinimo = null;
      } else {
        const n = Number(patch.quorumMinimo);
        if (isNaN(n) || n < 0 || n > 100)
          return fail("Quórum inválido.", { quorumMinimo: "0–100." });
        data.quorumMinimo = n;
      }
    }
    if (patch.multaTardanza !== undefined || patch.multaInasistencia !== undefined) {
      const feM: Record<string, string> = {};
      if (patch.multaTardanza !== undefined)
        data.multaTardanza = parseMulta(patch.multaTardanza, "multaTardanza", feM);
      if (patch.multaInasistencia !== undefined)
        data.multaInasistencia = parseMulta(
          patch.multaInasistencia,
          "multaInasistencia",
          feM,
        );
      if (Object.keys(feM).length > 0)
        return fail("Revisa los campos marcados.", feM);
    }
    await prisma.asamblea.update({ where: { id }, data });
    refresh(id);
    return ok();
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("updateAsamblea", e);
    return fail("No se pudo actualizar la asamblea.");
  }
}

const ESTADOS_ASAMBLEA: EstadoAsamblea[] = ["programada", "en_curso", "cerrada"];

// Abre / cierra / reabre la asamblea (programada → en_curso → cerrada). Es lo
// que controla la "puerta" del registro de asistencia del socio: en_curso la
// abre de inmediato (aunque aún no llegue la hora de inicio), cerrada la
// finaliza. La clasificación presente/tardanza sigue dependiendo de la hora.
export async function setEstadoAsamblea(
  id: string,
  estado: EstadoAsamblea,
): Promise<ActionResult<{ estado: EstadoAsamblea }>> {
  try {
    await authorize("asambleas.attendance");
    if (!ESTADOS_ASAMBLEA.includes(estado)) return fail("Estado inválido.");
    await prisma.asamblea.update({ where: { id }, data: { estado } });
    refresh(id);
    return ok({ estado });
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("setEstadoAsamblea", e);
    return fail("No se pudo cambiar el estado de la asamblea.");
  }
}

export async function deleteAsamblea(id: string): Promise<ActionResult> {
  try {
    await authorize("asambleas.delete");
    await prisma.asamblea.delete({ where: { id } });
    refresh();
    return ok();
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("deleteAsamblea", e);
    return fail("No se pudo eliminar la asamblea.");
  }
}

// Núcleo del check-in: dado un socioId ya resuelto, sella su asistencia por la
// puerta. Compartido por el registro por DNI (escáner) y por nombre (selección
// desde el buscador). Devuelve el resultado o un fallo de negocio.
async function registrarAsistencia(
  byUserId: string,
  asambleaId: string,
  socioId: string,
): Promise<ActionResult<CheckInResult>> {
  const asamblea = await prisma.asamblea.findUnique({
    where: { id: asambleaId },
    select: { fecha: true, toleranciaMin: true, estado: true },
  });
  if (!asamblea) return fail("Asamblea no encontrada.");
  // Una asamblea cerrada tiene la asistencia finalizada: no se registra por la
  // puerta. Las correcciones puntuales se hacen con las pastillas manuales.
  if (asamblea.estado === "cerrada")
    return fail("La asamblea está cerrada; no se puede registrar asistencia.");

  // Buscar la fila de asistencia de ese socio en esta asamblea.
  const asis = await prisma.asistencia.findFirst({
    where: { asambleaId, socioId },
    include: {
      socio: {
        select: {
          codigo: true,
          apellidoPaterno: true,
          apellidoMaterno: true,
          nombres: true,
        },
      },
    },
  });

  if (!asis) {
    return fail("El socio no está en la lista de esta asamblea.");
  }

  const yaRegistrado = asis.estado === "presente" || asis.estado === "tardanza";

  let estado: "presente" | "tardanza";
  let hora: Date;

  if (yaRegistrado) {
    // El primer registro manda: un re-escaneo NO cambia el estado ni la hora.
    // Su llegada ya quedó sellada (presente/tardanza). Las correcciones se
    // hacen con las pastillas manuales, no por la puerta.
    estado = asis.estado === "presente" ? "presente" : "tardanza";
    hora = asis.updatedAt;
  } else {
    // Primer registro: presente si llega dentro de inicio + tolerancia; si
    // no, tardanza. (Un socio "ausente" o "justificado" que aparece y escanea
    // queda registrado según la hora real de llegada.)
    const now = new Date();
    const cutoff = new Date(
      asamblea.fecha.getTime() + (asamblea.toleranciaMin ?? 15) * 60000,
    );
    estado = now.getTime() <= cutoff.getTime() ? "presente" : "tardanza";
    hora = now;
    await prisma.asistencia.update({
      where: { id: asis.id },
      data: { estado, byUserId },
    });
    // La primera marca "inicia" la reunión: programada → en_curso para que el
    // estado refleje que el registro está activo. No bloqueante.
    if (asamblea.estado === "programada") {
      try {
        await prisma.asamblea.update({
          where: { id: asambleaId },
          data: { estado: "en_curso" },
        });
      } catch (e) {
        console.error("registrarAsistencia: auto-promover estado", e);
      }
    }
    refresh(asambleaId);
  }

  return ok({
    socioNombre: socioNombre(asis.socio),
    socioCodigo: asis.socio.codigo,
    estado,
    hora: hora.toISOString(),
    yaRegistrado,
  });
}

export async function checkInByDni(
  asambleaId: string,
  dni: string,
): Promise<ActionResult<CheckInResult>> {
  try {
    const me = await authorize("asambleas.attendance");
    const num = (dni ?? "").trim();
    if (!/^\d{6,12}$/.test(num))
      return fail("Ingresa un número de documento válido.");

    // Resolver el socio por número de documento. numeroDocumento NO es único por
    // sí solo (la unicidad es por tipoDocumento + numeroDocumento), así que si
    // hay más de un socio con el mismo número (p. ej. un DNI y un pasaporte que
    // comparten dígitos) rechazamos para no marcar presente a la persona
    // equivocada y falsear el quórum.
    const socios = await prisma.socio.findMany({
      where: { numeroDocumento: num },
      select: { id: true },
    });
    if (socios.length === 0)
      return fail("No existe un socio con ese documento.");
    if (socios.length > 1)
      return fail(
        "Hay más de un socio con ese número de documento. Regístralo desde la lista de la asamblea.",
      );

    return registrarAsistencia(me.id, asambleaId, socios[0].id);
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("checkInByDni", e);
    return fail("No se pudo registrar el check-in.");
  }
}

// Check-in seleccionando al socio desde el buscador por nombre/apellidos. Resuelve
// directo por socioId (no hay ambigüedad de documento, y funciona para socios sin
// DNI que no se pueden escanear).
export async function checkInBySocio(
  asambleaId: string,
  socioId: string,
): Promise<ActionResult<CheckInResult>> {
  try {
    const me = await authorize("asambleas.attendance");
    if (!socioId || typeof socioId !== "string")
      return fail("Selecciona un socio de la lista.");
    return registrarAsistencia(me.id, asambleaId, socioId);
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("checkInBySocio", e);
    return fail("No se pudo registrar el check-in.");
  }
}

export async function marcarTodosAsistencia(
  asambleaId: string,
  estado: EstadoAsistencia,
): Promise<ActionResult<{ count: number }>> {
  try {
    const me = await authorize("asambleas.attendance");
    const r = await prisma.asistencia.updateMany({
      where: { asambleaId },
      data: { estado, byUserId: me.id },
    });
    refresh(asambleaId);
    return ok({ count: r.count });
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("marcarTodosAsistencia", e);
    return fail("No se pudo actualizar la asistencia.");
  }
}

export async function setAsistencia(
  asistenciaId: string,
  estado: EstadoAsistencia,
  observacion?: string,
): Promise<ActionResult> {
  try {
    const me = await authorize("asambleas.attendance");
    const row = await prisma.asistencia.update({
      where: { id: asistenciaId },
      data: {
        estado,
        observacion: observacion?.trim() || null,
        byUserId: me.id,
      },
      select: { asambleaId: true },
    });
    refresh(row.asambleaId);
    return ok();
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("setAsistencia", e);
    return fail("No se pudo registrar la asistencia.");
  }
}

// Carga las multas de la asamblea como cuotas (deuda) pendientes: a cada socio
// en TARDANZA (monto = multaTardanza) y a cada AUSENTE (monto = multaInasistencia).
// Presente y justificado NO pagan. Idempotente: reaplicar no duplica.
export async function aplicarMultasAsamblea(
  id: string,
): Promise<ActionResult<AplicarMultasResult>> {
  try {
    const me = await authorize("cuotas.write");
    const a = await prisma.asamblea.findUnique({
      where: { id },
      select: {
        titulo: true,
        fecha: true,
        estado: true,
        multaTardanza: true,
        multaInasistencia: true,
        asistencias: { select: { socioId: true, estado: true } },
      },
    });
    if (!a) return fail("Asamblea no encontrada.");
    // No multar una asamblea aún no realizada: mientras está "programada" la
    // asistencia sigue cambiando (ausentes que aún pueden llegar), lo que
    // produciría cobros incorrectos. Debe estar en_curso o cerrada.
    if (a.estado === "programada")
      return fail(
        "La asamblea aún no se realiza. Iníciala (o ciérrala) antes de aplicar multas.",
      );
    const mt = a.multaTardanza != null ? Number(a.multaTardanza) : 0;
    const mi = a.multaInasistencia != null ? Number(a.multaInasistencia) : 0;
    if (mt <= 0 && mi <= 0)
      return fail(
        "Esta asamblea no tiene montos de multa definidos. Edítala y agrégalos.",
      );

    // Periodo (mes) y etiqueta de fecha en hora de Perú.
    const periodo = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Lima",
      year: "numeric",
      month: "2-digit",
    }).format(a.fecha); // "YYYY-MM"
    const fechaLbl = new Intl.DateTimeFormat("es-PE", {
      timeZone: "America/Lima",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(a.fecha);
    // Marca estable de ESTA asamblea, embebida en el concepto. Permite (1)
    // identificar y reconciliar SOLO las multas de esta asamblea aunque luego
    // cambien su título/fecha, y (2) que la unicidad (socioId, periodo,
    // concepto) no choque con otra asamblea del mismo mes con igual título.
    const ref = `[asm:${id}]`;
    const conceptoT = `Multa por tardanza · ${a.titulo} (${fechaLbl}) ${ref}`;
    const conceptoI = `Multa por inasistencia · ${a.titulo} (${fechaLbl}) ${ref}`;

    // Conjunto deseado (un socio es tardanza O ausente, nunca ambos).
    const want = new Map<
      string,
      { tipo: "t" | "i"; concepto: string; monto: number }
    >();
    for (const x of a.asistencias) {
      if (x.estado === "tardanza" && mt > 0)
        want.set(x.socioId, { tipo: "t", concepto: conceptoT, monto: mt });
      else if (x.estado === "ausente" && mi > 0)
        want.set(x.socioId, { tipo: "i", concepto: conceptoI, monto: mi });
    }
    if (want.size === 0)
      return fail("No hay socios en tardanza ni ausentes para multar.");

    // Reconciliación atómica e idempotente: conserva las multas pendientes que
    // siguen correspondiendo, elimina las obsoletas/reclasificadas (deuda NO
    // pagada) y crea las que faltan. No recarga ni toca multas ya pagadas. Todo
    // en una transacción (sin esto, read+insert+sello no eran atómicos).
    const res = await prisma.$transaction(async (tx) => {
      const existentes = await tx.cuota.findMany({
        where: { concepto: { contains: ref } },
        select: {
          id: true,
          socioId: true,
          concepto: true,
          estado: true,
          monto: true,
          periodo: true,
        },
      });

      // Socios que ya pagaron una multa de esta asamblea: no se recargan.
      const pagados = new Set(
        existentes.filter((e) => e.estado === "pagada").map((e) => e.socioId),
      );
      for (const s of pagados) want.delete(s);

      let conservadas = 0;
      const aEliminar: string[] = [];
      for (const e of existentes) {
        if (e.estado !== "pendiente") continue;
        const w = want.get(e.socioId);
        const sigueIgual =
          !!w &&
          e.concepto === w.concepto &&
          e.periodo === periodo &&
          toNumber(e.monto) === w.monto;
        if (sigueIgual) {
          want.delete(e.socioId); // ya satisfecha; no recrear
          conservadas++;
        } else {
          aEliminar.push(e.id); // obsoleta, reclasificada o monto/título cambiado
        }
      }
      if (aEliminar.length > 0)
        await tx.cuota.deleteMany({ where: { id: { in: aEliminar } } });

      const aCrear = [...want.entries()].map(([socioId, w]) => ({ socioId, w }));
      if (aCrear.length > 0)
        await tx.cuota.createMany({
          data: aCrear.map(({ socioId, w }) => ({
            socioId,
            periodo,
            concepto: w.concepto,
            monto: new Prisma.Decimal(w.monto.toFixed(2)),
            createdById: me.id,
          })),
          skipDuplicates: true,
        });

      await tx.asamblea.update({
        where: { id },
        data: { multasAplicadasEn: new Date() },
      });

      return { creadas: aCrear.map((c) => c.w), conservadas };
    });

    refresh(id);
    // La deuda de los socios cambió: refrescar también estas vistas.
    revalidatePath("/cuotas");
    revalidatePath("/socios");
    revalidatePath("/portal/deudas");

    const tardanzas = res.creadas.filter((w) => w.tipo === "t").length;
    const ausentes = res.creadas.filter((w) => w.tipo === "i").length;
    const total =
      Math.round(res.creadas.reduce((acc, w) => acc + w.monto, 0) * 100) / 100;
    return ok({
      tardanzas,
      ausentes,
      yaExistentes: res.conservadas,
      total,
    });
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("aplicarMultasAsamblea", e);
    return fail("No se pudieron aplicar las multas.");
  }
}

// Hoja de firmas (.xlsx) de los ASISTIDOS (presente + tardanza), ordenados por
// llegada. El check-in (checkInByDni) sella `updatedAt` al marcar presente/
// tardanza, así que updatedAt ASC ≈ orden de llegada. Columnas: N°, Apellidos y
// Nombres, DNI, Firma (en blanco para firmar). Los sin DNI van con DNI vacío.
export async function exportAsistenciaXlsx(
  asambleaId: string,
): Promise<ActionResult<{ base64: string; filename: string; count: number }>> {
  try {
    await authorize("asambleas.read");
    const a = await prisma.asamblea.findUnique({
      where: { id: asambleaId },
      select: {
        titulo: true,
        fecha: true,
        asistencias: {
          where: {
            estado: { in: ["presente", "tardanza"] as EstadoAsistencia[] },
          },
          orderBy: [
            { updatedAt: "asc" },
            { socio: { apellidoPaterno: "asc" } },
          ],
          select: {
            socio: {
              select: {
                apellidoPaterno: true,
                apellidoMaterno: true,
                nombres: true,
                numeroDocumento: true,
              },
            },
          },
        },
      },
    });
    if (!a) return fail("Asamblea no encontrada.");

    const columns: XlsxColumn[] = [
      { header: "N°", align: "center", width: 6 },
      { header: "Apellidos y Nombres", width: 42 },
      { header: "DNI", align: "center", width: 14 },
      { header: "Firma", width: 40 },
    ];
    const rows = a.asistencias.map((x, i) => {
      const nombre = [
        x.socio.apellidoPaterno,
        x.socio.apellidoMaterno,
        x.socio.nombres,
      ]
        .filter(Boolean)
        .join(" ");
      const dni = esDocumentoPendiente(x.socio.numeroDocumento)
        ? ""
        : x.socio.numeroDocumento;
      return [i + 1, nombre, dni, ""];
    });

    const fechaLegible = new Intl.DateTimeFormat("es-PE", {
      timeZone: "America/Lima",
      dateStyle: "long",
    }).format(a.fecha);
    const buf = buildStyledXlsx({
      sheetName: "Asistencia",
      title: `Asistencia — ${a.titulo}`,
      subtitle: ORG.nombre,
      meta: [
        `Fecha: ${fechaLegible}`,
        `Registrados: ${rows.length} ${rows.length === 1 ? "socio" : "socios"}`,
      ],
      columns,
      rows,
      // Filas altas para que la columna "Firma" tenga espacio real de escritura.
      rowHeight: 34,
    });
    const stamp = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Lima",
    }).format(a.fecha); // YYYY-MM-DD
    const slug =
      a.titulo
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
        .slice(0, 40) || "asamblea";
    return ok({
      base64: buf.toString("base64"),
      filename: `asistencia-${slug}-${stamp}.xlsx`,
      count: rows.length,
    });
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("exportAsistenciaXlsx", e);
    return fail("No se pudo generar la hoja de asistencia.");
  }
}

// Frame actual del QR rotativo de asistencia: SVG del QR (que apunta a
// /portal/asambleas/<codigo>?t=<token de la ventana>) + ms restantes de la
// ventana. La pantalla de la mesa lo refresca solo; el token vivo es lo que
// prueba presencia (no se puede marcar "desde casa" con la URL estática).
export async function getAsambleaQrFrame(
  asambleaId: string,
): Promise<ActionResult<{ svg: string; msLeft: number }>> {
  try {
    // Acuñar el token vivo es una operación de la MESA (no de cualquier lector):
    // exige asambleas.attendance, no el read amplio. Si no, un usuario de
    // solo-lectura podría cosechar el token y pasárselo a ausentes.
    await authorize("asambleas.attendance");
    const a = await prisma.asamblea.findUnique({
      where: { id: asambleaId },
      select: { codigoVerificacion: true, estado: true },
    });
    if (!a?.codigoVerificacion)
      return fail("La asamblea no tiene código de verificación.");
    if (a.estado === "cerrada")
      return fail("La asamblea está cerrada; el código ya no se emite.");
    const { token, msLeft } = currentQrToken(asambleaId, Date.now());
    const base = await appBaseUrl();
    const url = `${base}/portal/asambleas/${a.codigoVerificacion}?t=${token}`;
    const svg = await generarQrSvg(url);
    return ok({ svg, msLeft });
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("getAsambleaQrFrame", e);
    return fail("No se pudo generar el código QR.");
  }
}
