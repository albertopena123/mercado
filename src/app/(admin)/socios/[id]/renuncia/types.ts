// Tipos compartidos del expediente de renuncia entre el server (actions/page) y
// el cliente (RenunciaManager). Vive aparte porque un archivo "use server" solo
// puede exportar funciones async.
import type {
  EstadoRenuncia,
  DimensionPuesto,
} from "@/generated/prisma/client";

export type { EstadoRenuncia };

// Etiqueta legible de cada estado del expediente.
export const ESTADO_RENUNCIA_LABEL: Record<EstadoRenuncia, string> = {
  solicitada: "Solicitada",
  aceptada_cd: "Aceptada por Consejo Directivo",
  ratificada_ag: "Ratificada por Asamblea General",
  efectiva: "Efectiva",
  rechazada: "Rechazada",
};

// Orden del flujo para el stepper (rechazada/efectiva son terminales).
export const FLUJO_RENUNCIA: EstadoRenuncia[] = [
  "solicitada",
  "aceptada_cd",
  "ratificada_ag",
  "efectiva",
];

export type RenunciaData = {
  id: string;
  estado: EstadoRenuncia;
  // Alcance: puestoId => cesión de ese puesto; null => renuncia total.
  puestoId: string | null;
  puestoCodigo: string | null;
  puestoDimension: DimensionPuesto | null;
  motivo: string | null;
  fechaSolicitud: string; // ISO
  actaCdNumero: string | null;
  actaCdFecha: string | null; // ISO (fecha calendario)
  actaAgNumero: string | null;
  actaAgFecha: string | null; // ISO (fecha calendario)
  efectivaEn: string | null; // ISO (instante)
  motivoRechazo: string | null;
  observaciones: string | null;
};
