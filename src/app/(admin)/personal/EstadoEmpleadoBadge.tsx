import type { EstadoEmpleado } from "@/generated/prisma/client";

const LABELS: Record<EstadoEmpleado, string> = {
  activo: "Activo",
  suspendido: "Suspendido",
  inactivo: "Cesado",
};

// Reutiliza las clases de estado-badge del padrón: "inactivo" toma el tono
// neutro de "retirado".
const TONE: Record<EstadoEmpleado, string> = {
  activo: "activo",
  suspendido: "suspendido",
  inactivo: "retirado",
};

export function EstadoEmpleadoBadge({ estado }: { estado: EstadoEmpleado }) {
  return (
    <span className={`estado-badge estado-badge--${TONE[estado]}`}>
      {LABELS[estado]}
    </span>
  );
}
