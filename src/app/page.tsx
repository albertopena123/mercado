import "./landing.css";
import { LandingHeader } from "./LandingHeader";
import { HeroCarousel } from "./HeroCarousel";
import { FloatingActions } from "./FloatingActions";
import { AnunciosSection } from "./AnunciosSection";
import { ADDRESS, directionsUrl, mapsPlaceUrl, mapEmbedUrl, whatsappUrl } from "./contact";

export const metadata = {
  title: "Mercado Milagros — El corazón comercial de Madre de Dios",
  description:
    "Conoce el Mercado Milagros: comerciantes formales, productos frescos todos los días y una gestión moderna y transparente al servicio de Madre de Dios.",
};

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

/* ---------- Ilustración del mercado (hero) ------------------------------ */
function MarketScene() {
  const stall = (x: number, fill: string) => (
    <g transform={`translate(${x} 0)`}>
      {/* postes */}
      <rect x="6" y="150" width="6" height="150" rx="3" fill="#cdb48f" />
      <rect x="138" y="150" width="6" height="150" rx="3" fill="#cdb48f" />
      {/* toldo */}
      <path
        d="M-6 120 H156 V150 q-10 14 -20 0 q-10 14 -20 0 q-10 14 -20 0 q-10 14 -20 0 q-10 14 -20 0 q-10 14 -20 0 q-10 14 -20 0 q-10 14 -20 0 Z"
        fill={fill}
      />
      <path d="M-6 120 H156 V133 H-6 Z" fill="rgba(255,255,255,0.28)" />
      {/* mostrador */}
      <rect x="2" y="248" width="146" height="56" rx="8" fill="#e7d4b6" />
      <rect x="2" y="248" width="146" height="14" rx="7" fill="#d8bf99" />
      {/* cajones con productos */}
      <rect x="16" y="262" width="50" height="30" rx="6" fill="#b98a52" />
      <rect x="84" y="262" width="50" height="30" rx="6" fill="#b98a52" />
    </g>
  );

  const produce = (cx: number, cy: number, colors: string[]) => (
    <g>
      {colors.map((c, i) => (
        <circle key={i} cx={cx + (i % 3) * 13} cy={cy + (i > 2 ? 11 : 0)} r="7" fill={c} />
      ))}
    </g>
  );

  return (
    <svg className="lp-scene" viewBox="0 0 560 460" role="img" aria-label="Ilustración del Mercado Milagros: puestos con toldos, luces y productos frescos">
      <defs>
        <pattern id="lp-st-pry" width="34" height="34" patternUnits="userSpaceOnUse">
          <rect width="34" height="34" fill="#4d9bff" />
          <rect width="17" height="34" fill="#0b63d6" />
        </pattern>
        <pattern id="lp-st-amb" width="34" height="34" patternUnits="userSpaceOnUse">
          <rect width="34" height="34" fill="#ffd27a" />
          <rect width="17" height="34" fill="#f5a623" />
        </pattern>
        <pattern id="lp-st-grn" width="34" height="34" patternUnits="userSpaceOnUse">
          <rect width="34" height="34" fill="#5fd3a0" />
          <rect width="17" height="34" fill="#1aa66b" />
        </pattern>
      </defs>

      <rect width="560" height="460" rx="24" fill="#eaf2fe" />

      {/* sol */}
      <circle cx="486" cy="74" r="40" fill="#ffd27a" opacity="0.55" />
      <circle cx="486" cy="74" r="26" fill="#ffbf45" />

      {/* luces colgantes */}
      <path d="M10 60 Q280 110 550 64" fill="none" stroke="#c9bdf2" strokeWidth="2" />
      {Array.from({ length: 11 }).map((_, i) => {
        const x = 30 + i * 50;
        const y = 64 + Math.sin(i) * 8 + 18;
        const colors = ["#ff6b6b", "#ffd166", "#6dd3a0", "#7a8cff", "#ff9f43"];
        return (
          <g key={i} className="lp-scene__bulb">
            <line x1={x} y1={y - 14} x2={x} y2={y - 6} stroke="#c9bdf2" strokeWidth="1.5" />
            <circle cx={x} cy={y} r="5" fill={colors[i % colors.length]} />
          </g>
        );
      })}

      {/* piso */}
      <rect x="0" y="360" width="560" height="100" rx="0" fill="#e1ecfb" />
      <rect x="0" y="360" width="560" height="100" fill="#000" opacity="0.02" />

      {/* puestos */}
      {stall(40, "url(#lp-st-pry)")}
      {stall(210, "url(#lp-st-amb)")}
      {stall(380, "url(#lp-st-grn)")}

      {/* productos sobre los mostradores */}
      {produce(58, 268, ["#ff7a59", "#ff9f43", "#ffd166", "#e63946", "#ff7a59"])}
      {produce(126, 268, ["#6dd3a0", "#2faa6a", "#9ae6b4", "#2faa6a", "#6dd3a0"])}
      {produce(228, 268, ["#e63946", "#ff5d73", "#ff8fa3", "#e63946", "#ff5d73"])}
      {produce(296, 268, ["#7a8cff", "#b794ff", "#9b7bff", "#7a8cff", "#b794ff"])}
      {produce(398, 268, ["#ffd166", "#ffe08a", "#ffbf45", "#ffd166", "#ffe08a"])}
      {produce(466, 268, ["#ff9f43", "#ff7a59", "#ffb673", "#ff9f43", "#ff7a59"])}
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
  { t: "Empieza a vender", d: "Recibe tu puesto asignado, tu credencial digital y forma parte de la comunidad del Mercado Milagros." },
];

const QUOTES = [
  { txt: "Tener mi puesto registrado en el sistema me dio tranquilidad. Todo es más ordenado y transparente.", name: "Rosa Quispe", role: "Comerciante de abarrotes", ava: "#6d3fe0" },
  { txt: "Vengo cada mañana por las verduras frescas. Es el mercado más completo de Puerto Maldonado.", name: "Luis Ramírez", role: "Cliente frecuente", ava: "#1aa66b" },
  { txt: "La administración resuelve rápido y los pagos quedan claros. Se nota la mejora del último año.", name: "Carmen Flores", role: "Comerciante de comidas", ava: "#e0900f" },
];

const FAQ = [
  { q: "¿Cuál es el horario de atención?", a: "El Mercado Milagros atiende todos los días de 6:00 a. m. a 6:00 p. m., incluyendo feriados. Algunos puestos de comida extienden su horario." },
  { q: "¿Dónde está ubicado el mercado?", a: "Nos encontramos en el corazón de Puerto Maldonado, Madre de Dios. Cuenta con accesos para transporte público y zona de carga y descarga." },
  { q: "¿Cómo puedo obtener un puesto?", a: "Acércate a la oficina de administración con tu DNI. Revisamos la disponibilidad de puestos y te guiamos en el proceso de formalización." },
  { q: "¿Qué es la consola de administración?", a: "Es el sistema digital con el que gestionamos comerciantes, puestos, permisos y pagos de forma transparente. El acceso es exclusivo para personal autorizado." },
];

export default function LandingPage() {
  return (
    <div className="lp">
      {/* ===================== HEADER ===================== */}
      <LandingHeader />

      <main id="top">
        {/* ===================== HERO ===================== */}
        <section className="lp-hero">
          <div className="lp__container lp-hero__grid">
            <HeroCarousel />

            <div className="lp-hero__visual">
              <MarketScene />
              <div className="lp-float lp-float--a">
                <div className="lp-float__avatars">
                  <span style={{ background: "#0b63d6" }}>R</span>
                  <span style={{ background: "#1aa66b" }}>L</span>
                  <span style={{ background: "#f5a623" }}>C</span>
                </div>
                <div>
                  <div className="lp-float__big">+120 comerciantes</div>
                  <div className="lp-float__small">formando comunidad</div>
                </div>
              </div>
              <div className="lp-float lp-float--b">
                <div className="lp-float__icon lp-float__icon--green">
                  <IconLeaf />
                </div>
                <div>
                  <div className="lp-float__big">Productos frescos</div>
                  <div className="lp-float__small">Abierto hoy · 6am–6pm</div>
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
              <p>Encuentra rápido lo que buscas en el Mercado Milagros.</p>
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
              <span className="lp-eyebrow">Por qué el Mercado Milagros</span>
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
              <h2>Únete al Mercado Milagros en 3 pasos</h2>
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
                  title="Mapa de ubicación del Mercado Milagros en Puerto Maldonado"
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
              <p>Todo lo que necesitas saber antes de visitar el Mercado Milagros en Puerto Maldonado.</p>
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
              <h2>Vive la experiencia del Mercado Milagros</h2>
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
                <span className="lp-brand__mark">M</span>
                <span>
                  <span className="lp-brand__name">Mercado Milagros</span>
                  <span className="lp-brand__sub">Madre de Dios · Perú</span>
                </span>
              </div>
              <p className="lp-footer__about">
                El corazón comercial de Madre de Dios. Productos frescos,
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
            <span>© 2026 Mercado Milagros · Madre de Dios, Perú. Todos los derechos reservados.</span>
            <span>Hecho con orgullo para nuestra comunidad.</span>
          </div>
        </div>
      </footer>

      {/* ===================== ACCIONES FLOTANTES (WhatsApp / ruta) ======= */}
      <FloatingActions />
    </div>
  );
}
