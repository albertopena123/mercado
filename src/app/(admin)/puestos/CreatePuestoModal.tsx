"use client";

import { useState, type FormEvent } from "react";
import { Icon } from "@/components/admin/Icon";
import { useEscClose } from "@/lib/ui/useEscClose";
import { createPuesto } from "./actions";
import type { EstadoPuesto } from "@/generated/prisma/client";
import type { CreatePuestoInput } from "./types";

export function CreatePuestoModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [codigo, setCodigo] = useState("");
  const [giro, setGiro] = useState("");
  const [zona, setZona] = useState("");
  const [area, setArea] = useState("");
  const [estado, setEstado] = useState<EstadoPuesto>("vacio");
  const [observaciones, setObs] = useState("");
  const [topError, setTopError] = useState<string | null>(null);
  const [fe, setFe] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEscClose(true, onClose, submitting);

  const valid = codigo.trim().length > 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || submitting) return;
    setSubmitting(true);
    setTopError(null);
    setFe({});
    const input: CreatePuestoInput = {
      codigo: codigo.trim(),
      giro: giro.trim() || undefined,
      zona: zona.trim() || undefined,
      area: area.trim() ? Number(area) : null,
      estado,
      observaciones: observaciones.trim() || undefined,
    };
    const res = await createPuesto(input);
    if (!res.ok) {
      setTopError(res.error ?? "No se pudo crear el puesto.");
      setFe((res.fieldErrors as Record<string, string>) ?? {});
      setSubmitting(false);
      return;
    }
    onCreated(res.data!.id);
  }

  return (
    <div className="modal-backdrop" onClick={() => !submitting && onClose()}>
      <form
        className="modal"
        style={{ maxWidth: 520 }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <header className="modal__head">
          <h2>Nuevo puesto</h2>
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
            Registra un puesto físico del mercado. El código debe ser único
            (ej. <b>A-12</b>). La asignación a un socio se hace después desde el
            detalle.
          </p>

          {topError && (
            <div className="soc-error" role="alert" style={{ marginBottom: 16 }}>
              <Icon name="info" size={16} />
              <span>{topError}</span>
            </div>
          )}

          <label className="field">
            <span className="field__label">
              Código<span className="field__req">*</span>
            </span>
            <input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              placeholder="A-12"
              aria-invalid={!!fe.codigo}
              autoFocus
              disabled={submitting}
            />
            {fe.codigo && <span className="field-error">{fe.codigo}</span>}
          </label>

          <div className="soc-formgrid soc-formgrid--2col">
            <label className="field">
              <span className="field__label">Giro / rubro</span>
              <input
                value={giro}
                onChange={(e) => setGiro(e.target.value)}
                placeholder="abarrotes, verduras…"
                disabled={submitting}
              />
            </label>
            <label className="field">
              <span className="field__label">Zona / pabellón</span>
              <input
                value={zona}
                onChange={(e) => setZona(e.target.value)}
                placeholder="Bloque A"
                disabled={submitting}
              />
            </label>
          </div>

          <div className="soc-formgrid soc-formgrid--2col">
            <label className="field">
              <span className="field__label">Área (m²)</span>
              <input
                type="number"
                min="0"
                step="0.1"
                value={area}
                onChange={(e) => setArea(e.target.value)}
                aria-invalid={!!fe.area}
                disabled={submitting}
              />
              {fe.area && <span className="field-error">{fe.area}</span>}
            </label>
            <label className="field">
              <span className="field__label">Estado</span>
              <select
                value={estado}
                onChange={(e) => setEstado(e.target.value as EstadoPuesto)}
                disabled={submitting}
              >
                <option value="vacio">Vacío</option>
                <option value="activo">Activo</option>
                <option value="clausurado">Clausurado</option>
                <option value="construccion">En construcción</option>
              </select>
            </label>
          </div>

          <label className="field">
            <span className="field__label">Observaciones</span>
            <textarea
              rows={3}
              value={observaciones}
              onChange={(e) => setObs(e.target.value)}
              disabled={submitting}
            />
          </label>
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
            {submitting ? "Creando…" : "Crear puesto"}
          </button>
        </footer>
      </form>
    </div>
  );
}
