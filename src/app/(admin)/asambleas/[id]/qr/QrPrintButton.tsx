"use client";

import Link from "next/link";
import { Icon } from "@/components/admin/Icon";

export function QrPrintButton({ backHref }: { backHref: string }) {
  return (
    <div
      className="asm-qr__actions"
      style={{ display: "flex", gap: 8, justifyContent: "center" }}
    >
      <Link href={backHref} className="btn btn--ghost">
        <Icon name="chevron-right" size={14} style={{ transform: "rotate(180deg)" }} />
        <span>Volver</span>
      </Link>
      <button
        type="button"
        className="btn btn--primary"
        onClick={() => window.print()}
      >
        <Icon name="download" size={15} />
        <span>Imprimir</span>
      </button>
    </div>
  );
}
