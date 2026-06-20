"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/admin/Icon";
import { useToast } from "@/components/admin/toast";
import { checkInSocio } from "../../actions";

export function CheckinButton({
  codigo,
  token,
}: {
  codigo: string;
  token?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function marcar() {
    if (busy) return;
    setBusy(true);
    const res = await checkInSocio(codigo, token);
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
    <button
      type="button"
      className="pt-btn pt-btn--block"
      onClick={marcar}
      disabled={busy}
    >
      {busy ? (
        "Registrando…"
      ) : (
        <>
          <Icon name="check" size={18} />
          Marcar mi asistencia
        </>
      )}
    </button>
  );
}
