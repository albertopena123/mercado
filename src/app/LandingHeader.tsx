"use client";

import { useEffect, useRef, useState } from "react";

/* Orden = orden real de aparición al hacer scroll. #comerciantes vive DENTRO de
   la sección #mercado y aparece antes que #categorias. */
const LINKS = [
  { href: "#mercado", label: "El mercado" },
  { href: "#comerciantes", label: "Comerciantes" },
  { href: "#categorias", label: "Categorías" },
  { href: "#ubicacion", label: "Ubicación" },
];

export function LandingHeader() {
  const [open, setOpen] = useState(false);
  // Sección actualmente resaltada en el header (scrollspy).
  const [active, setActive] = useState("");
  // Tras un clic, ignoramos el scrollspy un instante para que no parpadee
  // mientras el desplazamiento suave atraviesa secciones intermedias.
  const lockUntil = useRef(0);

  // Cerrar el menú con la tecla Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Scrollspy: resalta el enlace de la sección que está bajo el header.
  useEffect(() => {
    const ids = LINKS.map((l) => l.href.slice(1));
    let raf = 0;
    const compute = () => {
      raf = 0;
      if (performance.now() < lockUntil.current) return;
      const lineY = 96; // línea de referencia justo bajo el header fijo (72px)
      let current = "";
      let best = -Infinity;
      for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) continue;
        // Sección "activa" = la cuya parte superior ya cruzó la línea y está
        // más cerca de ella (maneja correctamente secciones anidadas).
        const top = el.getBoundingClientRect().top - lineY;
        if (top <= 0 && top > best) {
          best = top;
          current = "#" + id;
        }
      }
      setActive((prev) => (prev === current ? prev : current));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(compute);
    };
    compute();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const close = () => setOpen(false);
  // Marca el enlace al instante al hacer clic y bloquea el scrollspy un momento.
  const pick = (href: string) => {
    setActive(href);
    lockUntil.current = performance.now() + 700;
  };

  return (
    <header className="lp-header">
      <div className="lp__container lp-header__inner">
        <a
          href="#top"
          className="lp-brand"
          aria-label="Mercado Milagros, inicio"
          onClick={() => {
            setActive("");
            close();
          }}
        >
          <span className="lp-brand__mark">M</span>
          <span>
            <span className="lp-brand__name">Mercado Milagros</span>
            <span className="lp-brand__sub">Madre de Dios · Perú</span>
          </span>
        </a>

        <nav className="lp-nav">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className={active === l.href ? "is-active" : undefined}
              aria-current={active === l.href ? "true" : undefined}
              onClick={() => pick(l.href)}
            >
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
          <a
            key={l.href}
            href={l.href}
            className={active === l.href ? "is-active" : undefined}
            aria-current={active === l.href ? "true" : undefined}
            onClick={() => {
              pick(l.href);
              close();
            }}
          >
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
