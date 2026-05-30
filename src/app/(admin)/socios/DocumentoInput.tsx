"use client";

import type { TipoDocumento } from "@/generated/prisma/client";

const HINTS: Record<
  TipoDocumento,
  { inputMode: "numeric" | "text"; maxLength: number; placeholder: string }
> = {
  DNI: { inputMode: "numeric", maxLength: 8, placeholder: "8 dígitos" },
  RUC: { inputMode: "numeric", maxLength: 11, placeholder: "11 dígitos" },
  CE: { inputMode: "numeric", maxLength: 12, placeholder: "9 a 12 dígitos" },
  PASAPORTE: {
    inputMode: "text",
    maxLength: 12,
    placeholder: "alfanumérico 6-12",
  },
};

export function DocumentoInput({
  tipo,
  numero,
  onChange,
  fieldErrors,
  disabled,
}: {
  tipo: TipoDocumento;
  numero: string;
  onChange: (tipo: TipoDocumento, numero: string) => void;
  fieldErrors?: { tipoDocumento?: string; numeroDocumento?: string };
  disabled?: boolean;
}) {
  const hint = HINTS[tipo];
  return (
    <div className="documento-input">
      <label className="field">
        <span className="field__label">Tipo</span>
        <select
          value={tipo}
          onChange={(e) => onChange(e.target.value as TipoDocumento, numero)}
          disabled={disabled}
        >
          <option value="DNI">DNI</option>
          <option value="CE">Carné de Extranjería</option>
          <option value="PASAPORTE">Pasaporte</option>
          <option value="RUC">RUC</option>
        </select>
        {fieldErrors?.tipoDocumento && (
          <span className="field-error">{fieldErrors.tipoDocumento}</span>
        )}
      </label>
      <label className="field">
        <span className="field__label">
          Número<span className="field__req">*</span>
        </span>
        <input
          type="text"
          inputMode={hint.inputMode}
          maxLength={hint.maxLength}
          placeholder={hint.placeholder}
          value={numero}
          onChange={(e) => onChange(tipo, e.target.value)}
          disabled={disabled}
        />
        {fieldErrors?.numeroDocumento && (
          <span className="field-error">{fieldErrors.numeroDocumento}</span>
        )}
      </label>
    </div>
  );
}
