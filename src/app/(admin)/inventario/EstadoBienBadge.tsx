import type { EstadoBien } from "@/generated/prisma/client";
import { ESTADO_LABEL } from "./labels";

export function EstadoBienBadge({ estado }: { estado: EstadoBien }) {
  return (
    <span className={`inv-badge inv-badge--${estado}`}>
      {ESTADO_LABEL[estado]}
    </span>
  );
}
