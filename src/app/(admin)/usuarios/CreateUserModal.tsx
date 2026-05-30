"use client";

import { useState, type FormEvent } from "react";
import { Icon } from "@/components/admin/Icon";
import { useEscClose } from "@/lib/ui/useEscClose";
import { RolePicker } from "./RolePicker";
import type { ActionResult, RoleOption } from "./types";

type Props = {
  roles: RoleOption[];
  onClose: () => void;
  onSubmit: (input: {
    name: string;
    email: string;
    password: string;
    roleIds: string[];
  }) => Promise<ActionResult<{ id: string }>>;
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.|\.$/g, "")
    .slice(0, 40);
}

export function CreateUserModal({ roles, onClose, onSubmit }: Props) {
  const [name, setName] = useState("");
  const [emailLocal, setEmailLocal] = useState("");
  const [password, setPassword] = useState("");
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [touchedEmail, setTouchedEmail] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<string, string>>
  >({});
  const [topError, setTopError] = useState<string | null>(null);

  useEscClose(true, onClose, submitting);

  const valid =
    name.trim().length >= 2 &&
    /^[a-zA-Z0-9._-]+$/.test(emailLocal) &&
    password.length >= 6;

  const onSubmitForm = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid || submitting) return;
    setSubmitting(true);
    setTopError(null);
    setFieldErrors({});
    const res = await onSubmit({
      name: name.trim(),
      email: `${emailLocal.trim().toLowerCase()}@unamad.edu.pe`,
      password,
      roleIds,
    });
    if (!res.ok) {
      setTopError(res.error ?? "No se pudo crear el usuario.");
      setFieldErrors(res.fieldErrors ?? {});
      setSubmitting(false);
      return;
    }
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={onSubmitForm}>
        <header className="modal__head">
          <h2>Crear usuario</h2>
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
          <p className="modal__intro">
            Se enviará un correo de bienvenida con instrucciones para activar el
            acceso. La contraseña inicial puede ser cambiada por el usuario.
          </p>

          {topError && (
            <div
              className="login__error"
              role="alert"
              style={{ marginBottom: 16 }}
            >
              <Icon name="info" size={16} />
              <span>{topError}</span>
            </div>
          )}

          <label className="field">
            <span className="field__label">
              Nombre completo<span className="field__req">*</span>
            </span>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!touchedEmail) setEmailLocal(slugify(e.target.value));
              }}
              placeholder="p. ej. María Salas Yáñez"
              aria-invalid={!!fieldErrors.name}
            />
            {fieldErrors.name && (
              <span
                style={{ color: "#b91c1c", fontSize: 12, marginTop: 4 }}
              >
                {fieldErrors.name}
              </span>
            )}
          </label>

          <label className="field">
            <span className="field__label">
              Correo institucional<span className="field__req">*</span>
            </span>
            <div className="input-suffix">
              <input
                type="text"
                value={emailLocal}
                onChange={(e) => {
                  setEmailLocal(e.target.value);
                  setTouchedEmail(true);
                }}
                placeholder="m.salas"
                aria-invalid={!!fieldErrors.email}
              />
              <span>@unamad.edu.pe</span>
            </div>
            {fieldErrors.email && (
              <span style={{ color: "#b91c1c", fontSize: 12, marginTop: 4 }}>
                {fieldErrors.email}
              </span>
            )}
          </label>

          <label className="field">
            <span
              className="field__label"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>
                Contraseña inicial<span className="field__req">*</span>
              </span>
              <button
                type="button"
                className="linkbtn"
                onClick={() => setShowPassword((v) => !v)}
                style={{ padding: "2px 6px", fontSize: 11.5 }}
              >
                {showPassword ? "Ocultar" : "Mostrar"}
              </button>
            </span>
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="mínimo 6 caracteres"
              aria-invalid={!!fieldErrors.password}
              autoComplete="new-password"
            />
            {fieldErrors.password && (
              <span style={{ color: "#b91c1c", fontSize: 12, marginTop: 4 }}>
                {fieldErrors.password}
              </span>
            )}
          </label>

          <div style={{ marginTop: 8 }}>
            <div className="field__label" style={{ marginBottom: 8 }}>
              Roles asignados
            </div>
            <RolePicker
              roles={roles}
              selected={roleIds}
              onChange={setRoleIds}
              disabled={submitting}
            />
          </div>
        </div>
        <footer className="modal__foot">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={onClose}
            disabled={submitting}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="btn btn--primary"
            disabled={!valid || submitting}
          >
            {submitting ? "Creando…" : "Crear usuario"}
          </button>
        </footer>
      </form>
    </div>
  );
}
