"use client";

import { useEffect } from "react";

/** Close a dialog on Escape, unless a mutation is in progress. */
export function useEscClose(
  open: boolean,
  onClose: () => void,
  busy: boolean = false,
): void {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);
}
