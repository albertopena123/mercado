import Link from "next/link";
import { requireSocio } from "@/lib/portal/socio";
import { getMiResumen } from "@/lib/portal/data";
import { formatSoles } from "@/lib/money";
import { Icon } from "@/components/admin/Icon";

export const metadata = { title: "Mi portal · Gran Feria Mayorista Internacional" };
export const dynamic = "force-dynamic";

export default async function PortalHome() {
  const { socio } = await requireSocio();
  const r = await getMiResumen(socio.id);
  const habil = socio.estado === "activo" && r.deuda === 0;

  const cards = [
    {
      href: "/portal/asambleas",
      icon: "calendar" as const,
      title: "Reuniones",
      desc: "Ve las asambleas y marca tu asistencia con el QR.",
      badge: `${r.reuniones} ${r.reuniones === 1 ? "reunión" : "reuniones"}`,
    },
    {
      href: "/portal/deudas",
      icon: "chart" as const,
      title: "Mis deudas",
      desc: "Consulta tus cuotas y tu estado de cuenta.",
      badge: r.deuda > 0 ? `Debes ${formatSoles(r.deuda)}` : "Al día",
    },
    {
      href: "/portal/comprobantes",
      icon: "card" as const,
      title: "Mis comprobantes",
      desc: "Tus recibos de pago: revísalos, imprímelos o guárdalos.",
      badge: "Recibos de pago",
    },
    {
      href: "/portal/comunicados",
      icon: "bell" as const,
      title: "Comunicados",
      desc: "Anuncios y comunicados del mercado.",
      badge: `${r.comunicados} ${r.comunicados === 1 ? "publicación" : "publicaciones"}`,
    },
    {
      href: "/portal/perfil",
      icon: "user" as const,
      title: "Mi perfil",
      desc: "Tus datos, tus puestos y tu contraseña.",
      badge: `${r.puestos} ${r.puestos === 1 ? "puesto" : "puestos"}`,
    },
  ];

  return (
    <>
      <div className="pt-hello">
        <h1>
          Hola, {socio.nombre.split(",").pop()?.trim() || socio.nombre}
          <span className={`pt-chip ${habil ? "" : "pt-chip--warn"}`}>
            {habil ? "Socio hábil" : "Revisar estado"}
          </span>
        </h1>
        <p>
          Código {socio.codigo} · {socio.tipoDocumento} {socio.numeroDocumento}
        </p>
      </div>

      <div className="pt-cards">
        {cards.map((c) => (
          <Link key={c.href} href={c.href} className="pt-card">
            <span className="pt-card__icon">
              <Icon name={c.icon} size={20} />
            </span>
            <span className="pt-card__title">{c.title}</span>
            <span className="pt-card__desc">{c.desc}</span>
            <span className="pt-card__badge">{c.badge}</span>
          </Link>
        ))}
      </div>
    </>
  );
}
