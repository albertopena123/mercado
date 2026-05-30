import type {
  TipoAsamblea,
  EstadoAsamblea,
  EstadoAsistencia,
} from "@/generated/prisma/client";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | {
      ok: false;
      error: string;
      fieldErrors?: Partial<Record<string, string>>;
    };

export type AsambleaRow = {
  id: string;
  titulo: string;
  tipo: TipoAsamblea;
  fecha: string;
  estado: EstadoAsamblea;
  total: number;
  asistieron: number; // presente + tardanza
  quorumMinimo: number | null;
};

export type AsistenciaRow = {
  id: string;
  socioId: string;
  socioNombre: string;
  socioCodigo: string;
  estado: EstadoAsistencia;
  observacion: string | null;
};

export type AsambleaDetail = {
  id: string;
  titulo: string;
  tipo: TipoAsamblea;
  fecha: string;
  lugar: string | null;
  agenda: string | null;
  estado: EstadoAsamblea;
  quorumMinimo: number | null;
  toleranciaMin: number;
  total: number;
  presente: number;
  ausente: number;
  justificado: number;
  tardanza: number;
  asistencias: AsistenciaRow[];
};

export type CreateAsambleaInput = {
  titulo: string;
  tipo: TipoAsamblea;
  fecha: string;
  hora?: string; // "HH:mm" hora de inicio de la entrada
  lugar?: string;
  agenda?: string;
  quorumMinimo?: number | null;
  toleranciaMin?: number | null;
};

export type CheckInResult = {
  socioNombre: string;
  socioCodigo: string;
  estado: "presente" | "tardanza";
  hora: string; // ISO del momento del check-in
  yaRegistrado: boolean; // true si ya estaba marcado presente/tardanza antes
};

export type UpdateAsambleaPatch = Partial<CreateAsambleaInput> & {
  estado?: EstadoAsamblea;
};

export type ListAsambleasResult = {
  items: AsambleaRow[];
  total: number;
  page: number;
  pageSize: number;
};

export type PermFlags = {
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
  canAttendance: boolean;
};
