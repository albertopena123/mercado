"use client";

import { useEffect } from "react";
import { Icon } from "@/components/admin/Icon";

export type Toast = {
  id: number;
  kind: "success" | "error" | "info";
  message: string;
};

type Props = {
  items: Toast[];
  onDismiss: (id: number) => void;
};

export function Toasts({ items, onDismiss }: Props) {
  if (items.length === 0) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: number) => void;
}) {
  // Per-toast timer that only runs once on mount — not recreated when other toasts arrive.
  useEffect(() => {
    const id = setTimeout(() => onDismiss(toast.id), 4500);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast.id]);

  return (
    <div className={`toast toast--${toast.kind}`}>
      <Icon
        name={toast.kind === "error" ? "info" : "check"}
        size={16}
        style={{ color: "#fff" }}
      />
      <span style={{ flex: 1 }}>{toast.message}</span>
      <button
        onClick={() => onDismiss(toast.id)}
        aria-label="Cerrar"
        style={{
          background: "transparent",
          border: 0,
          color: "rgba(255,255,255,0.85)",
          cursor: "pointer",
          padding: 2,
        }}
      >
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}
