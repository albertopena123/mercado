"use client";

import { useState, type FormEvent } from "react";
import { useToast } from "@/components/admin/toast";
import { changeMiPassword } from "../actions";

export function PasswordForm() {
  const toast = useToast();
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [fe, setFe] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    setFe({});
    if (nueva !== confirmar) {
      setFe({ confirmar: "Las contraseñas no coinciden." });
      return;
    }
    setSaving(true);
    const res = await changeMiPassword(actual, nueva);
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      if (res.fieldErrors) setFe(res.fieldErrors);
      return;
    }
    toast.success("Contraseña actualizada.");
    setActual("");
    setNueva("");
    setConfirmar("");
  }

  return (
    <form onSubmit={submit}>
      <div className="pt-field">
        <label htmlFor="pw-actual">Contraseña actual</label>
        <input
          id="pw-actual"
          type="password"
          autoComplete="current-password"
          value={actual}
          onChange={(e) => setActual(e.target.value)}
          aria-invalid={!!fe.actual}
          disabled={saving}
        />
        {fe.actual && <span className="pt-field__err">{fe.actual}</span>}
      </div>
      <div className="pt-field">
        <label htmlFor="pw-nueva">Nueva contraseña</label>
        <input
          id="pw-nueva"
          type="password"
          autoComplete="new-password"
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
          aria-invalid={!!fe.nueva}
          disabled={saving}
        />
        {fe.nueva && <span className="pt-field__err">{fe.nueva}</span>}
      </div>
      <div className="pt-field">
        <label htmlFor="pw-confirmar">Repite la nueva contraseña</label>
        <input
          id="pw-confirmar"
          type="password"
          autoComplete="new-password"
          value={confirmar}
          onChange={(e) => setConfirmar(e.target.value)}
          aria-invalid={!!fe.confirmar}
          disabled={saving}
        />
        {fe.confirmar && <span className="pt-field__err">{fe.confirmar}</span>}
      </div>
      <button
        type="submit"
        className="pt-btn"
        disabled={saving || !actual || !nueva || !confirmar}
      >
        {saving ? "Guardando…" : "Cambiar contraseña"}
      </button>
    </form>
  );
}
