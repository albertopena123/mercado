import Link from "next/link";

// Cabecera con la marca del sitio para el formulario público. Da identidad y
// confianza a quien abre el link desde WhatsApp. Réplica visual del header
// principal (marca "GF" morada + nombre), pero sin la navegación de la landing
// (esos anclajes no existen aquí). El logo lleva al inicio del sitio.
export function FormularioHeader() {
  return (
    <header className="fp-header">
      <div className="fp-header__inner">
        <Link
          href="/"
          className="fp-brand"
          aria-label="Gran Feria Mayorista Internacional, ir al inicio"
        >
          <span className="fp-brand__mark">GF</span>
          <span className="fp-brand__text">
            <span className="fp-brand__name">
              Gran Feria Mayorista Internacional
            </span>
            <span className="fp-brand__sub">Madre de Dios · Perú</span>
          </span>
        </Link>
      </div>
    </header>
  );
}
