"use client";

import { useState, type FormEvent } from "react";
import { Icon } from "@/components/admin/Icon";
import { useEscClose } from "@/lib/ui/useEscClose";
import type { TipoMovBien } from "@/generated/prisma/client";
import { registrarMovimiento } from "./actions";
import type { BienRow } from "./types";

const TIPOS: { key: TipoMovBien; label: string }[] = [
  { key: "entrada", label: "Entrada" },
  { key: "salida", label: "Salida" },
  { key: "ajuste", label: "Ajuste" },
];

export function MovimientoBienModal({
  bien,
  onClose,
  onSaved,
}: {
  bien: BienRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tipo, setTipo] = useState<TipoMovBien>("entrada");
  const [cantidad, setCantidad] = useState("1");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEscClose(true, onClose, submitting);

  const n = Number(cantidad);
  const nValid = Number.isInteger(n) && n >= (tipo === "ajuste" ? 0 : 1);
  const nueva =
    !nValid
      ? bien.cantidad
      : tipo === "entrada"
        ? bien.cantidad + n
        : tipo === "salida"
          ? bien.cantidad - n
          : n;
  const negativo = nueva < 0;
  const valid = nValid && !negativo;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || submitting) return;
    setSubmitting(true);
    setError(null);
    const res = await registrarMovimiento({
      bienId: bien.id,
      tipo,
      cantidad: n,
      motivo: motivo.trim() || undefined,
    });
    if (!res.ok) {
      setError(res.error);
      setSubmitting(false);
      return;
    }
    onSaved();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form
        className="modal"
        style={{ maxWidth: 460 }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <header className="modal__head">
          <h2>Movimiento de stock</h2>
          <button type="button" className="iconbtn" onClick={onClose} aria-label="Cerrar">
            <Icon name="close" size={20} />
          </button>
        </header>

        <div className="modal__body">
          <p className="modal__intro">
            {bien.codigo} · <b>{bien.nombre}</b>
          </p>

          {error && (
            <div className="inv-error" role="alert">
              <Icon name="info" size={16} />
              <span>{error}</span>
            </div>
          )}

          <label className="field">
            <span className="field__label">Tipo de movimiento</span>
            <div className="inv-movtypes" role="radiogroup" aria-label="Tipo de movimiento">
              {TIPOS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  role="radio"
                  aria-checked={tipo === t.key}
                  className={`inv-movtype ${tipo === t.key ? "is-on" : ""}`}
                  onClick={() => setTipo(t.key)}
                  disabled={submitting}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </label>

          <label className="field">
            <span className="field__label">
              {tipo === "ajuste" ? "Nuevo total" : "Cantidad"}
              <span className="field__req">*</span>
            </span>
            <input
              type="number"
              min={tipo === "ajuste" ? 0 : 1}
              step={1}
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              disabled={submitting}
              autoFocus
            />
            {negativo && (
              <span className="field-error">
                No hay stock suficiente (hay {bien.cantidad} {bien.unidad}).
              </span>
            )}
          </label>

          <div className="inv-stockline">
            <span>
              Stock actual: <b>{bien.cantidad}</b> {bien.unidad}
            </span>
            <span className="inv-stockline__arrow">→</span>
            <span>
              Quedará:{" "}
              <b style={{ color: negativo ? "#b91c1c" : undefined }}>
                {nueva}
              </b>{" "}
              {bien.unidad}
            </span>
          </div>

          <label className="field">
            <span className="field__label">Motivo (opcional)</span>
            <input
              type="text"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="p. ej. compra, préstamo, baja por rotura, conteo físico…"
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
            {submitting ? "Registrando…" : "Registrar movimiento"}
          </button>
        </footer>
      </form>
    </div>
  );
}
