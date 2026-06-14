"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/admin/toast";
import { checkInSocio } from "../../actions";

export function CheckinButton({ codigo }: { codigo: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function marcar() {
    if (busy) return;
    setBusy(true);
    const res = await checkInSocio(codigo);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(
      res.estado === "presente"
        ? "¡Asistencia registrada como presente!"
        : "Asistencia registrada (tardanza).",
    );
    router.refresh();
  }

  return (
    <button type="button" className="pt-btn" onClick={marcar} disabled={busy}>
      {busy ? "Registrando…" : "Marcar mi asistencia"}
    </button>
  );
}
