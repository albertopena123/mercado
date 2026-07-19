import { DEPARTMENTS, PROVINCES, DISTRICTS } from "./ubigeo-data";

export interface UbigeoInfo {
  departamento: string;
  provincia: string;
  distrito: string;
  /** "DEPARTAMENTO / PROVINCIA / DISTRITO" con los tramos disponibles */
  completo: string;
}

/**
 * Convierte un código de ubigeo (RENIEC, 6 dígitos) en departamento,
 * provincia y distrito.
 *
 * Normaliza la entrada: descarta lo que no sea dígito y rellena con un cero
 * a la izquierda cuando el código llega con 5 dígitos (un cero inicial perdido
 * al haberse guardado como número). Devuelve `null` si el código es inválido o
 * no está en la tabla.
 */
export function lookupUbigeo(raw: string | null | undefined): UbigeoInfo | null {
  if (!raw) return null;

  let code = String(raw).replace(/\D/g, "");
  if (code.length === 5) code = "0" + code;
  if (code.length !== 6) return null;

  const departamento = DEPARTMENTS[code.slice(0, 2)] || "";
  const provincia = PROVINCES[code.slice(0, 4)] || "";
  const distrito = DISTRICTS[code] || "";

  if (!departamento && !provincia && !distrito) return null;

  const completo = [departamento, provincia, distrito].filter(Boolean).join(" / ");
  return { departamento, provincia, distrito, completo };
}
