// Tipos del padrón histórico. Archivo SIN `server-only` a propósito: los
// componentes cliente (tabs de los drawers, página de búsqueda) los importan, y
// no pueden tocar `historico.ts`, que sí es server-only.

export type RegistroHistorico = {
  nombre: string | null;
  nombreOriginal: string | null;
  observacion: string | null;
  numeroPadron: number | null;
  numeroDocumento: string | null;
  socioId: string | null;
};

// Un slot por empadronamiento, SIEMPRE los cuatro. `registro: null` significa
// que esa gestión no empadronó ese puesto — la ausencia es información y la UI
// debe mostrarla, no omitirla.
export type SlotLinaje = {
  anio: number;
  gestion: string;
  orden: number;
  registro: RegistroHistorico | null;
  cambioDeTitular: boolean;
};

export type LinajePuesto = {
  puestoId: string;
  puestoCodigo: string;
  slots: SlotLinaje[];
  titularActual: { socioId: string; nombre: string } | null;
};

export type AntiguedadPuesto = {
  puestoId: string;
  puestoCodigo: string;
  desdeAnio: number | null;
  desdeGestion: string | null;
};

// `desdeAnio`/`desdeGestion` es el agregado: el empadronamiento más antiguo
// entre los puestos del socio. `puestoQueLoJustifica` acompaña siempre al
// agregado en la UI — una antigüedad que no se puede auditar de un vistazo no
// sirve para asignar un derecho.
export type AntiguedadSocio = {
  desdeAnio: number | null;
  desdeGestion: string | null;
  puestoQueLoJustifica: string | null;
  porPuesto: AntiguedadPuesto[];
};

export type RegistroBusqueda = {
  id: string;
  anio: number;
  gestion: string;
  puestoCodigo: string;
  nombreOriginal: string | null;
  numeroPadron: number | null;
  numeroDocumento: string | null;
  socioId: string | null;
};
