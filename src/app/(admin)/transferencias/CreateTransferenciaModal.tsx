"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { Icon } from "@/components/admin/Icon";
import { useEscClose } from "@/lib/ui/useEscClose";
import {
  buscarSociosConPuesto,
  lookupDniAdquiriente,
  createTransferencia,
} from "./actions";
import type { TransferenteOption } from "./types";

function hoyISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(
    new Date(),
  );
}

export function CreateTransferenciaModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  // Transferente
  const [tq, setTq] = useState("");
  const [tResults, setTResults] = useState<TransferenteOption[]>([]);
  const [tSel, setTSel] = useState<TransferenteOption | null>(null);
  const [puestoId, setPuestoId] = useState("");
  const tReqRef = useRef(0);

  // Adquiriente
  const [dni, setDni] = useState("");
  const [apellidoPaterno, setApellidoPaterno] = useState("");
  const [apellidoMaterno, setApellidoMaterno] = useState("");
  const [nombres, setNombres] = useState("");
  const [estadoCivil, setEstadoCivil] = useState("");
  const [direccion, setDireccion] = useState("");
  const [distrito, setDistrito] = useState("");
  const [provincia, setProvincia] = useState("");
  const [departamento, setDepartamento] = useState("");
  const [telefono, setTelefono] = useState("");
  const [, startLookup] = useTransition();
  const [dniMsg, setDniMsg] = useState<string | null>(null);
  const [lookedUp, setLookedUp] = useState<string | null>(null);
  const dniReqRef = useRef(0);

  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState(hoyISO());

  const [topError, setTopError] = useState<string | null>(null);
  const [fe, setFe] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEscClose(true, onClose, submitting);

  // Búsqueda del transferente (debounce).
  useEffect(() => {
    if (tSel || tq.trim().length < 2) {
      // Limpia resultados cuando no hay término válido: efecto de sincronización
      // con un input externo (debounce), no un valor derivable en render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      const reqId = ++tReqRef.current;
      const res = await buscarSociosConPuesto(tq);
      if (reqId !== tReqRef.current) return;
      setTResults(res.ok ? res.data! : []);
    }, 350);
    return () => clearTimeout(timer);
  }, [tq, tSel]);

  function pickTransferente(t: TransferenteOption) {
    setTSel(t);
    setTResults([]);
    setTq(`${t.nombre} (${t.codigo})`);
    if (t.puestos.length === 1) setPuestoId(t.puestos[0].id);
  }
  function clearTransferente() {
    setTSel(null);
    setPuestoId("");
    setTq("");
  }

  // Lookup DNI del adquiriente (RENIEC).
  useEffect(() => {
    if (!/^\d{8}$/.test(dni) || lookedUp === dni) {
      // Limpia el mensaje cuando el DNI deja de ser válido (sincroniza con input).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (!/^\d{8}$/.test(dni)) setDniMsg(null);
      return;
    }
    const timer = setTimeout(() => {
      const reqId = ++dniReqRef.current;
      setDniMsg("Consultando RENIEC…");
      startLookup(async () => {
        const res = await lookupDniAdquiriente(dni);
        if (reqId !== dniReqRef.current) return;
        setLookedUp(dni);
        if (!res.ok) {
          setDniMsg(res.error);
          return;
        }
        const d = res.data!;
        setApellidoPaterno((p) => p || d.apellidoPaterno);
        setApellidoMaterno((p) => p || d.apellidoMaterno);
        setNombres((p) => p || d.nombres);
        if (d.estadoCivil) setEstadoCivil((p) => p || d.estadoCivil!);
        if (d.direccion) setDireccion((p) => p || d.direccion!);
        setDniMsg(`RENIEC · ${d.nombres} ${d.apellidoPaterno}`);
      });
    }, 450);
    return () => clearTimeout(timer);
  }, [dni, lookedUp]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (!tSel) {
      setTopError("Selecciona el socio transferente.");
      return;
    }
    if (!puestoId) {
      setTopError("Selecciona el puesto a transferir.");
      return;
    }
    setSubmitting(true);
    setTopError(null);
    setFe({});
    const res = await createTransferencia({
      transferenteId: tSel.id,
      puestoId,
      fecha,
      monto: monto.trim() ? Number(monto) : null,
      adqTipoDocumento: "DNI",
      adqNumeroDocumento: dni.trim(),
      adqApellidoPaterno: apellidoPaterno.trim(),
      adqApellidoMaterno: apellidoMaterno.trim() || undefined,
      adqNombres: nombres.trim(),
      adqEstadoCivil: estadoCivil.trim() || undefined,
      adqDireccion: direccion.trim() || undefined,
      adqDistrito: distrito.trim() || undefined,
      adqProvincia: provincia.trim() || undefined,
      adqDepartamento: departamento.trim() || undefined,
      adqTelefono: telefono.trim() || undefined,
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
        style={{ maxWidth: 620 }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <header className="modal__head">
          <h2>Nueva transferencia de puesto</h2>
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

          {/* Transferente */}
          <h4 style={{ margin: "0 0 8px" }}>Transferente (socio actual)</h4>
          <label className="field" style={{ position: "relative" }}>
            <span className="field__label">
              Buscar socio<span className="field__req">*</span>
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={tq}
                onChange={(e) => setTq(e.target.value)}
                placeholder="Nombre o código del socio…"
                disabled={submitting || !!tSel}
                style={{ flex: 1 }}
              />
              {tSel && (
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={clearTransferente}
                  disabled={submitting}
                >
                  Cambiar
                </button>
              )}
            </div>
            {tResults.length > 0 && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  right: 0,
                  zIndex: 10,
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  marginTop: 4,
                  maxHeight: 220,
                  overflow: "auto",
                  boxShadow: "var(--shadow-sm)",
                }}
              >
                {tResults.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => pickTransferente(t)}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "8px 12px",
                      border: 0,
                      background: "transparent",
                      cursor: "pointer",
                      fontSize: 13.5,
                    }}
                  >
                    {t.nombre}{" "}
                    <span style={{ color: "var(--text-muted)" }}>
                      · {t.codigo} · {t.puestos.length} puesto(s)
                    </span>
                  </button>
                ))}
              </div>
            )}
          </label>

          {tSel && (
            <label className="field">
              <span className="field__label">
                Puesto a transferir<span className="field__req">*</span>
              </span>
              <select
                value={puestoId}
                onChange={(e) => setPuestoId(e.target.value)}
                disabled={submitting}
              >
                <option value="">Selecciona…</option>
                {tSel.puestos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.codigo} · {p.dimensionLabel}
                    {p.giroLabel ? ` · ${p.giroLabel}` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}

          {/* Adquiriente */}
          <h4 style={{ margin: "18px 0 8px" }}>Adquiriente (nuevo dueño)</h4>
          <div className="soc-formgrid soc-formgrid--2col">
            <label className="field">
              <span className="field__label">
                DNI<span className="field__req">*</span>
              </span>
              <input
                value={dni}
                onChange={(e) => setDni(e.target.value.replace(/\D/g, ""))}
                placeholder="8 dígitos"
                inputMode="numeric"
                aria-invalid={!!fe.adqNumeroDocumento}
                disabled={submitting}
              />
              {fe.adqNumeroDocumento && (
                <span className="field-error">{fe.adqNumeroDocumento}</span>
              )}
              {dniMsg && (
                <span
                  style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}
                >
                  {dniMsg}
                </span>
              )}
            </label>
            <label className="field">
              <span className="field__label">Estado civil</span>
              <input
                value={estadoCivil}
                onChange={(e) => setEstadoCivil(e.target.value)}
                placeholder="soltero(a), casado(a)…"
                disabled={submitting}
              />
            </label>
          </div>
          <div className="soc-formgrid soc-formgrid--2col">
            <label className="field">
              <span className="field__label">
                Apellido paterno<span className="field__req">*</span>
              </span>
              <input
                value={apellidoPaterno}
                onChange={(e) => setApellidoPaterno(e.target.value)}
                aria-invalid={!!fe.adqApellidoPaterno}
                disabled={submitting}
              />
              {fe.adqApellidoPaterno && (
                <span className="field-error">{fe.adqApellidoPaterno}</span>
              )}
            </label>
            <label className="field">
              <span className="field__label">Apellido materno</span>
              <input
                value={apellidoMaterno}
                onChange={(e) => setApellidoMaterno(e.target.value)}
                disabled={submitting}
              />
            </label>
          </div>
          <label className="field">
            <span className="field__label">
              Nombres<span className="field__req">*</span>
            </span>
            <input
              value={nombres}
              onChange={(e) => setNombres(e.target.value)}
              aria-invalid={!!fe.adqNombres}
              disabled={submitting}
            />
            {fe.adqNombres && (
              <span className="field-error">{fe.adqNombres}</span>
            )}
          </label>
          <label className="field">
            <span className="field__label">Domicilio</span>
            <input
              value={direccion}
              onChange={(e) => setDireccion(e.target.value)}
              placeholder="dirección completa"
              disabled={submitting}
            />
          </label>
          <div className="soc-formgrid soc-formgrid--2col">
            <label className="field">
              <span className="field__label">Distrito</span>
              <input
                value={distrito}
                onChange={(e) => setDistrito(e.target.value)}
                disabled={submitting}
              />
            </label>
            <label className="field">
              <span className="field__label">Provincia</span>
              <input
                value={provincia}
                onChange={(e) => setProvincia(e.target.value)}
                disabled={submitting}
              />
            </label>
          </div>
          <div className="soc-formgrid soc-formgrid--2col">
            <label className="field">
              <span className="field__label">Departamento</span>
              <input
                value={departamento}
                onChange={(e) => setDepartamento(e.target.value)}
                disabled={submitting}
              />
            </label>
            <label className="field">
              <span className="field__label">Teléfono</span>
              <input
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                disabled={submitting}
              />
            </label>
          </div>

          {/* Datos del trámite */}
          <h4 style={{ margin: "18px 0 8px" }}>Datos del trámite</h4>
          <div className="soc-formgrid soc-formgrid--2col">
            <label className="field">
              <span className="field__label">Fecha del contrato</span>
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                aria-invalid={!!fe.fecha}
                disabled={submitting}
              />
              {fe.fecha && <span className="field-error">{fe.fecha}</span>}
            </label>
            <label className="field">
              <span className="field__label">Monto de venta (S/) · interno</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                placeholder="opcional"
                aria-invalid={!!fe.monto}
                disabled={submitting}
              />
              {fe.monto && <span className="field-error">{fe.monto}</span>}
            </label>
          </div>
          <p className="modal__intro" style={{ marginTop: 4 }}>
            Se crea el expediente en <b>borrador</b>. Desde el detalle imprimes
            los documentos, subes la renuncia y el contrato <b>firmados</b>, y al{" "}
            <b>Formalizar</b> se da de alta al adquiriente y se mueve el puesto.
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
          <button type="submit" className="btn btn--primary" disabled={submitting}>
            {submitting ? "Creando…" : "Crear expediente"}
          </button>
        </footer>
      </form>
    </div>
  );
}
