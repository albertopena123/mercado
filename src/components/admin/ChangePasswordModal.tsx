"use client";

import { useState, type FormEvent } from "react";
import { Icon } from "./Icon";
import { useToast } from "./toast";
import { useEscClose } from "@/lib/ui/useEscClose";
import { changeOwnPassword } from "@/lib/auth/account";

export function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [fe, setFe] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEscClose(true, onClose, saving);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    setFe({});
    if (nueva !== confirmar) {
      setFe({ confirmar: "Las contraseñas no coinciden." });
      return;
    }
    setSaving(true);
    const res = await changeOwnPassword(actual, nueva);
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      if (res.fieldErrors) setFe(res.fieldErrors);
      return;
    }
    toast.success("Contraseña actualizada.");
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={() => !saving && onClose()}>
      <form
        className="modal"
        style={{ maxWidth: 440 }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <header className="modal__head">
          <h2>Cambiar contraseña</h2>
          <button
            type="button"
            className="iconbtn"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <Icon name="close" size={20} />
          </button>
        </header>
        <div className="modal__body">
          <label className="field">
            <span className="field__label">Contraseña actual</span>
            <input
              type="password"
              autoComplete="current-password"
              value={actual}
              onChange={(e) => setActual(e.target.value)}
              aria-invalid={!!fe.actual}
              autoFocus
              disabled={saving}
            />
            {fe.actual && <span className="field-error">{fe.actual}</span>}
          </label>
          <label className="field">
            <span className="field__label">Nueva contraseña</span>
            <input
              type="password"
              autoComplete="new-password"
              value={nueva}
              onChange={(e) => setNueva(e.target.value)}
              placeholder="mínimo 6 caracteres"
              aria-invalid={!!fe.nueva}
              disabled={saving}
            />
            {fe.nueva && <span className="field-error">{fe.nueva}</span>}
          </label>
          <label className="field">
            <span className="field__label">Repite la nueva contraseña</span>
            <input
              type="password"
              autoComplete="new-password"
              value={confirmar}
              onChange={(e) => setConfirmar(e.target.value)}
              aria-invalid={!!fe.confirmar}
              disabled={saving}
            />
            {fe.confirmar && <span className="field-error">{fe.confirmar}</span>}
          </label>
        </div>
        <footer className="modal__foot">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="btn btn--primary"
            disabled={saving || !actual || !nueva || !confirmar}
          >
            {saving ? "Guardando…" : "Cambiar contraseña"}
          </button>
        </footer>
      </form>
    </div>
  );
}
