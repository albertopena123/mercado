import type { CargoEmpleado, EstadoEmpleado } from "@/generated/prisma/client";

export const CARGO_LABEL: Record<CargoEmpleado, string> = {
  seguridad: "Seguridad",
  secretaria: "Secretaría",
  limpieza: "Limpieza",
  bano: "Atención SS-HH",
  administracion: "Administración",
  mantenimiento: "Mantenimiento",
  cobranza: "Cobranza",
  otro: "Otro",
};

export const CARGOS: CargoEmpleado[] = [
  "seguridad",
  "secretaria",
  "limpieza",
  "bano",
  "administracion",
  "mantenimiento",
  "cobranza",
  "otro",
];

export const ESTADO_EMPLEADO_LABEL: Record<EstadoEmpleado, string> = {
  activo: "Activo",
  suspendido: "Suspendido",
  inactivo: "Cesado",
};

export const ESTADOS_EMPLEADO: EstadoEmpleado[] = [
  "activo",
  "suspendido",
  "inactivo",
];

// Tipos de adjunto sugeridos para el personal.
export const TIPO_ADJUNTO_LABEL: Record<string, string> = {
  cv: "Currículum (CV)",
  contrato: "Contrato",
  dni: "Documento de identidad",
  foto: "Foto",
  otro: "Otro",
};
