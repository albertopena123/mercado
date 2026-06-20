"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Icon } from "@/components/admin/Icon";
import { useToast } from "@/components/admin/toast";
import { useEscClose } from "@/lib/ui/useEscClose";
import { hoyISOPeru } from "@/lib/fecha";
import { buscarSocios, crearDirectivo, editarDirectivo } from "./actions";
import {
  CARGO_LABEL,
  ORGANO_LABEL,
  type DirectivoRow,
  type SocioOption,
} from "./types";
import type { CargoDirectivo, Organo } from "@/generated/prisma/client";

const ORGANOS = Object.keys(ORGANO_LABEL) as Organo[];
const CARGOS = Object.keys(CARGO_LABEL) as CargoDirectivo[];

export function CrearDirectivoModal({
  editar,
  onClose,
  onDone,
}: {
  editar?: DirectivoRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const isEdit = !!editar;

  // Socio (solo en alta).
  const [sq, setSq] = useState(editar ? `${editar.socioNombre}` : "");
  const [results, setResults] = useState<SocioOption[]>([]);
  const [sel, setSel] = useState<SocioOption | null>(
    editar
      ? { id: editar.socioId, codigo: editar.socioCodigo, nombre: editar.socioNombre }
      : null,
  );
  const reqRef = useRef(0);

  const [organo, setOrgano] = useState<Organo>(
    editar?.organo ?? "consejo_directivo",
  );
  const [cargo, setCargo] = useState<CargoDirectivo>(
    editar?.cargo ?? "presidente",
  );
  const [bloque, setBloque] = useState(editar?.bloque ?? "");
  const [periodo, setPeriodo] = useState(editar?.periodo ?? "");
  const [desde, setDesde] = useState(
    editar ? editar.desde.slice(0, 10) : hoyISOPeru(),
  );
  const [observaciones, setObservaciones] = useState(editar?.observaciones ?? "");

  const [topError, setTopError] = useState<string | null>(null);
  const [fe, setFe] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEscClose(true, onClose, submitting);

  const esCoordinacion = organo === "coordinacion_bloque";

  // Búsqueda de socio (solo alta).
  useEffect(() => {
    if (isEdit || sel || sq.trim().length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      const reqId = ++reqRef.current;
      const res = await buscarSocios(sq);
      if (reqId !== reqRef.current) return;
      setResults(res.ok ? res.data! : []);
    }, 350);
    return () => clearTimeout(timer);
  }, [sq, sel, isEdit]);

  function pickSocio(s: SocioOption) {
    setSel(s);
    setResults([]);
    setSq(`${s.nombre} (${s.codigo})`);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (!isEdit && !sel) {
      setTopError("Selecciona el socio.");
      return;
    }
    setSubmitting(true);
    setTopError(null);
    setFe({});

    const res = isEdit
      ? await editarDirectivo(editar!.id, {
          organo,
          cargo,
          bloque: esCoordinacion ? bloque.trim() : null,
          periodo: periodo.trim() || null,
          observaciones: observaciones.trim() || null,
        })
      : await crearDirectivo({
          socioId: sel!.id,
          organo,
          cargo,
          bloque: esCoordinacion ? bloque.trim() : null,
          periodo: periodo.trim() || null,
          desde,
          observaciones: observaciones.trim() || null,
        });

    setSubmitting(false);
    if (!res.ok) {
      setTopError(res.error);
      if (res.fieldErrors) setFe(res.fieldErrors as Record<string, string>);
      return;
    }
    toast.success(isEdit ? "Cargo actualizado." : "Cargo registrado.");
    onDone();
  }

  return (
    <div className="modal-backdrop" onClick={() => !submitting && onClose()}>
      <form
        className="modal"
        style={{ maxWidth: 540 }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <header className="modal__head">
          <h2>{isEdit ? "Editar cargo directivo" : "Nuevo cargo directivo"}</h2>
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

          {isEdit ? (
            <label className="field">
              <span className="field__label">Socio</span>
              <input value={`${editar!.socioNombre} · ${editar!.socioCodigo}`} disabled />
            </label>
          ) : (
            <label className="field" style={{ position: "relative" }}>
              <span className="field__label">
                Socio<span className="field__req">*</span>
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={sq}
                  onChange={(e) => setSq(e.target.value)}
                  placeholder="Nombre o código del socio…"
                  disabled={submitting || !!sel}
                  style={{ flex: 1 }}
                />
                {sel && (
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => {
                      setSel(null);
                      setSq("");
                    }}
                    disabled={submitting}
                  >
                    Cambiar
                  </button>
                )}
              </div>
              {results.length > 0 && (
                <div className="org-typeahead">
                  {results.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => pickSocio(s)}
                      className="org-typeahead__item"
                    >
                      {s.nombre}{" "}
                      <span className="org-muted">· {s.codigo}</span>
                    </button>
                  ))}
                </div>
              )}
            </label>
          )}

          <div className="soc-formgrid soc-formgrid--2col">
            <label className="field">
              <span className="field__label">Órgano</span>
              <select
                value={organo}
                onChange={(e) => {
                  const o = e.target.value as Organo;
                  setOrgano(o);
                  if (o === "coordinacion_bloque") setCargo("coordinador");
                }}
                disabled={submitting}
              >
                {ORGANOS.map((o) => (
                  <option key={o} value={o}>
                    {ORGANO_LABEL[o]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">Cargo</span>
              <select
                value={cargo}
                onChange={(e) => setCargo(e.target.value as CargoDirectivo)}
                disabled={submitting}
              >
                {CARGOS.map((c) => (
                  <option key={c} value={c}>
                    {CARGO_LABEL[c]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {esCoordinacion && (
            <label className="field">
              <span className="field__label">
                Bloque que coordina<span className="field__req">*</span>
              </span>
              <input
                value={bloque}
                onChange={(e) => setBloque(e.target.value.toUpperCase())}
                placeholder="A, B, C…"
                aria-invalid={!!fe.bloque}
                disabled={submitting}
              />
              {fe.bloque && <span className="field-error">{fe.bloque}</span>}
            </label>
          )}

          <div className="soc-formgrid soc-formgrid--2col">
            <label className="field">
              <span className="field__label">Periodo de gestión</span>
              <input
                value={periodo}
                onChange={(e) => setPeriodo(e.target.value)}
                placeholder="2025-2027"
                disabled={submitting}
              />
            </label>
            {!isEdit && (
              <label className="field">
                <span className="field__label">Desde</span>
                <input
                  type="date"
                  value={desde}
                  onChange={(e) => setDesde(e.target.value)}
                  disabled={submitting}
                />
              </label>
            )}
          </div>

          <label className="field">
            <span className="field__label">Observaciones</span>
            <textarea
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              rows={2}
              placeholder="Opcional"
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
          <button type="submit" className="btn btn--primary" disabled={submitting}>
            {submitting
              ? "Guardando…"
              : isEdit
                ? "Guardar cambios"
                : "Registrar cargo"}
          </button>
        </footer>
      </form>
    </div>
  );
}
