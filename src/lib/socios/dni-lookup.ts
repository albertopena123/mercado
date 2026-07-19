import "server-only";
import { lookupUbigeo } from "@/lib/ubigeo";

export type DniLookupResult = {
  apellidoPaterno: string;
  apellidoMaterno: string;
  nombres: string;
  fechaNacimiento: string | null; // ISO yyyy-mm-dd o null
  sexo: "M" | "F" | null;
  estadoCivil: string | null;
  direccion: string | null;
  // Resueltos desde UBIGEO_NAC (ubigeo de NACIMIENTO): en esta API es el único
  // ubigeo decodificable (UBIGEO_DIR viene como texto truncado inservible).
  // null cuando la API no trae ubigeo o el código no está en la tabla.
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
};

const ENDPOINT = "https://apidatos.unamad.edu.pe/api/consulta";
const TIMEOUT_MS = 5000;

function titleCase(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\b[a-záéíóúñ]/gu, (c) => c.toUpperCase());
}

function nullIfEmpty(s: string | null | undefined): string | null {
  const t = (s ?? "").trim();
  return t.length > 0 ? t : null;
}

// Una de las APIs externas más volátiles del proyecto — el contrato puede
// cambiar sin previo aviso. Por eso validamos cada campo defensivamente.
type DniApiResponse = {
  DNI?: string;
  AP_PAT?: string;
  AP_MAT?: string;
  NOMBRES?: string;
  FECHA_NAC?: string;
  SEXO?: string;
  EST_CIVIL?: string;
  DIRECCION?: string;
  UBIGEO_DIR?: string; // ubigeo RENIEC del domicilio (6 díg)
  UBIGEO_NAC?: string; // ubigeo RENIEC de nacimiento (no se usa para domicilio)
};

export async function lookupDniUnamad(
  dni: string,
): Promise<DniLookupResult | null> {
  if (!/^\d{8}$/.test(dni)) throw new Error("DNI_INVALID");

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${ENDPOINT}/${dni}`, {
      signal: ctrl.signal,
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`API ${res.status}`);
    const data = (await res.json()) as DniApiResponse;

    // Si la API responde 200 pero el DNI no coincide o falta el campo
    // clave, tratamos como "no encontrado" en vez de propagar basura.
    if (!data || data.DNI !== dni) return null;
    if (!data.AP_PAT && !data.NOMBRES) return null;

    const sexo =
      data.SEXO === "1" ? "M" : data.SEXO === "2" ? "F" : null;

    let fechaNacimiento: string | null = null;
    if (data.FECHA_NAC && /^\d{4}-\d{2}-\d{2}/.test(data.FECHA_NAC)) {
      fechaNacimiento = data.FECHA_NAC.slice(0, 10);
    }

    // Se resuelve depto/prov/distrito desde UBIGEO_NAC (ubigeo de NACIMIENTO).
    // En esta API UBIGEO_DIR (domicilio) no es un código sino texto truncado e
    // inservible ("MADRE ", "LIMA-L"…), mientras que UBIGEO_NAC siempre es un
    // código RENIEC de 6 dígitos decodificable. Es lo mejor disponible; el
    // usuario puede corregir los campos (autocompletado no destructivo).
    const ubigeo = lookupUbigeo(data.UBIGEO_NAC);

    return {
      apellidoPaterno: titleCase(data.AP_PAT ?? ""),
      apellidoMaterno: titleCase(data.AP_MAT ?? ""),
      nombres: titleCase(data.NOMBRES ?? ""),
      fechaNacimiento,
      sexo,
      estadoCivil: data.EST_CIVIL ? titleCase(data.EST_CIVIL) : null,
      direccion: nullIfEmpty(data.DIRECCION),
      departamento: ubigeo ? titleCase(ubigeo.departamento) || null : null,
      provincia: ubigeo ? titleCase(ubigeo.provincia) || null : null,
      distrito: ubigeo ? titleCase(ubigeo.distrito) || null : null,
    };
  } finally {
    clearTimeout(t);
  }
}
