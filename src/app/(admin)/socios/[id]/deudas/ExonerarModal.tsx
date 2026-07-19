"use client";

import { useState, type FormEvent } from "react";
import { Icon } from "@/components/admin/Icon";
import { useToast } from "@/components/admin/toast";
import { useEscClose } from "@/lib/ui/useEscClose";
import { formatSoles } from "@/lib/money";
import { exonerarCuota } from "../../../cuotas/actions";
import type { CuotaRow } from "../../../cuotas/types";

// Exonera (condona) una cuota pendiente. Exige una descripción/motivo que queda
// registrada — decisión de tesorería/administración, no un pago.
export function ExonerarModal({
  cuota,
  onClose,
  onDone,
}: {
  cuota: CuotaRow;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const toast = useToast();
  const [motivo, setMotivo] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEscClose(true, onClose, submitting);

  const faltaMotivo = !motivo.trim();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (faltaMotivo) {
      toast.error("Indica el motivo de la exoneración.");
      return;
    }
    setSubmitting(true);
    const res = await exonerarCuota(cuota.id, motivo.trim());
    setSubmitting(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Cuota exonerada.");
    onDone(`Cuota exonerada: ${cuota.concepto} (${cuota.periodo}).`);
  }

  return (
    <div className="modal-backdrop" onClick={() => !submitting && onClose()}>
      <form
        className="modal modal--sm"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <header className="modal__head">
          <h2>Exonerar cuota</h2>
          <button
            type="button"
            className="iconbtn"
            onClick={() => !submitting && onClose()}
            disabled={submitting}
            aria-label="Cerrar"
          >
            <Icon name="close" size={20} />
          </button>
        </header>

        <div className="modal__body">
          <p className="modal__intro">
            Se condonará <b>{cuota.concepto}</b> ({cuota.periodo}) por{" "}
            <b>{formatSoles(cuota.monto)}</b>. Dejará de contar como deuda. No es
            un pago (no entra a caja ni genera comprobante).
          </p>

          <label className="field">
            <span className="field__label">Motivo de la exoneración *</span>
            <textarea
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej.: Acuerdo de asamblea / caso social aprobado por tesorería…"
              maxLength={500}
              aria-invalid={faltaMotivo}
              autoFocus
              disabled={submitting}
            />
            <span
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                marginTop: 4,
              }}
            >
              Queda registrado y se muestra en la proforma.
            </span>
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
            disabled={submitting || faltaMotivo}
          >
            {submitting ? "Exonerando…" : "Confirmar exoneración"}
          </button>
        </footer>
      </form>
    </div>
  );
}
