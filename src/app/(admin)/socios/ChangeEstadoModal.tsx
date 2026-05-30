"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Icon } from "@/components/admin/Icon";
import { useEscClose } from "@/lib/ui/useEscClose";
import type { EstadoSocio } from "@/generated/prisma/client";
import { changeEstadoSocio } from "./actions";

const OPTS: { v: EstadoSocio; label: string }[] = [
  { v: "activo", label: "Activo" },
  { v: "suspendido", label: "Suspendido" },
  { v: "retirado", label: "Retirado" },
  { v: "fallecido", label: "Fallecido" },
];

const LABEL: Record<EstadoSocio, string> = {
  activo: "Activo",
  suspendido: "Suspendido",
  retirado: "Retirado",
  fallecido: "Fallecido",
};

export function ChangeEstadoModal({
  socioId,
  current,
  onClose,
  onDone,
}: {
  socioId: string;
  current: EstadoSocio;
  onClose: () => void;
  onDone: () => void;
}) {
  const [toEstado, setToEstado] = useState<EstadoSocio>(
    OPTS.find((o) => o.v !== current)!.v,
  );
  const [motivo, setMotivo] = useState("");
  const [topError, setTopError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  useEscClose(true, onClose, pending);

  const valid = motivo.trim().length >= 5;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || pending) return;
    setTopError(null);
    setFieldErrors({});
    startTransition(async () => {
      const r = await changeEstadoSocio(socioId, toEstado, motivo.trim());
      if (!r.ok) {
        setTopError(r.error);
        setFieldErrors((r.fieldErrors as Record<string, string>) ?? {});
        return;
      }
      onDone();
    });
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form
        className="modal modal--sm"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <header className="modal__head">
          <h2>Cambiar estado del socio</h2>
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
            El cambio queda registrado en el historial con el motivo y tu
            usuario. Para volver atrás necesitarás registrar otra transición.
          </p>

          {topError && (
            <div className="soc-error" role="alert" style={{ marginBottom: 16 }}>
              <Icon name="info" size={16} />
              <span>{topError}</span>
            </div>
          )}

          <label className="field">
            <span className="field__label">Estado actual</span>
            <input value={LABEL[current]} disabled />
          </label>

          <label className="field">
            <span className="field__label">
              Nuevo estado<span className="field__req">*</span>
            </span>
            <select
              value={toEstado}
              onChange={(e) => setToEstado(e.target.value as EstadoSocio)}
              disabled={pending}
            >
              {OPTS.filter((o) => o.v !== current).map((o) => (
                <option key={o.v} value={o.v}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field__label">
              Motivo<span className="field__req">*</span>
            </span>
            <textarea
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Mínimo 5 caracteres. Ej.: «Atraso de 3 cuotas según acta del 15/05»"
              aria-invalid={!!fieldErrors.motivo}
              disabled={pending}
            />
            {fieldErrors.motivo && (
              <span className="field-error">{fieldErrors.motivo}</span>
            )}
          </label>
        </div>

        <footer className="modal__foot">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={onClose}
            disabled={pending}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="btn btn--primary"
            disabled={!valid || pending}
          >
            {pending ? "Aplicando…" : "Confirmar cambio"}
          </button>
        </footer>
      </form>
    </div>
  );
}
