// Validación y mapeo a Prisma de los datos de un socio. Vive fuera de los
// módulos "use server" para poder reutilizarse desde varias acciones (creación,
// edición admin, aprobación de solicitudes del portal). NO toca la BD.
import { Prisma, type TipoDocumento } from "@/generated/prisma/client";
import {
  validateNumeroDocumento,
  normalizeNumeroDocumento,
  esDocumentoPendiente,
} from "@/lib/socios/document";
import { buildSocioSearchKey } from "@/lib/socios/normalize";
import { inicioDiaUTC, hoyISOPeru } from "@/lib/fecha";
import type { CreateSocioInput } from "@/app/(admin)/socios/types";

export const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

type FieldErrors = Record<string, string>;

export function validateSocioInput(
  input: Partial<CreateSocioInput>,
  isCreate: boolean,
): { fieldErrors: FieldErrors; normalized: Partial<CreateSocioInput> } {
  const fe: FieldErrors = {};
  const out: Partial<CreateSocioInput> = {};

  if (isCreate || input.tipoDocumento !== undefined) {
    if (!input.tipoDocumento) fe.tipoDocumento = "Selecciona el tipo de documento.";
    else out.tipoDocumento = input.tipoDocumento;
  }

  if (isCreate || input.numeroDocumento !== undefined) {
    const tipo = input.tipoDocumento ?? out.tipoDocumento;
    const num = (input.numeroDocumento ?? "").trim();
    if (!num) fe.numeroDocumento = "Número de documento requerido.";
    else if (esDocumentoPendiente(num)) out.numeroDocumento = num;
    else if (tipo && !validateNumeroDocumento(tipo, num))
      fe.numeroDocumento = "Formato inválido para el tipo de documento.";
    else if (tipo) out.numeroDocumento = normalizeNumeroDocumento(tipo, num);
  }

  if (input.numeroPadron !== undefined) {
    const v = input.numeroPadron;
    if (v === null || v === 0) out.numeroPadron = null;
    else if (!Number.isInteger(v) || v < 0 || v > 100000)
      fe.numeroPadron = "Nº de padrón inválido (entero positivo).";
    else out.numeroPadron = v;
  }

  if (isCreate || input.apellidoPaterno !== undefined) {
    const ap = (input.apellidoPaterno ?? "").trim();
    if (!ap) fe.apellidoPaterno = "Apellido paterno requerido.";
    else out.apellidoPaterno = ap;
  }

  if (isCreate || input.nombres !== undefined) {
    const nom = (input.nombres ?? "").trim();
    if (!nom) fe.nombres = "Nombres requeridos.";
    else out.nombres = nom;
  }

  if (input.apellidoMaterno !== undefined) {
    const v = input.apellidoMaterno.trim();
    out.apellidoMaterno = v || undefined;
  }

  const hoyUTC = inicioDiaUTC(hoyISOPeru()).getTime();

  if (isCreate || input.fechaIngreso !== undefined) {
    const fi = input.fechaIngreso ?? "";
    const d = fi ? new Date(fi) : null;
    if (!d || isNaN(d.getTime())) fe.fechaIngreso = "Fecha de ingreso inválida.";
    else if (d.getTime() > hoyUTC)
      fe.fechaIngreso = "La fecha de ingreso no puede ser futura.";
    else out.fechaIngreso = d.toISOString();
  }

  if (input.fechaNacimiento !== undefined && input.fechaNacimiento !== "") {
    const d = new Date(input.fechaNacimiento);
    if (isNaN(d.getTime())) fe.fechaNacimiento = "Fecha de nacimiento inválida.";
    else if (d.getTime() > hoyUTC)
      fe.fechaNacimiento = "Fecha de nacimiento futura.";
    else out.fechaNacimiento = d.toISOString();
  } else if (input.fechaNacimiento === "") {
    out.fechaNacimiento = undefined;
  }

  if (input.email !== undefined && input.email.trim() !== "") {
    const em = input.email.trim().toLowerCase();
    if (!EMAIL_RE.test(em)) fe.email = "Correo no válido.";
    else out.email = em;
  } else if (input.email !== undefined) {
    out.email = undefined;
  }

  for (const k of [
    "sexo",
    "estadoCivil",
    "telefono",
    "direccion",
    "distrito",
    "provincia",
    "departamento",
    "observaciones",
  ] as const) {
    const v = input[k];
    if (v !== undefined) {
      const t = String(v).trim();
      (out as Record<string, string | undefined>)[k] = t || undefined;
    }
  }

  return { fieldErrors: fe, normalized: out };
}

export type SocioUpdateBase = {
  codigo: string;
  numeroPadron: number | null;
  numeroDocumento: string;
  apellidoPaterno: string;
  apellidoMaterno: string | null;
  nombres: string;
  tipoDocumento: TipoDocumento;
};

// Mapea un patch normalizado a Prisma.SocioUpdateInput (incl. searchKey
// recomputado). NO setea updatedBy: lo añade el caller. Devuelve docCambia para
// que el caller propague el documento al User si corresponde.
export function buildSocioUpdateData(
  normalized: Partial<CreateSocioInput>,
  existing: SocioUpdateBase,
): { data: Prisma.SocioUpdateInput; docCambia: boolean } {
  const data: Prisma.SocioUpdateInput = {};
  if (normalized.tipoDocumento) data.tipoDocumento = normalized.tipoDocumento;
  if (normalized.numeroDocumento) data.numeroDocumento = normalized.numeroDocumento;
  if (normalized.apellidoPaterno) data.apellidoPaterno = normalized.apellidoPaterno;
  if ("apellidoMaterno" in normalized)
    data.apellidoMaterno = normalized.apellidoMaterno ?? null;
  if (normalized.nombres) data.nombres = normalized.nombres;
  if (normalized.fechaNacimiento !== undefined)
    data.fechaNacimiento = normalized.fechaNacimiento
      ? new Date(normalized.fechaNacimiento)
      : null;
  if ("sexo" in normalized) data.sexo = normalized.sexo ?? null;
  if ("estadoCivil" in normalized) data.estadoCivil = normalized.estadoCivil ?? null;
  if ("telefono" in normalized) data.telefono = normalized.telefono ?? null;
  if ("email" in normalized) data.email = normalized.email ?? null;
  if ("direccion" in normalized) data.direccion = normalized.direccion ?? null;
  if ("distrito" in normalized) data.distrito = normalized.distrito ?? null;
  if ("provincia" in normalized) data.provincia = normalized.provincia ?? null;
  if ("departamento" in normalized)
    data.departamento = normalized.departamento ?? null;
  if (normalized.fechaIngreso) data.fechaIngreso = new Date(normalized.fechaIngreso);
  if ("observaciones" in normalized)
    data.observaciones = normalized.observaciones ?? null;
  if ("numeroPadron" in normalized) data.numeroPadron = normalized.numeroPadron ?? null;

  const finalAM =
    "apellidoMaterno" in normalized
      ? normalized.apellidoMaterno ?? null
      : existing.apellidoMaterno;
  const finalPadron =
    "numeroPadron" in normalized
      ? normalized.numeroPadron ?? null
      : existing.numeroPadron;
  data.searchKey = buildSocioSearchKey({
    codigo: existing.codigo,
    numeroDocumento: normalized.numeroDocumento ?? existing.numeroDocumento,
    numeroPadron: finalPadron,
    apellidoPaterno: normalized.apellidoPaterno ?? existing.apellidoPaterno,
    apellidoMaterno: finalAM,
    nombres: normalized.nombres ?? existing.nombres,
  });

  const docCambia =
    normalized.tipoDocumento !== undefined ||
    normalized.numeroDocumento !== undefined;
  return { data, docCambia };
}
