"use client";

import { useState, type FormEvent } from "react";
import { Icon } from "@/components/admin/Icon";
import { useEscClose } from "@/lib/ui/useEscClose";
import { updateAsamblea } from "../actions";

export function EditMultasModal({
  asambleaId,
  initialTardanza,
  initialInasistencia,
  yaAplicadas,
  onClose,
  onSaved,
}: {
  asambleaId: string;
  initialTardanza: number | null;
  initialInasistencia: number | null;
  yaAplicadas: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tardanza, setTardanza] = useState(
    initialTardanza != null ? String(initialTardanza) : "",
  );
  const [inasistencia, setInasistencia] = useState(
    initialInasistencia != null ? String(initialInasistencia) : "",
  );
  const [fe, setFe] = useState<Record<string, string>>({});
  const [topError, setTopError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEscClose(true, onClose, saving);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setTopError(null);
    setFe({});
    // null = sin multa de ese tipo (el server normaliza 0 → null también).
    const res = await updateAsamblea(asambleaId, {
      multaTardanza: tardanza.trim() ? Number(tardanza) : null,
      multaInasistencia: inasistencia.trim() ? Number(inasistencia) : null,
    });
    setSaving(false);
    if (!res.ok) {
      setTopError(res.error ?? "No se pudieron guardar las multas.");
      setFe((res.fieldErrors as Record<string, string>) ?? {});
      return;
    }
    onSaved();
  }

  return (
    <div className="modal-backdrop" onClick={() => !saving && onClose()}>
      <form
        className="modal"
        style={{ maxWidth: 460 }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <header className="modal__head">
          <h2>Multas de la asamblea</h2>
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
            Montos que se cargan como deuda al pulsar <b>Aplicar multas</b>: a
            cada socio en tardanza y a cada ausente. Deja en blanco (o 0) para no
            cobrar ese concepto.
          </p>
          {topError && (
            <div className="soc-error" role="alert" style={{ marginBottom: 16 }}>
              <Icon name="info" size={16} />
              <span>{topError}</span>
            </div>
          )}
          {yaAplicadas && (
            <div
              className="soc-error"
              role="alert"
              style={{
                marginBottom: 16,
                background: "#fef3c7",
                color: "#92400e",
              }}
            >
              <Icon name="info" size={16} />
              <span>
                Estas multas ya se aplicaron. Cambiar los montos solo afecta a
                quienes aún no tienen la cuota; las ya cargadas no cambian.
              </span>
            </div>
          )}
          <div className="soc-formgrid soc-formgrid--2col">
            <label className="field">
              <span className="field__label">Multa por tardanza (S/)</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={tardanza}
                onChange={(e) => setTardanza(e.target.value)}
                placeholder="0"
                aria-invalid={!!fe.multaTardanza}
                autoFocus
                disabled={saving}
              />
              {fe.multaTardanza && (
                <span className="field-error">{fe.multaTardanza}</span>
              )}
            </label>
            <label className="field">
              <span className="field__label">Multa por inasistencia (S/)</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={inasistencia}
                onChange={(e) => setInasistencia(e.target.value)}
                placeholder="0"
                aria-invalid={!!fe.multaInasistencia}
                disabled={saving}
              />
              {fe.multaInasistencia && (
                <span className="field-error">{fe.multaInasistencia}</span>
              )}
            </label>
          </div>
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
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? "Guardando…" : "Guardar multas"}
          </button>
        </footer>
      </form>
    </div>
  );
}
