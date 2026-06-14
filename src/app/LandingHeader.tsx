"use client";

import { useEffect, useState } from "react";

const LINKS = [
  { href: "#mercado", label: "El mercado" },
  { href: "#categorias", label: "Categorías" },
  { href: "#comerciantes", label: "Comerciantes" },
  { href: "#ubicacion", label: "Ubicación" },
];

export function LandingHeader() {
  const [open, setOpen] = useState(false);

  // Cerrar el menú con la tecla Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const close = () => setOpen(false);

  return (
    <header className="lp-header">
      <div className="lp__container lp-header__inner">
        <a
          href="#top"
          className="lp-brand"
          aria-label="Mercado Milagros, inicio"
          onClick={close}
        >
          <span className="lp-brand__mark">M</span>
          <span>
            <span className="lp-brand__name">Mercado Milagros</span>
            <span className="lp-brand__sub">Madre de Dios · Perú</span>
          </span>
        </a>

        <nav className="lp-nav">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href}>
              {l.label}
            </a>
          ))}
        </nav>

        <div className="lp-header__actions">
          <a className="lp-btn lp-btn--primary" href="/login">
            Acceder al sistema
          </a>
          <button
            type="button"
            className="lp-burger"
            aria-label={open ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={open}
            aria-controls="lp-mobile-menu"
            onClick={() => setOpen((v) => !v)}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {open ? (
                <path d="M6 6l12 12M18 6 6 18" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      <div
        id="lp-mobile-menu"
        className={`lp-mobile${open ? " is-open" : ""}`}
      >
        {LINKS.map((l) => (
          <a key={l.href} href={l.href} onClick={close}>
            {l.label}
          </a>
        ))}
        <a className="lp-btn lp-btn--primary" href="/login" onClick={close}>
          Acceder al sistema
        </a>
      </div>
    </header>
  );
}
