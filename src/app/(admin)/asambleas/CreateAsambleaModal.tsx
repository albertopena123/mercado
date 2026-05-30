"use client";

import { useState, type FormEvent } from "react";
import { Icon } from "@/components/admin/Icon";
import { useEscClose } from "@/lib/ui/useEscClose";
import { createAsamblea } from "./actions";
import type { TipoAsamblea } from "@/generated/prisma/client";
import type { CreateAsambleaInput } from "./types";

export function CreateAsambleaModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  // Fecha de hoy en horario de Perú (America/Lima). toISOString() usa UTC y, de
// noche en Perú (UTC-5), adelantaría la fecha al día siguiente.
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Lima",
}).format(new Date());
  const [titulo, setTitulo] = useState("");
  const [tipo, setTipo] = useState<TipoAsamblea>("ordinaria");
  const [fecha, setFecha] = useState(today);
  const [hora, setHora] = useState("09:00");
  const [tolerancia, setTolerancia] = useState("15");
  const [lugar, setLugar] = useState("");
  const [agenda, setAgenda] = useState("");
  const [quorum, setQuorum] = useState("50");
  const [topError, setTopError] = useState<string | null>(null);
  const [fe, setFe] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEscClose(true, onClose, submitting);

  const valid = titulo.trim().length >= 3 && !!fecha;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || submitting) return;
    setSubmitting(true);
    setTopError(null);
    setFe({});
    const input: CreateAsambleaInput = {
      titulo: titulo.trim(),
      tipo,
      fecha,
      hora,
      lugar: lugar.trim() || undefined,
      agenda: agenda.trim() || undefined,
      quorumMinimo: quorum.trim() ? Number(quorum) : null,
      toleranciaMin: tolerancia.trim() ? Number(tolerancia) : null,
    };
    const res = await createAsamblea(input);
    if (!res.ok) {
      setTopError(res.error ?? "No se pudo crear la asamblea.");
      setFe((res.fieldErrors as Record<string, string>) ?? {});
      setSubmitting(false);
      return;
    }
    onCreated(res.data!.id);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form
        className="modal"
        style={{ maxWidth: 540 }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <header className="modal__head">
          <h2>Nueva asamblea</h2>
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
            Al crear la asamblea se genera la lista de asistencia con{" "}
            <b>todos los socios activos</b> (marcados como ausentes). Luego
            registras quién asistió.
          </p>

          {topError && (
            <div className="soc-error" role="alert" style={{ marginBottom: 16 }}>
              <Icon name="info" size={16} />
              <span>{topError}</span>
            </div>
          )}

          <label className="field">
            <span className="field__label">
              Título<span className="field__req">*</span>
            </span>
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Asamblea general ordinaria — mayo 2026"
              aria-invalid={!!fe.titulo}
              autoFocus
              disabled={submitting}
            />
            {fe.titulo && <span className="field-error">{fe.titulo}</span>}
          </label>

          <div className="soc-formgrid soc-formgrid--2col">
            <label className="field">
              <span className="field__label">Tipo</span>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as TipoAsamblea)}
                disabled={submitting}
              >
                <option value="ordinaria">Ordinaria</option>
                <option value="extraordinaria">Extraordinaria</option>
              </select>
            </label>
            <label className="field">
              <span className="field__label">
                Fecha<span className="field__req">*</span>
              </span>
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                aria-invalid={!!fe.fecha}
                disabled={submitting}
              />
              {fe.fecha && <span className="field-error">{fe.fecha}</span>}
            </label>
          </div>

          <div className="soc-formgrid soc-formgrid--2col">
            <label className="field">
              <span className="field__label">Hora de inicio (entrada)</span>
              <input
                type="time"
                value={hora}
                onChange={(e) => setHora(e.target.value)}
                disabled={submitting}
              />
            </label>
            <label className="field">
              <span className="field__label">Tolerancia (min)</span>
              <input
                type="number"
                min="0"
                max="240"
                value={tolerancia}
                onChange={(e) => setTolerancia(e.target.value)}
                aria-invalid={!!fe.toleranciaMin}
                disabled={submitting}
              />
              {fe.toleranciaMin && (
                <span className="field-error">{fe.toleranciaMin}</span>
              )}
            </label>
          </div>

          <div className="soc-formgrid soc-formgrid--2col">
            <label className="field">
              <span className="field__label">Lugar</span>
              <input
                value={lugar}
                onChange={(e) => setLugar(e.target.value)}
                placeholder="Local del mercado"
                disabled={submitting}
              />
            </label>
            <label className="field">
              <span className="field__label">Quórum mínimo (%)</span>
              <input
                type="number"
                min="0"
                max="100"
                value={quorum}
                onChange={(e) => setQuorum(e.target.value)}
                aria-invalid={!!fe.quorumMinimo}
                disabled={submitting}
              />
              {fe.quorumMinimo && (
                <span className="field-error">{fe.quorumMinimo}</span>
              )}
            </label>
          </div>

          <label className="field">
            <span className="field__label">Agenda</span>
            <textarea
              rows={3}
              value={agenda}
              onChange={(e) => setAgenda(e.target.value)}
              placeholder="Puntos a tratar…"
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
            {submitting ? "Creando…" : "Crear asamblea"}
          </button>
        </footer>
      </form>
    </div>
  );
}
