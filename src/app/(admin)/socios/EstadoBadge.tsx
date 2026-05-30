import type { EstadoSocio } from "@/generated/prisma/client";

const LABELS: Record<EstadoSocio, string> = {
  activo: "Activo",
  suspendido: "Suspendido",
  retirado: "Retirado",
  fallecido: "Fallecido",
};

export function EstadoBadge({ estado }: { estado: EstadoSocio }) {
  return (
    <span className={`estado-badge estado-badge--${estado}`}>
      {LABELS[estado]}
    </span>
  );
}
