"use client";

import { useState, type FormEvent } from "react";
import { Icon } from "@/components/admin/Icon";
import { useEscClose } from "@/lib/ui/useEscClose";
import { hoyISOPeru } from "@/lib/fecha";
import { CARGO_LABEL, CARGOS } from "@/lib/empleados/labels";
import type { TipoDocumento, CargoEmpleado } from "@/generated/prisma/client";
import { createEmpleado } from "./actions";
import type { CreateEmpleadoInput } from "./types";

export function CreateEmpleadoModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const today = hoyISOPeru();
  const [tipoDocumento, setTipoDocumento] = useState<TipoDocumento>("DNI");
  const [numeroDocumento, setNumeroDocumento] = useState("");
  const [apellidoPaterno, setApellidoPaterno] = useState("");
  const [apellidoMaterno, setApellidoMaterno] = useState("");
  const [nombres, setNombres] = useState("");
  const [cargo, setCargo] = useState<CargoEmpleado>("seguridad");
  const [cargoDetalle, setCargoDetalle] = useState("");
  const [fechaIngreso, setFechaIngreso] = useState(today);
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [direccion, setDireccion] = useState("");
  const [salario, setSalario] = useState("");
  const [observaciones, setObservaciones] = useState("");

  const [topError, setTopError] = useState<string | null>(null);
  const [fe, setFe] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEscClose(true, onClose, submitting);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setTopError(null);
    setFe({});
    const input: CreateEmpleadoInput = {
      tipoDocumento,
      numeroDocumento: numeroDocumento.trim(),
      apellidoPaterno: apellidoPaterno.trim(),
      apellidoMaterno: apellidoMaterno.trim() || undefined,
      nombres: nombres.trim(),
      cargo,
      cargoDetalle: cargoDetalle.trim() || undefined,
      fechaIngreso,
      telefono: telefono.trim() || undefined,
      email: email.trim() || undefined,
      direccion: direccion.trim() || undefined,
      salario: salario.trim() ? Number(salario) : undefined,
      observaciones: observaciones.trim() || undefined,
    };
    const res = await createEmpleado(input);
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
        style={{ maxWidth: 560 }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <header className="modal__head">
          <h2>Nuevo personal</h2>
          <button type="button" className="iconbtn" onClick={onClose} aria-label="Cerrar">
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

          <div className="soc-formgrid">
            <label className="field">
              <span className="field__label">Tipo de documento</span>
              <select
                value={tipoDocumento}
                onChange={(e) => setTipoDocumento(e.target.value as TipoDocumento)}
                disabled={submitting}
              >
                <option value="DNI">DNI</option>
                <option value="CE">Carné de Extranjería</option>
                <option value="PASAPORTE">Pasaporte</option>
                <option value="RUC">RUC</option>
              </select>
            </label>
            <label className="field">
              <span className="field__label">
                N° de documento<span className="field__req">*</span>
              </span>
              <input
                value={numeroDocumento}
                onChange={(e) => setNumeroDocumento(e.target.value)}
                placeholder="p. ej. 12345678"
                aria-invalid={!!fe.numeroDocumento}
                disabled={submitting}
                autoFocus
              />
              {fe.numeroDocumento && (
                <span className="field-error">{fe.numeroDocumento}</span>
              )}
            </label>
          </div>

          <div className="soc-formgrid">
            <label className="field">
              <span className="field__label">
                Apellido paterno<span className="field__req">*</span>
              </span>
              <input
                value={apellidoPaterno}
                onChange={(e) => setApellidoPaterno(e.target.value)}
                aria-invalid={!!fe.apellidoPaterno}
                disabled={submitting}
              />
              {fe.apellidoPaterno && (
                <span className="field-error">{fe.apellidoPaterno}</span>
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
              aria-invalid={!!fe.nombres}
              disabled={submitting}
            />
            {fe.nombres && <span className="field-error">{fe.nombres}</span>}
          </label>

          <div className="soc-formgrid">
            <label className="field">
              <span className="field__label">Cargo</span>
              <select
                value={cargo}
                onChange={(e) => setCargo(e.target.value as CargoEmpleado)}
                disabled={submitting}
              >
                {CARGOS.map((c) => (
                  <option key={c} value={c}>
                    {CARGO_LABEL[c]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">
                Labora desde<span className="field__req">*</span>
              </span>
              <input
                type="date"
                value={fechaIngreso}
                max={today}
                onChange={(e) => setFechaIngreso(e.target.value)}
                aria-invalid={!!fe.fechaIngreso}
                disabled={submitting}
              />
              {fe.fechaIngreso && (
                <span className="field-error">{fe.fechaIngreso}</span>
              )}
            </label>
          </div>

          {cargo === "otro" && (
            <label className="field">
              <span className="field__label">Detalle del cargo</span>
              <input
                value={cargoDetalle}
                onChange={(e) => setCargoDetalle(e.target.value)}
                placeholder="describe la función"
                disabled={submitting}
              />
            </label>
          )}

          <div className="soc-formgrid">
            <label className="field">
              <span className="field__label">Teléfono</span>
              <input
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                disabled={submitting}
              />
            </label>
            <label className="field">
              <span className="field__label">Salario mensual (S/)</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={salario}
                onChange={(e) => setSalario(e.target.value)}
                placeholder="opcional"
                aria-invalid={!!fe.salario}
                disabled={submitting}
              />
              {fe.salario && <span className="field-error">{fe.salario}</span>}
            </label>
          </div>

          <label className="field">
            <span className="field__label">Correo</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={!!fe.email}
              disabled={submitting}
            />
            {fe.email && <span className="field-error">{fe.email}</span>}
          </label>

          <label className="field">
            <span className="field__label">Dirección</span>
            <input
              value={direccion}
              onChange={(e) => setDireccion(e.target.value)}
              disabled={submitting}
            />
          </label>

          <label className="field">
            <span className="field__label">Observaciones</span>
            <textarea
              rows={2}
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              disabled={submitting}
            />
          </label>

          <p className="modal__intro" style={{ marginTop: 4 }}>
            El CV y otros documentos se suben después, desde el detalle.
          </p>
        </div>
        <footer className="modal__foot">
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary" disabled={submitting}>
            {submitting ? "Guardando…" : "Registrar personal"}
          </button>
        </footer>
      </form>
    </div>
  );
}
