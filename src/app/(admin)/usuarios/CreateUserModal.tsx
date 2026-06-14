"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { TipoDocumento } from "@/generated/prisma/client";
import { Icon } from "@/components/admin/Icon";
import { useEscClose } from "@/lib/ui/useEscClose";
import { DocumentoInput } from "../socios/DocumentoInput";
import { RolePicker } from "./RolePicker";
import { searchLinkableSocios } from "./actions";
import type { ActionResult, LinkableSocio, RoleOption } from "./types";

type CreateInput =
  | {
      mode: "staff";
      name: string;
      tipoDocumento: TipoDocumento;
      numeroDocumento: string;
      email?: string;
      password: string;
      roleIds: string[];
    }
  | { mode: "socio"; socioId: string; password: string; roleIds: string[] };

type Props = {
  roles: RoleOption[];
  onClose: () => void;
  onSubmit: (input: CreateInput) => Promise<ActionResult<{ id: string }>>;
};

export function CreateUserModal({ roles, onClose, onSubmit }: Props) {
  const [mode, setMode] = useState<"socio" | "staff">("socio");
  const [password, setPassword] = useState("");
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<string, string>>>({});
  const [topError, setTopError] = useState<string | null>(null);

  // staff
  const [name, setName] = useState("");
  const [tipo, setTipo] = useState<TipoDocumento>("DNI");
  const [numero, setNumero] = useState("");
  const [email, setEmail] = useState("");

  // socio picker
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LinkableSocio[]>([]);
  const [picked, setPicked] = useState<LinkableSocio | null>(null);
  const searchSeq = useRef(0);

  useEscClose(true, onClose, submitting);

  useEffect(() => {
    if (mode !== "socio" || picked) return;
    const q = query.trim();
    const seq = ++searchSeq.current;
    const t = setTimeout(async () => {
      if (q.length < 2) {
        if (seq === searchSeq.current) setResults([]);
        return;
      }
      const res = await searchLinkableSocios(q);
      if (seq !== searchSeq.current) return; // descarta respuestas viejas
      setResults(res.ok ? (res.data ?? []) : []);
    }, 250);
    return () => clearTimeout(t);
  }, [query, mode, picked]);

  const validSocio = !!picked && password.length >= 6;
  const validStaff =
    name.trim().length >= 2 && numero.trim().length > 0 && password.length >= 6;
  const valid = mode === "socio" ? validSocio : validStaff;

  const onSubmitForm = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid || submitting) return;
    setSubmitting(true);
    setTopError(null);
    setFieldErrors({});
    const input: CreateInput =
      mode === "socio"
        ? { mode: "socio", socioId: picked!.id, password, roleIds }
        : {
            mode: "staff",
            name: name.trim(),
            tipoDocumento: tipo,
            numeroDocumento: numero.trim(),
            email: email.trim() || undefined,
            password,
            roleIds,
          };
    const res = await onSubmit(input);
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
          <button type="button" className="iconbtn" onClick={onClose} aria-label="Cerrar">
            <Icon name="close" size={20} />
          </button>
        </header>
        <div className="modal__body">
          <div className="page__tabs" style={{ marginBottom: 16 }}>
            <button
              type="button"
              className={`tab ${mode === "socio" ? "is-active" : ""}`}
              onClick={() => setMode("socio")}
            >
              Comerciante (socio)
            </button>
            <button
              type="button"
              className={`tab ${mode === "staff" ? "is-active" : ""}`}
              onClick={() => setMode("staff")}
            >
              Personal (staff)
            </button>
          </div>

          {topError && (
            <div className="login__error" role="alert" style={{ marginBottom: 16 }}>
              <Icon name="info" size={16} />
              <span>{topError}</span>
            </div>
          )}

          {mode === "socio" ? (
            picked ? (
              <div className="field">
                <span className="field__label">Socio seleccionado</span>
                <div className="banner">
                  <div className="banner__icon"><Icon name="user" size={18} /></div>
                  <p>
                    <b>{picked.nombreCompleto}</b><br />
                    {picked.tipoDocumento} {picked.numeroDocumento} · {picked.codigo}
                    {picked.email ? ` · ${picked.email}` : ""}
                  </p>
                  <button
                    type="button"
                    className="banner__close"
                    onClick={() => { setPicked(null); setQuery(""); }}
                    aria-label="Cambiar socio"
                  >
                    <Icon name="close" size={16} />
                  </button>
                </div>
              </div>
            ) : (
              <label className="field">
                <span className="field__label">
                  Buscar socio en el padrón<span className="field__req">*</span>
                </span>
                <input
                  type="text"
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Nombre o número de documento"
                />
                {results.length > 0 && (
                  <div className="chip-popover" style={{ position: "static", marginTop: 6 }}>
                    {results.map((s) => (
                      <button
                        type="button"
                        key={s.id}
                        className="chip-popover__opt"
                        onClick={() => { setPicked(s); setResults([]); }}
                      >
                        {s.nombreCompleto} — {s.tipoDocumento} {s.numeroDocumento}
                      </button>
                    ))}
                  </div>
                )}
                {query.trim().length >= 2 && results.length === 0 && (
                  <span style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 4 }}>
                    Sin socios activos sin cuenta para esa búsqueda.
                  </span>
                )}
              </label>
            )
          ) : (
            <>
              <label className="field">
                <span className="field__label">
                  Nombre completo<span className="field__req">*</span>
                </span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="p. ej. María Salas Yáñez"
                  aria-invalid={!!fieldErrors.name}
                />
                {fieldErrors.name && (
                  <span style={{ color: "#b91c1c", fontSize: 12, marginTop: 4 }}>{fieldErrors.name}</span>
                )}
              </label>
              <DocumentoInput
                tipo={tipo}
                numero={numero}
                onChange={(t, n) => { setTipo(t); setNumero(n); }}
                fieldErrors={fieldErrors}
                disabled={submitting}
              />
              <label className="field">
                <span className="field__label">Correo (opcional)</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="correo@ejemplo.com"
                  aria-invalid={!!fieldErrors.email}
                />
                {fieldErrors.email && (
                  <span style={{ color: "#b91c1c", fontSize: 12, marginTop: 4 }}>{fieldErrors.email}</span>
                )}
              </label>
            </>
          )}

          <label className="field">
            <span className="field__label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Contraseña inicial<span className="field__req">*</span></span>
              <button type="button" className="linkbtn" onClick={() => setShowPassword((v) => !v)} style={{ padding: "2px 6px", fontSize: 11.5 }}>
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
              <span style={{ color: "#b91c1c", fontSize: 12, marginTop: 4 }}>{fieldErrors.password}</span>
            )}
          </label>

          <div style={{ marginTop: 8 }}>
            <div className="field__label" style={{ marginBottom: 8 }}>Roles asignados</div>
            <RolePicker roles={roles} selected={roleIds} onChange={setRoleIds} disabled={submitting} />
          </div>
        </div>
        <footer className="modal__foot">
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary" disabled={!valid || submitting}>
            {submitting ? "Creando…" : "Crear usuario"}
          </button>
        </footer>
      </form>
    </div>
  );
}
