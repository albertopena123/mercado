"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { lookupDniAdquiriente } from "./actions";

export type AdqValue = {
  dni: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
  nombres: string;
  estadoCivil: string;
  direccion: string;
  distrito: string;
  provincia: string;
  departamento: string;
  telefono: string;
};

export const emptyAdq: AdqValue = {
  dni: "",
  apellidoPaterno: "",
  apellidoMaterno: "",
  nombres: "",
  estadoCivil: "",
  direccion: "",
  distrito: "",
  provincia: "",
  departamento: "",
  telefono: "",
};

// Formulario controlado de datos del adquiriente, con autocompletado por DNI
// (RENIEC). Se usa una vez (mismo comprador) o una por puesto (compradores
// distintos). El lookup vive aquí para que cada instancia consulte su propio DNI.
export function AdquirienteFields({
  value,
  onChange,
  disabled,
}: {
  value: AdqValue;
  onChange: (v: AdqValue) => void;
  disabled?: boolean;
}) {
  const [, startLookup] = useTransition();
  const [dniMsg, setDniMsg] = useState<string | null>(null);
  const [lookedUp, setLookedUp] = useState<string | null>(null);
  const reqRef = useRef(0);
  // Refs a los últimos value/onChange: el efecto de lookup solo depende del DNI,
  // pero al resolver necesita el valor y el callback actuales (sin re-disparar el
  // debounce en cada render ni pisar lo ya escrito). Se actualizan en un efecto
  // (no en render) para cumplir la regla react-hooks/refs.
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    valueRef.current = value;
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    if (!/^\d{8}$/.test(value.dni) || lookedUp === value.dni) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (!/^\d{8}$/.test(value.dni)) setDniMsg(null);
      return;
    }
    const timer = setTimeout(() => {
      const reqId = ++reqRef.current;
      setDniMsg("Consultando RENIEC…");
      startLookup(async () => {
        const res = await lookupDniAdquiriente(value.dni);
        if (reqId !== reqRef.current) return;
        setLookedUp(value.dni);
        if (!res.ok) {
          setDniMsg(res.error);
          return;
        }
        const d = res.data!;
        const v = valueRef.current;
        onChangeRef.current({
          ...v,
          apellidoPaterno: v.apellidoPaterno || d.apellidoPaterno,
          apellidoMaterno: v.apellidoMaterno || d.apellidoMaterno,
          nombres: v.nombres || d.nombres,
          estadoCivil: v.estadoCivil || (d.estadoCivil ?? ""),
          direccion: v.direccion || (d.direccion ?? ""),
          distrito: v.distrito || (d.distrito ?? ""),
          provincia: v.provincia || (d.provincia ?? ""),
          departamento: v.departamento || (d.departamento ?? ""),
        });
        setDniMsg(`RENIEC · ${d.nombres} ${d.apellidoPaterno}`);
      });
    }, 450);
    return () => clearTimeout(timer);
  }, [value.dni, lookedUp]);

  const set = (patch: Partial<AdqValue>) => onChange({ ...value, ...patch });

  return (
    <>
      <div className="soc-formgrid soc-formgrid--2col">
        <label className="field">
          <span className="field__label">
            DNI<span className="field__req">*</span>
          </span>
          <input
            value={value.dni}
            onChange={(e) => set({ dni: e.target.value.replace(/\D/g, "") })}
            placeholder="8 dígitos"
            inputMode="numeric"
            disabled={disabled}
          />
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
            value={value.estadoCivil}
            onChange={(e) => set({ estadoCivil: e.target.value })}
            placeholder="soltero(a), casado(a)…"
            disabled={disabled}
          />
        </label>
      </div>
      <div className="soc-formgrid soc-formgrid--2col">
        <label className="field">
          <span className="field__label">
            Apellido paterno<span className="field__req">*</span>
          </span>
          <input
            value={value.apellidoPaterno}
            onChange={(e) => set({ apellidoPaterno: e.target.value })}
            disabled={disabled}
          />
        </label>
        <label className="field">
          <span className="field__label">Apellido materno</span>
          <input
            value={value.apellidoMaterno}
            onChange={(e) => set({ apellidoMaterno: e.target.value })}
            disabled={disabled}
          />
        </label>
      </div>
      <label className="field">
        <span className="field__label">
          Nombres<span className="field__req">*</span>
        </span>
        <input
          value={value.nombres}
          onChange={(e) => set({ nombres: e.target.value })}
          disabled={disabled}
        />
      </label>
      <label className="field">
        <span className="field__label">Domicilio</span>
        <input
          value={value.direccion}
          onChange={(e) => set({ direccion: e.target.value })}
          placeholder="dirección completa"
          disabled={disabled}
        />
      </label>
      <div className="soc-formgrid soc-formgrid--2col">
        <label className="field">
          <span className="field__label">Distrito</span>
          <input
            value={value.distrito}
            onChange={(e) => set({ distrito: e.target.value })}
            disabled={disabled}
          />
        </label>
        <label className="field">
          <span className="field__label">Provincia</span>
          <input
            value={value.provincia}
            onChange={(e) => set({ provincia: e.target.value })}
            disabled={disabled}
          />
        </label>
      </div>
      <div className="soc-formgrid soc-formgrid--2col">
        <label className="field">
          <span className="field__label">Departamento</span>
          <input
            value={value.departamento}
            onChange={(e) => set({ departamento: e.target.value })}
            disabled={disabled}
          />
        </label>
        <label className="field">
          <span className="field__label">Teléfono</span>
          <input
            value={value.telefono}
            onChange={(e) => set({ telefono: e.target.value })}
            disabled={disabled}
          />
        </label>
      </div>
    </>
  );
}
