import type { EstadoPuesto } from "@/generated/prisma/client";

const LABELS: Record<EstadoPuesto, string> = {
  activo: "Activo",
  vacio: "Vacío",
  clausurado: "Clausurado",
  construccion: "En construcción",
};

export function EstadoPuestoBadge({ estado }: { estado: EstadoPuesto }) {
  return (
    <span className={`pst-badge pst-badge--${estado}`}>{LABELS[estado]}</span>
  );
}
