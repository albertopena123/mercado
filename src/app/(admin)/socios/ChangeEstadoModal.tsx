"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Icon } from "@/components/admin/Icon";
import { useToast } from "@/components/admin/toast";
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

// Transiciones permitidas (espejo del servidor en actions.ts). fallecido es
// terminal; desde retirado solo se reactiva.
const TRANSICIONES: Record<EstadoSocio, EstadoSocio[]> = {
  activo: ["suspendido", "retirado", "fallecido"],
  suspendido: ["activo", "retirado", "fallecido"],
  retirado: ["activo"],
  fallecido: [],
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
  const toast = useToast();
  const allowed = OPTS.filter((o) => TRANSICIONES[current].includes(o.v));
  const [toEstado, setToEstado] = useState<EstadoSocio>(
    allowed[0]?.v ?? current,
  );
  const [motivo, setMotivo] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  useEscClose(true, onClose, pending);

  const valid = motivo.trim().length >= 5 && allowed.length > 0;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || pending) return;
    setFieldErrors({});
    startTransition(async () => {
      const r = await changeEstadoSocio(socioId, toEstado, motivo.trim());
      if (!r.ok) {
        toast.error(r.error);
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

          <label className="field">
            <span className="field__label">Estado actual</span>
            <input value={LABEL[current]} disabled />
          </label>

          {allowed.length > 0 ? (
            <label className="field">
              <span className="field__label">
                Nuevo estado<span className="field__req">*</span>
              </span>
              <select
                value={toEstado}
                onChange={(e) => setToEstado(e.target.value as EstadoSocio)}
                disabled={pending}
              >
                {allowed.map((o) => (
                  <option key={o.v} value={o.v}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="modal__intro" style={{ color: "var(--text-muted)" }}>
              «{LABEL[current]}» es un estado final: no hay transiciones
              disponibles.
            </p>
          )}

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
