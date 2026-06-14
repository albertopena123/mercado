"use client";

import { useState, type FormEvent } from "react";
import { Icon } from "@/components/admin/Icon";
import { useEscClose } from "@/lib/ui/useEscClose";
import { useToast } from "@/components/admin/toast";
import { generarGrillaEtapa } from "./actions";
import { BLOQUES, ETAPAS } from "@/lib/puestos/giro";

const POR_BLOQUE = 48; // alta 1-24 + media 25-40 + baja 41-48

export function GenerarGrillaModal({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [etapa, setEtapa] = useState(1);
  const [bloques, setBloques] = useState<string[]>([...BLOQUES]);
  const [submitting, setSubmitting] = useState(false);

  useEscClose(true, onClose, submitting);

  const toggle = (b: string) =>
    setBloques((prev) =>
      prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b],
    );
  const valid = bloques.length > 0;
  const totalPuestos = bloques.length * POR_BLOQUE;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || submitting) return;
    setSubmitting(true);
    const res = await generarGrillaEtapa({ etapa, bloques });
    setSubmitting(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(
      `${res.data!.creados} puestos creados · ${res.data!.omitidos} ya existían.`,
    );
    onDone();
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
          <h2>Generar grilla de puestos</h2>
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
            Crea automáticamente los puestos de los bloques seleccionados con sus
            bandas estándar (alta 1–24 de 3×5, media 25–40 de 3×3, baja 41–48 de
            3×5). Los puestos que ya existan se omiten.
          </p>

          <label className="field">
            <span className="field__label">Etapa</span>
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

          <div className="field">
            <span
              className="field__label"
              style={{ display: "flex", justifyContent: "space-between" }}
            >
              <span>Bloques</span>
              <button
                type="button"
                className="linkbtn"
                style={{ padding: "2px 6px", fontSize: 11.5 }}
                onClick={() =>
                  setBloques(bloques.length === BLOQUES.length ? [] : [...BLOQUES])
                }
              >
                {bloques.length === BLOQUES.length ? "Ninguno" : "Todos"}
              </button>
            </span>
            <div className="pst-bloque-picker">
              {BLOQUES.map((b) => (
                <button
                  key={b}
                  type="button"
                  className={`pst-bloque-chip ${bloques.includes(b) ? "is-on" : ""}`}
                  onClick={() => toggle(b)}
                  disabled={submitting}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>
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
            {submitting
              ? "Generando…"
              : `Generar (${totalPuestos} puestos)`}
          </button>
        </footer>
      </form>
    </div>
  );
}
