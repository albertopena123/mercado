// Mismo shape de resultado que el resto de módulos admin (organos, reportes…):
// las actions devuelven ActionResult<T>, nunca un tipo ad-hoc.
export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | {
      ok: false;
      error: string;
      fieldErrors?: Partial<Record<string, string>>;
    };
