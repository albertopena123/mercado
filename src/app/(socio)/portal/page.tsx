import Link from "next/link";
import { type ReactNode } from "react";
import { requireSocio } from "@/lib/portal/socio";
import { getMiResumen } from "@/lib/portal/data";
import { formatSoles } from "@/lib/money";
import { Icon, type IconName } from "@/components/admin/Icon";

export const metadata = { title: "Mi portal · Feria Mayorista Internacional Milagros" };
export const dynamic = "force-dynamic";

const MES_ABBR = [
  "ene.", "feb.", "mar.", "abr.", "may.", "jun.",
  "jul.", "ago.", "set.", "oct.", "nov.", "dic.",
];
// Las fechas de calendario se guardan a medianoche UTC; se leen en UTC para no
// correrse un día (ver convención de fechas del proyecto).
function fechaLarga(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MES_ABBR[d.getUTCMonth()] ?? ""} ${d.getUTCFullYear()}`;
}

export default async function PortalHome() {
  const { socio } = await requireSocio();
  const r = await getMiResumen(socio.id);
  const habil = socio.estado === "activo" && r.deuda === 0;
  const nombreCorto = socio.nombre.split(",").pop()?.trim() || socio.nombre;

  const cards: {
    href: string;
    icon: IconName;
    tone: "blue" | "indigo" | "green" | "amber";
    title: string;
    desc: string;
    foot: ReactNode;
  }[] = [
    {
      href: "/portal/asambleas",
      icon: "calendar",
      tone: "blue",
      title: "Reuniones",
      desc: "Ve las asambleas y marca tu asistencia con el QR.",
      foot: (
        <span className="pt-metric">
          <b className="pt-metric__num">{r.reuniones}</b>
          <span className="pt-metric__cap">
            {r.reuniones === 1 ? "reunión" : "reuniones"}
          </span>
        </span>
      ),
    },
    {
      href: "/portal/deudas",
      icon: "chart",
      tone: "indigo",
      title: "Mis deudas",
      desc: "Consulta tus cuotas y tu estado de cuenta.",
      foot:
        r.deuda > 0 ? (
          <span className="pt-metric">
            <span className="pt-metric__cap">Debes</span>
            <b className="pt-metric__num">{formatSoles(r.deuda)}</b>
          </span>
        ) : (
          <span className="pt-metric">
            <b className="pt-metric__num pt-metric__num--ok">Al día</b>
            <span className="pt-metric__cap">Sin deuda</span>
          </span>
        ),
    },
    {
      href: "/portal/comprobantes",
      icon: "card",
      tone: "green",
      title: "Mis comprobantes",
      desc: "Tus recibos de pago: revísalos, imprímelos o guárdalos.",
      foot: (
        <span className="pt-metric">
          <b className="pt-metric__link">Recibos de pago</b>
        </span>
      ),
    },
    {
      href: "/portal/comunicados",
      icon: "bell",
      tone: "amber",
      title: "Comunicados",
      desc: "Anuncios y comunicados del mercado.",
      foot: (
        <span className="pt-metric">
          <b className="pt-metric__link">
            {r.comunicados} {r.comunicados === 1 ? "publicación" : "publicaciones"}
          </b>
        </span>
      ),
    },
    {
      href: "/portal/perfil",
      icon: "user",
      tone: "blue",
      title: "Mi perfil",
      desc: "Tus datos, tus puestos y tu contraseña.",
      foot: (
        <span className="pt-metric">
          <b className="pt-metric__link">
            {r.puestos} {r.puestos === 1 ? "puesto" : "puestos"}
          </b>
        </span>
      ),
    },
  ];

  return (
    <>
      <div className="pt-headrow">
        <div className="pt-hello">
          <h1>Hola, {nombreCorto}</h1>
          <p>
            Código {socio.codigo} · {socio.tipoDocumento} {socio.numeroDocumento}
          </p>
        </div>
        <Link
          href="/portal/deudas"
          className={`pt-status ${habil ? "" : "pt-status--warn"}`}
        >
          <span className="pt-status__icon">
            <Icon name={habil ? "shield-check" : "info"} size={22} />
          </span>
          <span className="pt-status__txt">
            <strong>
              {habil ? "Tu cuenta está activa y al día" : "Tu cuenta necesita atención"}
            </strong>
            <span>
              {habil
                ? "Revisa tus actividades y pendientes desde aquí."
                : "Tienes pendientes por regularizar."}
            </span>
          </span>
          <Icon name="chevron-right" size={18} className="pt-status__arrow" />
        </Link>
      </div>

      <div className="pt-cards">
        {cards.map((c) => (
          <Link key={c.href} href={c.href} className={`pt-card pt-card--${c.tone}`}>
            <div className="pt-card__head">
              <span className="pt-card__icon">
                <Icon name={c.icon} size={21} />
              </span>
              <div className="pt-card__head-txt">
                <span className="pt-card__title">{c.title}</span>
                <span className="pt-card__desc">{c.desc}</span>
              </div>
            </div>
            <div className="pt-card__foot">
              {c.foot}
              <Icon name="chevron-right" size={18} className="pt-card__arrow" />
            </div>
          </Link>
        ))}
      </div>

      <section className="pt-summary">
        <div className="pt-summary__head">
          <h2>
            <span className="pt-summary__icon">
              <Icon name="rules" size={17} />
            </span>
            Resumen de cuenta
          </h2>
          <Link href="/portal/deudas" className="pt-summary__more">
            Ver detalles <Icon name="chevron-right" size={15} />
          </Link>
        </div>
        <div className="pt-summary__grid">
          <div className="pt-fact">
            <div className="pt-fact__top">
              <span className="pt-fact__label">Estado de cuenta</span>
              <span className={`pt-pill ${habil ? "pt-pill--ok" : "pt-pill--warn"}`}>
                {habil ? "Al día" : "Con deuda"}
              </span>
            </div>
            <div className="pt-fact__sub">
              <span className="pt-fact__label">Último pago</span>
              <strong>{fechaLarga(r.ultimoPago)}</strong>
            </div>
          </div>
          <div className="pt-fact">
            <span className="pt-fact__label">
              {r.proximoVencido ? "Cuota vencida" : "Próximo vencimiento"}
            </span>
            <strong className="pt-fact__value">{fechaLarga(r.proximoVencimiento)}</strong>
          </div>
          <div className="pt-fact">
            <span className="pt-fact__label">Monto próximo a vencer</span>
            <strong className="pt-fact__value pt-fact__value--accent">
              {formatSoles(r.montoProximo)}
            </strong>
          </div>
        </div>
      </section>
    </>
  );
}
