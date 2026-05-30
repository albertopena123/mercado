"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function VerificarForm() {
  const router = useRouter();
  const [codigo, setCodigo] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const c = codigo.trim();
    if (!c) return;
    router.push(`/verificar/${encodeURIComponent(c)}`);
  }

  return (
    <form className="verif__form" onSubmit={submit}>
      <input
        value={codigo}
        onChange={(e) => setCodigo(e.target.value)}
        placeholder="MM-2026-XXXX-XXXX"
        aria-label="Código de verificación"
        autoComplete="off"
        autoFocus
      />
      <button type="submit">Verificar</button>
    </form>
  );
}
