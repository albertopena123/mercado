"use client";

import { useEffect, useState } from "react";

/* Mensajes rotativos del hero (portada tipo banner). Cada uno destaca una
   faceta del mercado: identidad, comerciantes y atención. */
const SLIDES = [
  {
    eyebrow: "El mercado mayorista N.º 1 de Madre de Dios",
    head: "Feria Mayorista Internacional ",
    hl: "Milagros",
    lead:
      "El gran mercado mayorista y minorista de Puerto Maldonado, Milagros, Madre de Dios: productos frescos todos los días, comerciantes formales y precios de feria.",
    primary: { label: "Conoce el mercado", href: "#mercado" },
    secondary: { label: "Acceder al sistema", href: "/login" },
  },
  {
    eyebrow: "¿Eres comerciante?",
    head: "Formaliza tu puesto y ",
    hl: "vende más",
    lead:
      "Únete a más de 120 comerciantes con credencial digital, permisos al día y miles de clientes cada semana.",
    primary: { label: "Quiero un puesto", href: "#comerciantes" },
    secondary: { label: "Ver categorías", href: "#categorias" },
  },
  {
    eyebrow: "Abierto todos los días",
    head: "Lo más fresco, de ",
    hl: "6 a. m. a 6 p. m.",
    lead:
      "Frutas, verduras, carnes, abarrotes y comida casera en el corazón de Puerto Maldonado.",
    primary: { label: "Cómo llegar", href: "#ubicacion" },
    secondary: { label: "Explorar categorías", href: "#categorias" },
  },
];

const INTERVAL = 6500;

export function HeroCarousel() {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(
      () => setI((p) => (p + 1) % SLIDES.length),
      INTERVAL,
    );
    return () => window.clearInterval(id);
  }, [paused]);

  const s = SLIDES[i];

  return (
    <div
      className="lp-hero__copy"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="lp-hero__slide" key={i}>
        <span className="lp-eyebrow">
          <span className="lp-eyebrow__dot" /> {s.eyebrow}
        </span>
        <h1>
          {s.head}
          <span className="lp-hl">{s.hl}</span>
        </h1>
        <p className="lp-hero__lead">{s.lead}</p>
        <div className="lp-hero__cta">
          <a className="lp-btn lp-btn--yellow lp-btn--lg" href={s.primary.href}>
            {s.primary.label}
          </a>
          <a className="lp-btn lp-btn--glass lp-btn--lg" href={s.secondary.href}>
            {s.secondary.label}
          </a>
        </div>
      </div>

      <div className="lp-dots" role="tablist" aria-label="Mensajes destacados">
        {SLIDES.map((slide, n) => (
          <button
            key={slide.hl}
            type="button"
            role="tab"
            aria-selected={n === i}
            aria-label={`Mensaje ${n + 1}: ${slide.eyebrow}`}
            className={`lp-dot${n === i ? " is-on" : ""}`}
            onClick={() => setI(n)}
          />
        ))}
      </div>
    </div>
  );
}
