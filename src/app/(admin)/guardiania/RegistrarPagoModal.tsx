"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Icon } from "@/components/admin/Icon";
import { useEscClose } from "@/lib/ui/useEscClose";
import { useToast } from "@/components/admin/toast";
import { hoyISOPeru } from "@/lib/fecha";
import { buscarPuestosGuardiania, registrarPago } from "./actions";
import type { PuestoPick } from "./types";

export function RegistrarPagoModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const today = hoyISOPeru();
  const [fecha, setFecha] = useState(today);
  const [periodo, setPeriodo] = useState(today.slice(0, 7));
  const [importe, setImporte] = useState("");
  const [nroRecibo, setNroRecibo] = useState("");
  const [metodoPago, setMetodoPago] = useState("efectivo");
  const [responsable, setResponsable] = useState("");
  const [observacion, setObservacion] = useState("");

  const [puesto, setPuesto] = useState<PuestoPick | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PuestoPick[]>([]);

  const [fe, setFe] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEscClose(true, onClose, submitting);

  useEffect(() => {
    if (puesto) return;
    const term = query.trim();
    if (!term) return;
    const timer = setTimeout(() => {
      (async () => {
        const res = await buscarPuestosGuardiania(term);
        if (res.ok) setResults(res.data!.slice(0, 6));
      })();
    }, 300);
    return () => clearTimeout(timer);
  }, [query, puesto]);

  function pick(p: PuestoPick) {
    setPuesto(p);
    setResults([]);
    if (p.tarifa && !importe) setImporte(String(p.tarifa));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setFe({});
    const res = await registrarPago({
      fecha,
      periodo,
      importe: Number(importe),
      nroRecibo: nroRecibo || undefined,
      puestoId: puesto?.id,
      socioId: puesto?.socioId ?? undefined,
      metodoPago: metodoPago || undefined,
      responsable: responsable || undefined,
      observacion: observacion || undefined,
    });
    setSubmitting(false);
    if (!res.ok) {
      toast.error(res.error);
      if (res.fieldErrors) setFe(res.fieldErrors as Record<string, string>);
      return;
    }
    toast.success("Pago de guardianía registrado.");
    onSaved();
  }

  return (
    <div className="modal-backdrop" onClick={() => !submitting && onClose()}>
      <form className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <header className="modal__head">
          <h2>Registrar pago de guardianía</h2>
          <button type="button" className="iconbtn" onClick={onClose} aria-label="Cerrar">
            <Icon name="close" size={20} />
          </button>
        </header>
        <div className="modal__body">
          {/* Puesto */}
          <label className="field">
            <span className="field__label">Puesto</span>
            {puesto ? (
              <div className="gd-picked">
                <span>
                  <strong>{puesto.codigo}</strong> — {puesto.socioNombre}
                </span>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setPuesto(null)}>
                  Cambiar
                </button>
              </div>
            ) : (
              <>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar por código de puesto o socio…"
                  disabled={submitting}
                />
                {results.length > 0 && (
                  <div className="gd-picklist">
                    {results.map((p) => (
                      <button type="button" key={p.id} className="gd-pickitem" onClick={() => pick(p)}>
                        <strong>{p.codigo}</strong>
                        <span>{p.socioNombre}</span>
                        {p.tarifa != null && <em>S/{p.tarifa}</em>}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </label>

          <div className="caja-form-row">
            <label className="field">
              <span className="field__label">Fecha de cobro</span>
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)}
                aria-invalid={!!fe.fecha} disabled={submitting} />
              {fe.fecha && <span className="field-error">{fe.fecha}</span>}
            </label>
            <label className="field">
              <span className="field__label">Mes cubierto</span>
              <input type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)}
                aria-invalid={!!fe.periodo} disabled={submitting} />
              {fe.periodo && <span className="field-error">{fe.periodo}</span>}
            </label>
          </div>

          <div className="caja-form-row">
            <label className="field">
              <span className="field__label">Importe (S/)</span>
              <input type="number" step="0.01" min="0" value={importe}
                onChange={(e) => setImporte(e.target.value)} placeholder="0.00"
                aria-invalid={!!fe.importe} disabled={submitting} />
              {fe.importe && <span className="field-error">{fe.importe}</span>}
            </label>
            <label className="field">
              <span className="field__label">N° recibo</span>
              <input value={nroRecibo} onChange={(e) => setNroRecibo(e.target.value)}
                placeholder="Ej. 5630" disabled={submitting} />
            </label>
          </div>

          <div className="caja-form-row">
            <label className="field">
              <span className="field__label">Método de pago</span>
              <select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)} disabled={submitting}>
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
                <option value="yape/plin">Yape / Plin</option>
                <option value="otro">Otro</option>
              </select>
            </label>
            <label className="field">
              <span className="field__label">Responsable (cobrador)</span>
              <input value={responsable} onChange={(e) => setResponsable(e.target.value)}
                placeholder="Quién cobró" disabled={submitting} />
            </label>
          </div>

          <label className="field">
            <span className="field__label">Observación</span>
            <input value={observacion} onChange={(e) => setObservacion(e.target.value)} disabled={submitting} />
          </label>
        </div>
        <footer className="modal__foot">
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary" disabled={submitting}>
            {submitting ? "Guardando…" : "Registrar pago"}
          </button>
        </footer>
      </form>
    </div>
  );
}
