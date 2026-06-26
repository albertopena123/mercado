import "./landing.css";
import type { Metadata } from "next";
import { LandingHeader } from "./LandingHeader";
import { FloatingActions } from "./FloatingActions";
import { AnunciosSection } from "./AnunciosSection";
import {
  ADDRESS,
  directionsUrl,
  mapsPlaceUrl,
  mapEmbedUrl,
  whatsappUrl,
  MAP_LAT,
  MAP_LNG,
} from "./contact";

export const metadata: Metadata = {
  title:
    "Feria Mayorista Internacional Milagros — Mercado de Puerto Maldonado, Madre de Dios",
  description:
    "La Feria Mayorista Internacional Milagros es el mercado mayorista y minorista más grande de Puerto Maldonado, Madre de Dios: productos frescos todos los días, más de 120 comerciantes formales y precios de feria. Abierto todos los días de 6 a. m. a 6 p. m.",
  keywords: [
    "Feria Mayorista Internacional Milagros",
    "mercado Milagros Puerto Maldonado",
    "feria Milagros Madre de Dios",
    "feria mayorista Puerto Maldonado",
    "mercado Puerto Maldonado",
    "Puerto Maldonado mercado",
    "mercado mayorista Madre de Dios",
    "mercado Madre de Dios",
    "feria mayorista internacional",
    "mercado central Puerto Maldonado",
    "comerciantes Puerto Maldonado",
    "productos frescos Puerto Maldonado",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Feria Mayorista Internacional Milagros",
    title:
      "Feria Mayorista Internacional Milagros — Puerto Maldonado, Madre de Dios",
    description:
      "El mercado mayorista y minorista más grande de Puerto Maldonado, Madre de Dios. Productos frescos, +120 comerciantes formales y precios de feria, todos los días de 6 a. m. a 6 p. m.",
    locale: "es_PE",
  },
  twitter: {
    card: "summary_large_image",
    title: "Feria Mayorista Internacional Milagros — Puerto Maldonado",
    description:
      "El mercado mayorista y minorista más grande de Puerto Maldonado, Madre de Dios.",
  },
};

/* Datos estructurados (JSON-LD) para Google: ficha de negocio local + sitio +
   preguntas frecuentes. Ayudan a aparecer en búsquedas locales y a obtener
   resultados enriquecidos (FAQ) en Google. */
const SITE_URL = "https://granferiamayorista.com";

/* ---------- Iconos en línea (trazo) ------------------------------------- */
const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function IconLeaf() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" {...stroke}>
      <path d="M5 19c0-7 5-12 14-13 0 9-5 14-12 14a6 6 0 0 1-2-1Z" />
      <path d="M9 15c2.5-2.5 5-4 9-5" />
    </svg>
  );
}
function IconShieldCheck() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" {...stroke}>
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3Z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}
function IconChart() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" {...stroke}>
      <path d="M4 4v16h16" />
      <path d="M8 14l3-4 3 3 4-6" />
    </svg>
  );
}
function IconCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" {...stroke} strokeWidth={2.4}>
      <path d="M5 12l4 4 10-11" />
    </svg>
  );
}
function IconApple() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" {...stroke}>
      <path d="M12 8c-2-2-6-1.5-6 3 0 4 3 8 6 8s6-4 6-8c0-4.5-4-5-6-3Z" />
      <path d="M12 8c0-2 .5-3.5 2.5-4.5" />
    </svg>
  );
}
function IconFish() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" {...stroke}>
      <path d="M3 12c3-5 9-6 14-3 2 1.2 3 2.5 4 3-1 .5-2 1.8-4 3-5 3-11 2-14-3Z" />
      <path d="M17 9l4-2v10l-4-2" />
      <circle cx="8" cy="11" r="0.6" fill="currentColor" />
    </svg>
  );
}
function IconBox() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" {...stroke}>
      <path d="M3.5 7.5 12 4l8.5 3.5L12 11 3.5 7.5Z" />
      <path d="M3.5 7.5V16L12 20l8.5-4V7.5" />
      <path d="M12 11v9" />
    </svg>
  );
}
function IconBowl() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" {...stroke}>
      <path d="M3 11h18a9 9 0 0 1-18 0Z" />
      <path d="M9 7c0-1.5 1-2 1-3M13 7c0-1.5 1-2 1-3" />
      <path d="M2 20h20" />
    </svg>
  );
}
function IconShirt() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" {...stroke}>
      <path d="M8 4 4 7l2 3 2-1v9h8v-9l2 1 2-3-4-3-2 2h-4L8 4Z" />
    </svg>
  );
}
function IconFlower() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" {...stroke}>
      <circle cx="12" cy="9" r="2.2" />
      <path d="M12 6.8c0-2.4 3-2.6 3 .2M12 6.8c0-2.4-3-2.6-3 .2M14 9.8c2.2-1 3.6 1.6 1 2.7M10 9.8c-2.2-1-3.6 1.6-1 2.7M12 11.2c-1.4 2 1 3.6 2.2 1M12 11.2c1.4 2-1 3.6-2.2 1" />
      <path d="M12 13v8M12 18c-2 0-3-1-4-2M12 16c1.6 0 2.6-.8 3.4-1.8" />
    </svg>
  );
}
function IconPin() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" {...stroke}>
      <path d="M12 21c4.6-4.3 7-7.8 7-11a7 7 0 1 0-14 0c0 3.2 2.4 6.7 7 11Z" />
      <circle cx="12" cy="10" r="2.6" />
    </svg>
  );
}
function IconClock() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" {...stroke}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3.2 2" />
    </svg>
  );
}
function IconChat() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" {...stroke}>
      <path d="M21 11.5a8 8 0 0 1-11.6 7.1L4 20l1.4-5.2A8 8 0 1 1 21 11.5Z" />
    </svg>
  );
}
function IconNav() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" {...stroke} strokeWidth={2}>
      <path d="M4 11.5 20.5 4 13 20.5l-2.2-6.4-6.3-2.6Z" />
    </svg>
  );
}
function IconArrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" {...stroke} strokeWidth={2.2}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

/* ---------- Datos ------------------------------------------------------- */
const CATS = [
  { name: "Frutas y verduras", sub: "Frescas de la región", icon: <IconApple />, bg: "var(--green-50)", fg: "var(--green)" },
  { name: "Carnes y pescados", sub: "Del día, garantizados", icon: <IconFish />, bg: "#fdeaea", fg: "#d64545" },
  { name: "Abarrotes", sub: "Todo para tu despensa", icon: <IconBox />, bg: "var(--amber-50)", fg: "var(--amber-600)" },
  { name: "Comidas preparadas", sub: "Sabor de Madre de Dios", icon: <IconBowl />, bg: "#fff0e6", fg: "#e0660f" },
  { name: "Ropa y calzado", sub: "Para toda la familia", icon: <IconShirt />, bg: "var(--pry-50)", fg: "var(--pry-700)" },
  { name: "Plantas y flores", sub: "Vivero y jardinería", icon: <IconFlower />, bg: "#eafaf0", fg: "#15915c" },
];

const STEPS = [
  { t: "Solicita tu puesto", d: "Acércate a la administración del mercado con tu DNI y completa la ficha de solicitud de comerciante." },
  { t: "Formaliza tu actividad", d: "Te orientamos para registrar tu negocio y cumplir con los requisitos sanitarios y municipales." },
  { t: "Empieza a vender", d: "Recibe tu puesto asignado, tu credencial digital y forma parte de la comunidad de la Feria Mayorista Internacional Milagros." },
];

const QUOTES = [
  { txt: "Tener mi puesto registrado en el sistema me dio tranquilidad. Todo es más ordenado y transparente.", name: "Rosa Quispe", role: "Comerciante de abarrotes", ava: "#6d3fe0" },
  { txt: "Vengo cada mañana por las verduras frescas. Es el mercado más completo de Puerto Maldonado.", name: "Luis Ramírez", role: "Cliente frecuente", ava: "#1aa66b" },
  { txt: "La administración resuelve rápido y los pagos quedan claros. Se nota la mejora del último año.", name: "Carmen Flores", role: "Comerciante de comidas", ava: "#e0900f" },
];

const FAQ = [
  { q: "¿Cuál es el horario de atención?", a: "La Feria Mayorista Internacional Milagros atiende todos los días de 6:00 a. m. a 6:00 p. m., incluyendo feriados. Algunos puestos de comida extienden su horario." },
  { q: "¿Dónde está ubicado el mercado?", a: "Nos encontramos en el corazón de Puerto Maldonado, Madre de Dios. Cuenta con accesos para transporte público y zona de carga y descarga." },
  { q: "¿Cómo puedo obtener un puesto?", a: "Acércate a la oficina de administración con tu DNI. Revisamos la disponibilidad de puestos y te guiamos en el proceso de formalización." },
  { q: "¿Qué es la consola de administración?", a: "Es el sistema digital con el que gestionamos comerciantes, puestos, permisos y pagos de forma transparente. El acceso es exclusivo para personal autorizado." },
];

export default function LandingPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": ["ShoppingCenter", "GroceryStore"],
        "@id": `${SITE_URL}/#negocio`,
        name: "Feria Mayorista Internacional Milagros",
        alternateName: [
          "Feria Mayorista Internacional Milagros",
          "Mercado Milagros",
          "Mercado Mayorista de Puerto Maldonado",
        ],
        description:
          "Mercado mayorista y minorista más grande de Puerto Maldonado, Milagros, Madre de Dios: frutas, verduras, carnes, abarrotes y comidas, con más de 120 comerciantes formales.",
        url: SITE_URL,
        image: `${SITE_URL}/opengraph-image`,
        priceRange: "$",
        currenciesAccepted: "PEN",
        address: {
          "@type": "PostalAddress",
          streetAddress: "Av. Circunvalación con Av. Los Próceres, Milagros",
          addressLocality: "Puerto Maldonado",
          addressRegion: "Madre de Dios",
          addressCountry: "PE",
        },
        geo: {
          "@type": "GeoCoordinates",
          latitude: MAP_LAT,
          longitude: MAP_LNG,
        },
        hasMap: mapsPlaceUrl,
        areaServed: {
          "@type": "AdministrativeArea",
          name: "Madre de Dios, Perú",
        },
        openingHoursSpecification: [
          {
            "@type": "OpeningHoursSpecification",
            dayOfWeek: [
              "Monday",
              "Tuesday",
              "Wednesday",
              "Thursday",
              "Friday",
              "Saturday",
              "Sunday",
            ],
            opens: "06:00",
            closes: "18:00",
          },
        ],
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: SITE_URL,
        name: "Feria Mayorista Internacional Milagros",
        inLanguage: "es-PE",
        publisher: { "@id": `${SITE_URL}/#negocio` },
      },
      {
        "@type": "FAQPage",
        "@id": `${SITE_URL}/#faq`,
        mainEntity: FAQ.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };

  return (
    <div className="lp">
      {/* Datos estructurados para buscadores (negocio local + FAQ) */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* ===================== HEADER ===================== */}
      <LandingHeader />

      <main id="top">
        {/* ===================== HERO ===================== */}
        <section className="lp-hero">
          <div className="lp__container lp-hero__grid">
            <div className="lp-hero__copy">
              <span className="lp-eyebrow">
                <span className="lp-eyebrow__dot" /> El mercado mayorista de Madre de Dios
              </span>
              <h1>
                Feria Mayorista Internacional <span className="lp-hl">Milagros</span>
              </h1>
              <p className="lp-hero__lead">
                El gran mercado mayorista y minorista de Puerto Maldonado, Milagros,
                Madre de Dios: productos frescos todos los días, comerciantes
                formales y precios de feria.
              </p>
              <div className="lp-hero__cta">
                <a className="lp-btn lp-btn--yellow lp-btn--lg" href="#mercado">
                  Conoce el mercado
                </a>
                <a className="lp-btn lp-btn--glass lp-btn--lg" href="/login">
                  Acceder al sistema
                </a>
              </div>
              <div className="lp-hero__chips">
                <div className="lp-chip">
                  <span className="lp-chip__ic"><IconShieldCheck /></span>
                  <div>
                    <b>Comercio seguro</b>
                    <span>Confianza y seguridad</span>
                  </div>
                </div>
                <div className="lp-chip">
                  <span className="lp-chip__ic"><IconLeaf /></span>
                  <div>
                    <b>Productos frescos</b>
                    <span>Todos los días</span>
                  </div>
                </div>
                <div className="lp-chip">
                  <span className="lp-chip__ic"><IconChart /></span>
                  <div>
                    <b>Precios justos</b>
                    <span>Ahorra más</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="lp-hero__visual">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="lp-hero__photo"
                src="/hero-mercado.jpg"
                alt="Puestos de la Feria Mayorista Internacional Milagros con frutas, verduras y productos frescos"
                width={900}
                height={262}
              />
              <div className="lp-float lp-float--a">
                <div className="lp-float__avatars">
                  <span style={{ background: "#0b63d6" }}>R</span>
                  <span style={{ background: "#1aa66b" }}>L</span>
                  <span style={{ background: "#f5a623" }}>C</span>
                </div>
                <div>
                  <div className="lp-float__big">+400 comerciantes</div>
                  <div className="lp-float__small">formando comunidad</div>
                </div>
              </div>
              <div className="lp-float lp-float--b">
                <div className="lp-float__icon lp-float__icon--green">
                  <IconLeaf />
                </div>
                <div>
                  <div className="lp-float__big">Abierto hoy</div>
                  <div className="lp-float__small">6 a. m. – 6 p. m.</div>
                </div>
              </div>
            </div>
          </div>

          {/* Curva blanca que funde el hero con la sección siguiente */}
          <div className="lp-hero__wave" aria-hidden="true">
            <svg viewBox="0 0 1440 70" preserveAspectRatio="none">
              <path d="M0 40 C 360 78 1080 6 1440 44 L1440 70 L0 70 Z" fill="#fff" />
            </svg>
          </div>
        </section>

        {/* ===================== ¿QUÉ QUIERES HACER HOY? ===================== */}
        <section className="lp-quick">
          <div className="lp__container">
            <div className="lp-quick__head">
              <h2>¿Qué quieres hacer hoy?</h2>
              <p>Encuentra rápido lo que buscas en la Feria Mayorista Internacional Milagros.</p>
            </div>
            <div className="lp-quick__grid">
              {[
                { ic: <IconLeaf />, t: "Conoce el mercado", d: "Productos frescos y comerciantes formales todos los días.", href: "#mercado" },
                { ic: <IconBox />, t: "Explora categorías", d: "Más de 120 puestos organizados por rubro.", href: "#categorias" },
                { ic: <IconPin />, t: "Cómo llegar", d: "Ubicación, horarios y ruta en un toque.", href: "#ubicacion" },
                { ic: <IconShieldCheck />, t: "Acceder al sistema", d: "Consola de administración para personal autorizado.", href: "/login" },
              ].map((q) => (
                <a className="lp-quick__card" key={q.t} href={q.href}>
                  <span className="lp-quick__ic">{q.ic}</span>
                  <span className="lp-quick__t">{q.t}</span>
                  <span className="lp-quick__d">{q.d}</span>
                  <span className="lp-quick__go">
                    Ver <IconArrow />
                  </span>
                </a>
              ))}
            </div>
          </div>
        </section>

        {/* ===================== MÉTRICAS ===================== */}
        <section className="lp-stats">
          <div className="lp__container">
            <div className="lp-stats__grid">
              {[
                ["+120", "Puestos comerciales"],
                ["100%", "Comerciantes registrados"],
                ["6am–6pm", "Todos los días"],
                ["+30", "Años de historia"],
              ].map(([v, l]) => (
                <div className="lp-stat" key={l}>
                  <div className="lp-stat__v">{v}</div>
                  <div className="lp-stat__l">{l}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ===================== NOVEDADES (anuncios públicos) ===================== */}
        <AnunciosSection />

        {/* ===================== FEATURES ===================== */}
        <section className="lp-section" id="mercado">
          <div className="lp__container">
            <div className="lp-section__head lp-reveal">
              <span className="lp-eyebrow">Por qué la Feria Mayorista Internacional Milagros</span>
              <h2>Un mercado moderno, humano y de confianza</h2>
              <p>
                Combinamos la tradición del mercado de barrio con herramientas
                digitales que dan orden, seguridad y transparencia a todos.
              </p>
            </div>

            {/* Feature 1 */}
            <div className="lp-feature lp-reveal">
              <div className="lp-feature__body">
                <div className="lp-feature__icon lp-feature__icon--green"><IconLeaf /></div>
                <h3>Productos frescos todos los días</h3>
                <p className="lp-feature__text">
                  Frutas, verduras, carnes y pescados que llegan directo de los
                  productores de la región. Calidad y precios justos en cada puesto.
                </p>
                <ul className="lp-list">
                  <li><span className="lp-list__check"><IconCheck /></span> Abastecimiento diario desde la chacra</li>
                  <li><span className="lp-list__check"><IconCheck /></span> Variedad de productos amazónicos</li>
                  <li><span className="lp-list__check"><IconCheck /></span> Control de higiene y salubridad</li>
                </ul>
              </div>
              <div className="lp-feature__media">
                <div className="lp-card lp-card--green">
                  <div className="lp-mini-cats">
                    {CATS.slice(0, 4).map((c) => (
                      <div className="lp-cat" key={c.name} style={{ padding: 16 }}>
                        <span className="lp-cat__icon" style={{ background: c.bg, color: c.fg, width: 44, height: 44 }}>{c.icon}</span>
                        <span className="lp-cat__name" style={{ fontSize: 15 }}>{c.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="lp-feature lp-feature--rev lp-reveal" id="comerciantes">
              <div className="lp-feature__body">
                <div className="lp-feature__icon lp-feature__icon--pry"><IconShieldCheck /></div>
                <h3>Comerciantes formales y organizados</h3>
                <p className="lp-feature__text">
                  Cada puesto pertenece a un comerciante registrado, con su
                  credencial y permisos al día. Más seguridad para ti y tu familia.
                </p>
                <ul className="lp-list">
                  <li><span className="lp-list__check"><IconCheck /></span> Padrón único de comerciantes</li>
                  <li><span className="lp-list__check"><IconCheck /></span> Credencial e identificación por puesto</li>
                  <li><span className="lp-list__check"><IconCheck /></span> Permisos y pagos siempre al día</li>
                </ul>
              </div>
              <div className="lp-feature__media">
                <div className="lp-card lp-card--pry">
                  <div className="lp-mock">
                    <div className="lp-mock__bar">
                      <span className="lp-mock__dot" style={{ background: "#ff5f57" }} />
                      <span className="lp-mock__dot" style={{ background: "#febc2e" }} />
                      <span className="lp-mock__dot" style={{ background: "#28c840" }} />
                    </div>
                    {[
                      ["#8b6bff", "Activo"],
                      ["#1aa66b", "Activo"],
                      ["#f5a623", "Al día"],
                      ["#ff7a59", "Activo"],
                    ].map(([c, s], i) => (
                      <div className="lp-mock__row" key={i}>
                        <span className="lp-mock__ava" style={{ background: c }} />
                        <span className="lp-mock__line" style={{ width: 120 + (i % 2) * 40 }} />
                        <span className="lp-mock__pill">{s}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Feature 3 */}
            <div className="lp-feature lp-reveal">
              <div className="lp-feature__body">
                <div className="lp-feature__icon lp-feature__icon--amber"><IconChart /></div>
                <h3>Gestión moderna y transparente</h3>
                <p className="lp-feature__text">
                  La administración del mercado usa una consola digital para
                  gestionar puestos, permisos y pagos. Información clara, decisiones justas.
                </p>
                <ul className="lp-list">
                  <li><span className="lp-list__check"><IconCheck /></span> Registro centralizado de puestos</li>
                  <li><span className="lp-list__check"><IconCheck /></span> Reportes y trazabilidad de pagos</li>
                  <li><span className="lp-list__check"><IconCheck /></span> Acceso seguro para personal autorizado</li>
                </ul>
                <div style={{ marginTop: 26 }}>
                  <a className="lp-btn lp-btn--primary" href="/login">Acceder a la consola</a>
                </div>
              </div>
              <div className="lp-feature__media">
                <div className="lp-card lp-card--amber">
                  <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                    <div style={{ flex: 1, background: "#fff", border: "1px solid var(--line)", borderRadius: 14, padding: 16 }}>
                      <div style={{ fontFamily: "Google Sans", fontWeight: 600, fontSize: 26 }}>120</div>
                      <div style={{ fontSize: 13, color: "var(--muted)" }}>Puestos</div>
                    </div>
                    <div style={{ flex: 1, background: "#fff", border: "1px solid var(--line)", borderRadius: 14, padding: 16 }}>
                      <div style={{ fontFamily: "Google Sans", fontWeight: 600, fontSize: 26, color: "var(--green)" }}>98%</div>
                      <div style={{ fontSize: 13, color: "var(--muted)" }}>Al día</div>
                    </div>
                  </div>
                  <div className="lp-mock" style={{ padding: 18 }}>
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 96 }}>
                      {[40, 64, 52, 80, 70, 92, 60].map((h, i) => (
                        <div key={i} style={{ flex: 1, height: `${h}%`, borderRadius: 6, background: i === 5 ? "var(--pry)" : "var(--pry-100)" }} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===================== CATEGORÍAS ===================== */}
        <section className="lp-section lp-section--soft" id="categorias">
          <div className="lp__container">
            <div className="lp-section__head lp-reveal">
              <span className="lp-eyebrow">Encuentra de todo</span>
              <h2>Categorías del mercado</h2>
              <p>Más de 120 puestos organizados por rubro para que encuentres lo que buscas en minutos.</p>
            </div>
            <div className="lp-cats lp-reveal">
              {CATS.map((c) => (
                <div className="lp-cat" key={c.name}>
                  <span className="lp-cat__icon" style={{ background: c.bg, color: c.fg }}>{c.icon}</span>
                  <div>
                    <div className="lp-cat__name">{c.name}</div>
                    <div className="lp-cat__sub">{c.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ===================== PASOS ===================== */}
        <section className="lp-section">
          <div className="lp__container">
            <div className="lp-section__head lp-reveal">
              <span className="lp-eyebrow">¿Eres comerciante?</span>
              <h2>Únete a la Feria Mayorista Internacional Milagros en 3 pasos</h2>
              <p>Formaliza tu negocio y accede a un espacio seguro, ordenado y con miles de clientes.</p>
            </div>
            <div className="lp-steps lp-reveal">
              {STEPS.map((s, i) => (
                <div className="lp-step" key={s.t}>
                  <div className="lp-step__num">{i + 1}</div>
                  <h3>{s.t}</h3>
                  <p>{s.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ===================== TESTIMONIOS ===================== */}
        <section className="lp-section lp-section--soft">
          <div className="lp__container">
            <div className="lp-section__head lp-reveal">
              <span className="lp-eyebrow">Lo que dicen</span>
              <h2>Comerciantes y vecinos confían en nosotros</h2>
            </div>
            <div className="lp-quotes lp-reveal">
              {QUOTES.map((q) => (
                <figure className="lp-quote" key={q.name}>
                  <div className="lp-quote__stars">★★★★★</div>
                  <blockquote className="lp-quote__text">“{q.txt}”</blockquote>
                  <figcaption className="lp-quote__who">
                    <span className="lp-quote__ava" style={{ background: q.ava }}>{q.name[0]}</span>
                    <span>
                      <span className="lp-quote__name" style={{ display: "block" }}>{q.name}</span>
                      <span className="lp-quote__role">{q.role}</span>
                    </span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        {/* ===================== UBICACIÓN / CÓMO LLEGAR ===================== */}
        <section className="lp-section" id="ubicacion">
          <div className="lp__container">
            <div className="lp-section__head lp-reveal">
              <span className="lp-eyebrow">
                <span className="lp-eyebrow__dot" /> Cómo llegar
              </span>
              <h2>Te esperamos en el corazón de Puerto Maldonado</h2>
              <p>
                Estamos en una zona céntrica y de fácil acceso. Traza tu ruta en
                un solo toque y ven a comprar fresco.
              </p>
            </div>

            <div className="lp-loc lp-reveal">
              <div className="lp-loc__info">
                <ul className="lp-loc__rows">
                  <li>
                    <span className="lp-loc__ic lp-loc__ic--pry"><IconPin /></span>
                    <div>
                      <div className="lp-loc__t">Ubicación</div>
                      <div className="lp-loc__d">{ADDRESS}</div>
                    </div>
                  </li>
                  <li>
                    <span className="lp-loc__ic lp-loc__ic--amber"><IconClock /></span>
                    <div>
                      <div className="lp-loc__t">Horario de atención</div>
                      <div className="lp-loc__d">Todos los días · 6:00 a. m. – 6:00 p. m.</div>
                    </div>
                  </li>
                  <li>
                    <span className="lp-loc__ic lp-loc__ic--green"><IconChat /></span>
                    <div>
                      <div className="lp-loc__t">¿Tienes dudas?</div>
                      <div className="lp-loc__d">Escríbenos por WhatsApp para informes y consultas.</div>
                    </div>
                  </li>
                </ul>
                <div className="lp-loc__cta">
                  <a className="lp-btn lp-btn--primary lp-btn--lg" href={directionsUrl} target="_blank" rel="noopener noreferrer">
                    <IconNav /> Cómo llegar
                  </a>
                  <a className="lp-btn lp-btn--ghost lp-btn--lg" href={mapsPlaceUrl} target="_blank" rel="noopener noreferrer">
                    Ver en Google Maps
                  </a>
                </div>
              </div>

              <div className="lp-loc__map">
                <iframe
                  src={mapEmbedUrl}
                  title="Mapa de ubicación de la Feria Mayorista Internacional Milagros en Puerto Maldonado"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  allowFullScreen
                />
                <a className="lp-loc__chip" href={directionsUrl} target="_blank" rel="noopener noreferrer">
                  <IconNav /> Trazar ruta
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* ===================== FAQ ===================== */}
        <section className="lp-section lp-section--soft" id="preguntas">
          <div className="lp__container">
            <div className="lp-section__head lp-reveal">
              <span className="lp-eyebrow">Resuelve tus dudas</span>
              <h2>Preguntas frecuentes</h2>
              <p>Todo lo que necesitas saber antes de visitar la Feria Mayorista Internacional Milagros en Puerto Maldonado.</p>
            </div>
            <div className="lp-faq lp-reveal">
              {FAQ.map((f) => (
                <details key={f.q}>
                  <summary>{f.q}</summary>
                  <div className="lp-faq__a">{f.a}</div>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ===================== CTA ===================== */}
        <section className="lp-cta">
          <div className="lp__container">
            <div className="lp-cta__box lp-reveal">
              <h2>Vive la experiencia de la Feria Mayorista Internacional Milagros</h2>
              <p>
                Ven a comprar fresco y apoyar a los comerciantes de tu región.
                ¿Eres personal autorizado? Ingresa a la consola de administración.
              </p>
              <div className="lp-cta__actions">
                <a className="lp-btn lp-btn--white lp-btn--lg" href="#mercado">Conoce el mercado</a>
                <a className="lp-btn lp-btn--amber lp-btn--lg" href="/login">Acceder al sistema</a>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ===================== FOOTER ===================== */}
      <footer className="lp-footer">
        <div className="lp__container">
          <div className="lp-footer__grid">
            <div className="lp-footer__brand">
              <div className="lp-brand">
                <span className="lp-brand__mark">FM</span>
                <span>
                  <span className="lp-brand__name">Feria Mayorista Internacional Milagros</span>
                  <span className="lp-brand__sub">Puerto Maldonado · Madre de Dios · Perú</span>
                </span>
              </div>
              <p className="lp-footer__about">
                El corazón comercial de Milagros, Puerto Maldonado. Productos frescos,
                comerciantes formales y una gestión transparente al servicio de la comunidad.
              </p>
              <div className="lp-footer__seals">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logos_sistema/logo_madrededios.png" alt="Gobierno Regional de Madre de Dios" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logos_sistema/logo_peru.png" alt="Gobierno del Perú" />
              </div>
            </div>

            <div className="lp-footer__col">
              <h4>El mercado</h4>
              <ul>
                <li><a href="#mercado">Sobre nosotros</a></li>
                <li><a href="#categorias">Categorías</a></li>
                <li><a href="#ubicacion">Ubicación y horarios</a></li>
                <li><a href="#preguntas">Preguntas frecuentes</a></li>
              </ul>
            </div>
            <div className="lp-footer__col">
              <h4>Comerciantes</h4>
              <ul>
                <li><a href="#comerciantes">Cómo unirte</a></li>
                <li><a href="#comerciantes">Formalización</a></li>
                <li><a href="/login">Acceder al sistema</a></li>
              </ul>
            </div>
            <div className="lp-footer__col">
              <h4>Contacto</h4>
              <ul>
                <li><a href={whatsappUrl} target="_blank" rel="noopener noreferrer">WhatsApp</a></li>
                <li><a href={directionsUrl} target="_blank" rel="noopener noreferrer">Cómo llegar</a></li>
                <li><a href="#ubicacion">Puerto Maldonado</a></li>
                <li><a href="#ubicacion">Lun a Dom · 6am–6pm</a></li>
                <li><a href="/login">Administración</a></li>
              </ul>
            </div>
          </div>

          <div className="lp-footer__bottom">
            <span>© 2026 Feria Mayorista Internacional Milagros · Puerto Maldonado, Madre de Dios, Perú. Todos los derechos reservados.</span>
            <span>Hecho con orgullo para nuestra comunidad.</span>
          </div>
        </div>
      </footer>

      {/* ===================== ACCIONES FLOTANTES (WhatsApp / ruta) ======= */}
      <FloatingActions />
    </div>
  );
}
