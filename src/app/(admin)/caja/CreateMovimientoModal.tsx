"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Icon } from "@/components/admin/Icon";
import { useToast } from "@/components/admin/toast";
import { useEscClose } from "@/lib/ui/useEscClose";
import { hoyISOPeru } from "@/lib/fecha";
import { listSocios } from "../socios/actions";
import type {
  TipoMovimiento,
  CategoriaMovimiento,
  TipoComprobante,
} from "@/generated/prisma/client";
import {
  CATEGORIA_LABEL,
  categoriasPorTipo,
  TIPOS_COMPROBANTE,
  COMPROBANTE_LABEL,
  METODOS_PAGO,
} from "@/lib/caja/labels";
import { createMovimiento } from "./actions";
import type { SocioRow } from "../socios/types";

export function CreateMovimientoModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const toast = useToast();
  // Día de hoy en Perú (UTC-5), no en UTC ni en la zona del navegador.
  const today = hoyISOPeru();
  const [tipo, setTipo] = useState<TipoMovimiento>("egreso");
  const [categoria, setCategoria] = useState<CategoriaMovimiento>("compra");
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState(today);
  const [concepto, setConcepto] = useState("");
  const [metodoPago, setMetodoPago] = useState("efectivo");
  const [comprobanteTipo, setComprobanteTipo] = useState<TipoComprobante>("ninguno");
  const [comprobanteNumero, setComprobanteNumero] = useState("");
  // socio opcional
  const [socioId, setSocioId] = useState<string | null>(null);
  const [socioLabel, setSocioLabel] = useState("");
  const [socioQuery, setSocioQuery] = useState("");
  const [socioResults, setSocioResults] = useState<SocioRow[]>([]);

  const [fe, setFe] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEscClose(true, onClose, submitting);

  function onTipoChange(t: TipoMovimiento) {
    setTipo(t);
    setCategoria(categoriasPorTipo(t)[0]);
  }

  // Búsqueda de socio (debounce), solo si aún no se eligió.
  useEffect(() => {
    if (socioId) return;
    const term = socioQuery.trim();
    if (!term) return;
    const timer = setTimeout(() => {
      (async () => {
        const res = await listSocios({ q: term, page: 1 });
        if (res.ok) setSocioResults(res.data!.items.slice(0, 5));
      })();
    }, 350);
    return () => clearTimeout(timer);
  }, [socioQuery, socioId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setFe({});
    const res = await createMovimiento({
      tipo,
      categoria,
      monto: Number(monto),
      fecha,
      concepto,
      metodoPago: metodoPago || undefined,
      socioId,
      comprobanteTipo,
      comprobanteNumero: comprobanteNumero || undefined,
    });
    setSubmitting(false);
    if (!res.ok) {
      toast.error(res.error);
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
          <h2>Nuevo movimiento</h2>
          <button type="button" className="iconbtn" onClick={onClose} aria-label="Cerrar">
            <Icon name="close" size={20} />
          </button>
        </header>
        <div className="modal__body">
          <div className="caja-seg">
            <button
              type="button"
              className={`caja-seg__btn ${tipo === "egreso" ? "is-on caja-seg__btn--out" : ""}`}
              onClick={() => onTipoChange("egreso")}
            >
              Egreso (gasto)
            </button>
            <button
              type="button"
              className={`caja-seg__btn ${tipo === "ingreso" ? "is-on caja-seg__btn--in" : ""}`}
              onClick={() => onTipoChange("ingreso")}
            >
              Ingreso
            </button>
          </div>

          <div className="caja-form-row">
            <label className="field">
              <span className="field__label">Categoría</span>
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value as CategoriaMovimiento)}
                disabled={submitting}
              >
                {categoriasPorTipo(tipo).map((c) => (
                  <option key={c} value={c}>
                    {CATEGORIA_LABEL[c]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">Monto (S/)</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                placeholder="0.00"
                aria-invalid={!!fe.monto}
                autoFocus
                disabled={submitting}
              />
              {fe.monto && <span className="field-error">{fe.monto}</span>}
            </label>
          </div>

          <label className="field">
            <span className="field__label">Concepto</span>
            <input
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
              placeholder="Ej. Compra de útiles de limpieza para SS-HH"
              aria-invalid={!!fe.concepto}
              disabled={submitting}
            />
            {fe.concepto && <span className="field-error">{fe.concepto}</span>}
          </label>

          <div className="caja-form-row">
            <label className="field">
              <span className="field__label">Fecha</span>
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                max={today}
                disabled={submitting}
              />
            </label>
            <label className="field">
              <span className="field__label">Método de pago</span>
              <select
                value={metodoPago}
                onChange={(e) => setMetodoPago(e.target.value)}
                disabled={submitting}
              >
                {METODOS_PAGO.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="caja-form-row">
            <label className="field">
              <span className="field__label">Comprobante</span>
              <select
                value={comprobanteTipo}
                onChange={(e) => setComprobanteTipo(e.target.value as TipoComprobante)}
                disabled={submitting}
              >
                {TIPOS_COMPROBANTE.map((c) => (
                  <option key={c} value={c}>
                    {COMPROBANTE_LABEL[c]}
                  </option>
                ))}
              </select>
            </label>
            {comprobanteTipo !== "ninguno" && (
              <label className="field">
                <span className="field__label">N° de comprobante</span>
                <input
                  value={comprobanteNumero}
                  onChange={(e) => setComprobanteNumero(e.target.value)}
                  placeholder="Ej. B001-1234"
                  disabled={submitting}
                />
              </label>
            )}
          </div>

          {/* Socio opcional (multas, inscripción…) */}
          <label className="field">
            <span className="field__label">Socio relacionado (opcional)</span>
            {socioId ? (
              <div className="caja-socio-picked">
                <span>{socioLabel}</span>
                <button
                  type="button"
                  className="linkbtn"
                  onClick={() => {
                    setSocioId(null);
                    setSocioLabel("");
                    setSocioQuery("");
                  }}
                  disabled={submitting}
                >
                  Quitar
                </button>
              </div>
            ) : (
              <input
                value={socioQuery}
                onChange={(e) => setSocioQuery(e.target.value)}
                placeholder="DNI, código o nombre…"
                disabled={submitting}
              />
            )}
            {!socioId && socioResults.length > 0 && (
              <ul className="caja-socio-results">
                {socioResults.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSocioId(s.id);
                        setSocioLabel(
                          `${s.apellidoPaterno} ${s.apellidoMaterno ?? ""}, ${s.nombres} · ${s.codigo}`,
                        );
                        setSocioResults([]);
                      }}
                    >
                      <span className="caja-socio-results__name">
                        {s.apellidoPaterno} {s.apellidoMaterno ?? ""}, {s.nombres}
                      </span>
                      <span className="caja-socio-results__meta">
                        {s.codigo} · {s.tipoDocumento} {s.numeroDocumento}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </label>

          <p className="modal__intro" style={{ marginTop: 4 }}>
            El archivo de la boleta/factura se sube después, desde el detalle.
          </p>
        </div>
        <footer className="modal__foot">
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary" disabled={submitting}>
            {submitting ? "Guardando…" : "Registrar movimiento"}
          </button>
        </footer>
      </form>
    </div>
  );
}
