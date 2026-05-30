"use client";

import { useState, type ReactNode } from "react";
import { Icon } from "@/components/admin/Icon";
import { useEscClose } from "@/lib/ui/useEscClose";

type Props = {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "info";
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
};

export function ConfirmDialog({
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  tone = "danger",
  busy = false,
  onConfirm,
  onClose,
}: Props) {
  const [working, setWorking] = useState(false);
  useEscClose(true, onClose, working || busy);

  const handle = async () => {
    if (working || busy) return;
    setWorking(true);
    try {
      await onConfirm();
    } finally {
      setWorking(false);
    }
  };

  return (
    <div
      className="confirm-backdrop"
      onClick={() => !working && !busy && onClose()}
    >
      <div className="confirm" onClick={(e) => e.stopPropagation()}>
        <div className="confirm__head">
          <div
            className={`confirm__icon ${
              tone === "info" ? "confirm__icon--info" : ""
            }`}
          >
            <Icon
              name={tone === "info" ? "info" : "trash"}
              size={20}
            />
          </div>
          <h3 className="confirm__title">{title}</h3>
        </div>
        {description && <div className="confirm__body">{description}</div>}
        <div className="confirm__foot">
          <button
            className="btn btn--ghost"
            onClick={onClose}
            disabled={working || busy}
          >
            {cancelLabel}
          </button>
          <button
            className={`btn ${tone === "danger" ? "btn--danger" : "btn--primary"}`}
            onClick={handle}
            disabled={working || busy}
          >
            {working ? "Procesando…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
