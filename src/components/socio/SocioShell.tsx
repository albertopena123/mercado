"use client";

import "./socio.css";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Icon, type IconName } from "@/components/admin/Icon";
import { ToastProvider } from "@/components/admin/toast";
import { NotificationBell } from "./NotificationBell";
import type { Notificacion } from "@/lib/portal/data";
import { ORG } from "@/lib/org";

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/portal", label: "Inicio", icon: "home" },
  { href: "/portal/asambleas", label: "Reuniones", icon: "calendar" },
  { href: "/portal/deudas", label: "Mis deudas", icon: "chart" },
  { href: "/portal/comprobantes", label: "Mis comprobantes", icon: "card" },
  { href: "/portal/comunicados", label: "Comunicados", icon: "bell" },
  { href: "/portal/perfil", label: "Mi perfil", icon: "user" },
];

const WHATSAPP = `https://wa.me/51${ORG.celular}?text=${encodeURIComponent(
  "Hola, necesito ayuda con mi portal de socio.",
)}`;

export function SocioShell({
  socio,
  notificaciones,
  children,
}: {
  socio: { nombre: string; codigo: string };
  notificaciones: Notificacion[];
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  // En escritorio el botón colapsa la barra; en móvil la abre como cajón.
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  function isActive(href: string): boolean {
    return href === "/portal" ? pathname === "/portal" : pathname.startsWith(href);
  }

  function toggleNav() {
    const mobile =
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 900px)").matches;
    if (mobile) setDrawerOpen((v) => !v);
    else setCollapsed((v) => !v);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
    router.refresh();
  }

  return (
    <ToastProvider>
      <div
        className={`pt ${collapsed ? "pt--collapsed" : ""} ${
          drawerOpen ? "pt--drawer" : ""
        }`}
      >
        <header className="pt-top">
          <div className="pt-top__left">
            <button
              type="button"
              className="pt-iconbtn pt-navtoggle"
              onClick={toggleNav}
              aria-label={drawerOpen ? "Cerrar menú" : "Mostrar u ocultar menú"}
            >
              <Icon name="menu" size={20} />
            </button>
            <Link href="/portal" className="pt-brand">
              <span className="pt-brand__logo">GF</span>
              <span className="pt-brand__name">
                Feria Mayorista Internacional Milagros
              </span>
            </Link>
          </div>
          <div className="pt-top__right">
            <NotificationBell items={notificaciones} />
            <span className="pt-loc" title={socio.codigo}>
              <Icon name="pin" size={16} />
              <span>{socio.nombre}</span>
            </span>
            <button type="button" className="pt-logout" onClick={logout}>
              <Icon name="logout" size={16} />
              <span>Salir</span>
            </button>
          </div>
        </header>

        <div className="pt-shell">
          {drawerOpen && (
            <div
              className="pt-backdrop"
              onClick={() => setDrawerOpen(false)}
              aria-hidden="true"
            />
          )}

          <aside className="pt-side" id="pt-sidenav">
            <button
              type="button"
              className="pt-side__close"
              onClick={() => setDrawerOpen(false)}
              aria-label="Cerrar menú"
            >
              <Icon name="close" size={18} />
            </button>

            <nav className="pt-nav" aria-label="Secciones del portal">
              {NAV.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`pt-nav__item ${active ? "is-active" : ""}`}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setDrawerOpen(false)}
                  >
                    <Icon name={item.icon} size={19} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="pt-help">
              <p className="pt-help__title">¿Necesitas ayuda?</p>
              <p className="pt-help__text">
                Comunícate con la administración del mercado.
              </p>
              <a
                className="pt-help__btn"
                href={WHATSAPP}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Icon name="headset" size={16} />
                <span>Contactar</span>
              </a>
            </div>
          </aside>

          <div className="pt-content">
            <main className="pt-main">{children}</main>
            <footer className="pt-foot">
              © {new Date().getFullYear()} Feria Mayorista Internacional Milagros.
              Todos los derechos reservados.
            </footer>
          </div>
        </div>
      </div>
    </ToastProvider>
  );
}
