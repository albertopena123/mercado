"use client";

import { useState, type FormEvent } from "react";
import { Icon } from "@/components/admin/Icon";
import { useEscClose } from "@/lib/ui/useEscClose";
import type {
  TipoAnuncio,
  VisibilidadAnuncio,
  EstadoAnuncio,
} from "@/generated/prisma/client";
import {
  TIPO_ANUNCIO_LABEL,
  VISIBILIDAD_LABEL,
  TIPOS_ANUNCIO,
  VISIBILIDADES,
} from "@/lib/anuncios/labels";
import { createAnuncio } from "./actions";

export function CreateAnuncioModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [titulo, setTitulo] = useState("");
  const [resumen, setResumen] = useState("");
  const [contenido, setContenido] = useState("");
  const [tipo, setTipo] = useState<TipoAnuncio>("anuncio");
  const [visibilidad, setVisibilidad] = useState<VisibilidadAnuncio>("publico");
  const [estado, setEstado] = useState<EstadoAnuncio>("borrador");
  const [fijado, setFijado] = useState(false);
  const [validoHasta, setValidoHasta] = useState("");
  const [topError, setTopError] = useState<string | null>(null);
  const [fe, setFe] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEscClose(true, onClose, submitting);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setTopError(null);
    setFe({});
    const res = await createAnuncio({
      titulo,
      resumen: resumen || undefined,
      contenido,
      tipo,
      visibilidad,
      estado,
      fijado,
      validoHasta: validoHasta || null,
    });
    setSubmitting(false);
    if (!res.ok) {
      setTopError(res.error);
      if (res.fieldErrors) setFe(res.fieldErrors as Record<string, string>);
      return;
    }
    onCreated(res.data!.id);
  }

  return (
    <div className="modal-backdrop" onClick={() => !submitting && onClose()}>
      <form
        className="modal"
        style={{ maxWidth: 560 }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <header className="modal__head">
          <h2>Nueva publicación</h2>
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
          {topError && (
            <div className="soc-error" role="alert" style={{ marginBottom: 16 }}>
              <Icon name="info" size={16} />
              <span>{topError}</span>
            </div>
          )}

          <label className="field">
            <span className="field__label">Título</span>
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ej. Corte de agua programado"
              aria-invalid={!!fe.titulo}
              autoFocus
              disabled={submitting}
            />
            {fe.titulo && <span className="field-error">{fe.titulo}</span>}
          </label>

          <label className="field">
            <span className="field__label">Resumen (opcional)</span>
            <input
              value={resumen}
              onChange={(e) => setResumen(e.target.value)}
              placeholder="Una línea para la tarjeta del landing"
              disabled={submitting}
            />
          </label>

          <label className="field">
            <span className="field__label">Contenido</span>
            <textarea
              value={contenido}
              onChange={(e) => setContenido(e.target.value)}
              rows={5}
              placeholder="Detalle del anuncio o comunicado…"
              aria-invalid={!!fe.contenido}
              disabled={submitting}
            />
            {fe.contenido && <span className="field-error">{fe.contenido}</span>}
          </label>

          <div className="anun-form-row">
            <label className="field">
              <span className="field__label">Tipo</span>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as TipoAnuncio)}
                disabled={submitting}
              >
                {TIPOS_ANUNCIO.map((t) => (
                  <option key={t} value={t}>
                    {TIPO_ANUNCIO_LABEL[t]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">Visibilidad</span>
              <select
                value={visibilidad}
                onChange={(e) =>
                  setVisibilidad(e.target.value as VisibilidadAnuncio)
                }
                disabled={submitting}
              >
                {VISIBILIDADES.map((v) => (
                  <option key={v} value={v}>
                    {VISIBILIDAD_LABEL[v]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="anun-form-row">
            <label className="field">
              <span className="field__label">Estado</span>
              <select
                value={estado}
                onChange={(e) => setEstado(e.target.value as EstadoAnuncio)}
                disabled={submitting}
              >
                <option value="borrador">Borrador</option>
                <option value="publicado">Publicado</option>
              </select>
            </label>
            <label className="field">
              <span className="field__label">Vigente hasta (opcional)</span>
              <input
                type="date"
                value={validoHasta}
                onChange={(e) => setValidoHasta(e.target.value)}
                disabled={submitting}
              />
              {fe.validoHasta && (
                <span className="field-error">{fe.validoHasta}</span>
              )}
            </label>
          </div>

          <label className="anun-check">
            <input
              type="checkbox"
              checked={fijado}
              onChange={(e) => setFijado(e.target.checked)}
              disabled={submitting}
            />
            <span>Destacar (fijar arriba)</span>
          </label>

          <p className="modal__intro" style={{ marginTop: 4 }}>
            La imagen se agrega después de crear, desde el detalle.
          </p>
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
            disabled={submitting}
          >
            {submitting ? "Creando…" : "Crear publicación"}
          </button>
        </footer>
      </form>
    </div>
  );
}
