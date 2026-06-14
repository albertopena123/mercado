"use client";

import { useState, type FormEvent } from "react";
import { Icon } from "@/components/admin/Icon";
import { useEscClose } from "@/lib/ui/useEscClose";
import { createPuesto } from "./actions";
import type { EstadoPuesto, Giro } from "@/generated/prisma/client";
import type { CreatePuestoInput } from "./types";
import {
  GIRO_LABEL,
  GIROS,
  BLOQUES,
  ETAPAS,
  BANDA_LABEL,
  DIMENSION_LABEL,
  bandaPorNumero,
  dimensionPorBanda,
  puestoCodigo,
} from "@/lib/puestos/giro";

export function CreatePuestoModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [etapa, setEtapa] = useState(1);
  const [bloque, setBloque] = useState("A");
  const [numero, setNumero] = useState("");
  const [giro, setGiro] = useState<Giro | "">("");
  const [estado, setEstado] = useState<EstadoPuesto>("vacio");
  const [observaciones, setObs] = useState("");
  const [topError, setTopError] = useState<string | null>(null);
  const [fe, setFe] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEscClose(true, onClose, submitting);

  const numN = parseInt(numero, 10);
  const numValid = Number.isInteger(numN) && numN >= 1;
  const banda = numValid ? bandaPorNumero(numN) : null;
  const dimension = banda ? dimensionPorBanda(banda) : null;
  const codigoPreview = numValid ? puestoCodigo(etapa, bloque, numN) : "—";
  const valid = numValid;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || submitting) return;
    setSubmitting(true);
    setTopError(null);
    setFe({});
    const input: CreatePuestoInput = {
      etapa,
      bloque,
      numero: numN,
      giro: giro || null,
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
            Registra un puesto físico del mercado. El código se genera solo a
            partir de etapa, bloque y número. La asignación a un socio se hace
            después desde el detalle.
          </p>

          {topError && (
            <div className="soc-error" role="alert" style={{ marginBottom: 16 }}>
              <Icon name="info" size={16} />
              <span>{topError}</span>
            </div>
          )}

          <div
            className="soc-formgrid"
            style={{ gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}
          >
            <label className="field">
              <span className="field__label">
                Etapa<span className="field__req">*</span>
              </span>
              <select
                value={etapa}
                onChange={(e) => setEtapa(Number(e.target.value))}
                disabled={submitting}
              >
                {ETAPAS.map((n) => (
                  <option key={n} value={n}>
                    Etapa {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">
                Bloque<span className="field__req">*</span>
              </span>
              <select
                value={bloque}
                onChange={(e) => setBloque(e.target.value)}
                disabled={submitting}
              >
                {BLOQUES.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">
                Número<span className="field__req">*</span>
              </span>
              <input
                type="number"
                min="1"
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
                placeholder="1–48"
                aria-invalid={!!fe.numero}
                autoFocus
                disabled={submitting}
              />
              {fe.numero && <span className="field-error">{fe.numero}</span>}
            </label>
          </div>

          <div
            className="banner"
            style={{ marginTop: 4, alignItems: "center" }}
          >
            <div className="banner__icon">
              <Icon name="home" size={18} />
            </div>
            <p>
              Código: <b>{codigoPreview}</b>
              {banda && (
                <>
                  {" · "}
                  {BANDA_LABEL[banda]} · {DIMENSION_LABEL[dimension!]}
                </>
              )}
            </p>
          </div>

          <div className="soc-formgrid soc-formgrid--2col">
            <label className="field">
              <span className="field__label">Giro / rubro</span>
              <select
                value={giro}
                onChange={(e) => setGiro(e.target.value as Giro | "")}
                disabled={submitting}
              >
                <option value="">— Sin definir —</option>
                {GIROS.map((g) => (
                  <option key={g} value={g}>
                    {GIRO_LABEL[g]}
                  </option>
                ))}
              </select>
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
