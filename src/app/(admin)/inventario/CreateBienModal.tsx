"use client";

import { useState, type FormEvent } from "react";
import { Icon } from "@/components/admin/Icon";
import { useToast } from "@/components/admin/toast";
import { useEscClose } from "@/lib/ui/useEscClose";
import type { UbicacionBien, EstadoBien } from "@/generated/prisma/client";
import { createBien, updateBien } from "./actions";
import { UBICACIONES, ESTADOS, UNIDADES, UBICACION_LABEL, ESTADO_LABEL } from "./labels";
import type { BienRow, CreateBienInput, UpdateBienPatch } from "./types";

export function CreateBienModal({
  bien,
  onClose,
  onSaved,
}: {
  bien?: BienRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!bien;
  const [nombre, setNombre] = useState(bien?.nombre ?? "");
  const [ubicacion, setUbicacion] = useState<UbicacionBien>(
    bien?.ubicacion ?? "almacen",
  );
  const [unidad, setUnidad] = useState(bien?.unidad ?? "UND");
  const [marcaModelo, setMarcaModelo] = useState(bien?.marcaModelo ?? "");
  const [cantidad, setCantidad] = useState(
    isEdit ? String(bien?.cantidad ?? 0) : "1",
  );
  const [estado, setEstado] = useState<EstadoBien>(bien?.estado ?? "conservado");
  const [observaciones, setObservaciones] = useState(bien?.observaciones ?? "");

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  useEscClose(true, onClose, submitting);

  const valid = nombre.trim().length >= 2;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || submitting) return;
    setSubmitting(true);
    setFieldErrors({});

    const res = isEdit
      ? await updateBien(bien!.id, {
          nombre: nombre.trim(),
          ubicacion,
          unidad: unidad.trim() || "UND",
          marcaModelo: marcaModelo.trim() || null,
          estado,
          observaciones: observaciones.trim(),
        } satisfies UpdateBienPatch)
      : await createBien({
          nombre: nombre.trim(),
          ubicacion,
          unidad: unidad.trim() || "UND",
          marcaModelo: marcaModelo.trim() || null,
          cantidad: Number(cantidad) || 0,
          estado,
          observaciones: observaciones.trim(),
        } satisfies CreateBienInput);

    if (!res.ok) {
      toast.error(res.error);
      setFieldErrors((res.fieldErrors as Record<string, string>) ?? {});
      setSubmitting(false);
      return;
    }
    toast.success(isEdit ? "Bien actualizado." : "Bien registrado.");
    onSaved();
  }

  const fe = fieldErrors;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form
        className="modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <header className="modal__head">
          <h2>{isEdit ? "Editar bien" : "Nuevo bien"}</h2>
          <button type="button" className="iconbtn" onClick={onClose} aria-label="Cerrar">
            <Icon name="close" size={20} />
          </button>
        </header>

        <div className="modal__body">
          <label className="field">
            <span className="field__label">
              Nombre del bien<span className="field__req">*</span>
            </span>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="p. ej. Silla giratoria"
              aria-invalid={!!fe.nombre}
              disabled={submitting}
              autoFocus
            />
            {fe.nombre && <span className="field-error">{fe.nombre}</span>}
          </label>

          <div className="modal__row">
            <label className="field">
              <span className="field__label">Ubicación</span>
              <select
                value={ubicacion}
                onChange={(e) => setUbicacion(e.target.value as UbicacionBien)}
                disabled={submitting}
              >
                {UBICACIONES.map((u) => (
                  <option key={u} value={u}>
                    {UBICACION_LABEL[u]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">Estado</span>
              <select
                value={estado}
                onChange={(e) => setEstado(e.target.value as EstadoBien)}
                disabled={submitting}
              >
                {ESTADOS.map((s) => (
                  <option key={s} value={s}>
                    {ESTADO_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="modal__row">
            <label className="field">
              <span className="field__label">Unidad</span>
              <input
                type="text"
                list="inv-unidades"
                value={unidad}
                onChange={(e) => setUnidad(e.target.value)}
                placeholder="UND"
                disabled={submitting}
              />
              <datalist id="inv-unidades">
                {UNIDADES.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            </label>
            {isEdit ? (
              <label className="field">
                <span className="field__label">Cantidad (stock)</span>
                <input
                  type="text"
                  value={`${bien?.cantidad ?? 0} ${bien?.unidad ?? ""}`}
                  disabled
                  title="La cantidad se cambia con movimientos (entrada/salida/ajuste)."
                />
              </label>
            ) : (
              <label className="field">
                <span className="field__label">Cantidad inicial</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                  aria-invalid={!!fe.cantidad}
                  disabled={submitting}
                />
                {fe.cantidad && <span className="field-error">{fe.cantidad}</span>}
              </label>
            )}
          </div>

          <label className="field">
            <span className="field__label">Marca / modelo</span>
            <input
              type="text"
              value={marcaModelo}
              onChange={(e) => setMarcaModelo(e.target.value)}
              placeholder="opcional — p. ej. HP, Samsung A20S"
              disabled={submitting}
            />
          </label>

          <label className="field">
            <span className="field__label">Observaciones</span>
            <textarea
              rows={3}
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="cualquier detalle (estado parcial, ubicación exacta, etc.)"
              disabled={submitting}
            />
          </label>

          {isEdit && (
            <p className="inv-sub">
              Para cambiar la cantidad usa el botón <b>Movimiento</b> en la lista.
            </p>
          )}
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
            {submitting ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear bien"}
          </button>
        </footer>
      </form>
    </div>
  );
}
