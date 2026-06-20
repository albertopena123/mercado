import type {
  EstadoTransferencia,
  TipoDocumento,
} from "@/generated/prisma/client";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | {
      ok: false;
      error: string;
      fieldErrors?: Partial<Record<string, string>>;
    };

export type TransferenciaRow = {
  id: string;
  codigo: string;
  fecha: string;
  estado: EstadoTransferencia;
  transferenteNombre: string;
  transferenteCodigo: string;
  adquirienteNombre: string;
  puestoCodigo: string;
  monto: number | null;
};

export type ListTransferenciasParams = {
  q?: string;
  estado?: EstadoTransferencia;
  page?: number;
  pageSize?: number;
};

export type ListTransferenciasResult = {
  items: TransferenciaRow[];
  total: number;
  page: number;
  pageSize: number;
};

export type Adquiriente = {
  tipoDocumento: TipoDocumento;
  numeroDocumento: string;
  apellidoPaterno: string;
  apellidoMaterno: string | null;
  nombres: string;
  estadoCivil: string | null;
  direccion: string | null;
  distrito: string | null;
  provincia: string | null;
  departamento: string | null;
  telefono: string | null;
};

export type TransferenciaDetail = TransferenciaRow & {
  transferenteId: string;
  transferenteDoc: string;
  transferentePadron: number | null;
  transferenteDeuda: number;
  puestoId: string;
  puestoGiro: string | null; // label legible
  puestoDimension: string; // label legible
  puestoBloque: string;
  puestoNumero: number;
  puestoEtapa: number;
  adquiriente: Adquiriente;
  adquirienteSocioId: string | null;
  adquirienteSocioCodigo: string | null;
  completadaEn: string | null;
  createdEn: string;
  renunciaUrl: string | null; // escaneo firmado de la carta de renuncia
  contratoUrl: string | null; // escaneo firmado del contrato
  renunciaUploadedPor: string | null; // nombre de quién subió la renuncia
  renunciaUploadedEn: string | null; // ISO
  contratoUploadedPor: string | null;
  contratoUploadedEn: string | null;
};

export type CreateTransferenciaInput = {
  transferenteId: string;
  puestoId: string;
  fecha: string;
  monto?: number | null;
  adqTipoDocumento: TipoDocumento;
  adqNumeroDocumento: string;
  adqApellidoPaterno: string;
  adqApellidoMaterno?: string;
  adqNombres: string;
  adqEstadoCivil?: string;
  adqDireccion?: string;
  adqDistrito?: string;
  adqProvincia?: string;
  adqDepartamento?: string;
  adqTelefono?: string;
};

export type FormalizarResult = {
  adquirienteSocioCodigo: string;
  transferenteRetirado: boolean;
};

export type TransferenteOption = {
  id: string;
  codigo: string;
  nombre: string;
  puestos: {
    id: string;
    codigo: string;
    dimensionLabel: string;
    giroLabel: string | null;
  }[];
};

export type PermFlags = {
  canRead: boolean;
  canWrite: boolean;
};
