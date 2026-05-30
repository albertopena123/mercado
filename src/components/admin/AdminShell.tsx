"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { TopBar } from "./TopBar";
import { Sidebar } from "./Sidebar";
import { ToastProvider } from "./toast";

type Props = {
  user: { name: string; email: string };
  children: ReactNode;
};

const MOBILE_BREAKPOINT = 900;

export function AdminShell({ user, children }: Props) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const pathname = usePathname();

  // Track viewport width — toggle between collapsed (desktop) and overlay (mobile).
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const update = () => {
      setIsMobile(mq.matches);
      // Al salir del modo móvil cerramos el drawer; si no, el scroll-lock del
      // body se quedaría activo en escritorio y la página no haría scroll.
      if (!mq.matches) setMobileOpen(false);
    };
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Close the mobile drawer on route change (efecto intencional de navegación).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMobileOpen(false);
  }, [pathname]);

  // Body scroll lock while the mobile drawer is open. Gated on isMobile para que
  // el cleanup libere el scroll en cuanto dejamos el layout móvil.
  useEffect(() => {
    if (!mobileOpen || !isMobile) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen, isMobile]);

  const onMenuClick = () => {
    if (isMobile) setMobileOpen((v) => !v);
    else setSidebarCollapsed((v) => !v);
  };

  return (
    <ToastProvider>
    <div className="shell">
      <TopBar user={user} onMenuClick={onMenuClick} />
      <div className="shell__body">
        {isMobile && mobileOpen && (
          <div
            className="sidebar__mobile-backdrop"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
        )}
        <Sidebar
          collapsed={sidebarCollapsed && !isMobile}
          mobileOpen={isMobile && mobileOpen}
        />
        <main className="main">{children}</main>
      </div>

      <footer className="footer">
        <span>© 2026 UNAMAD · Oficina de Tecnologías de la Información</span>
        <span className="footer__sep">·</span>
        <span>Términos del Servicio</span>
        <span className="footer__sep">·</span>
        <span>Política de Privacidad</span>
      </footer>
    </div>
    </ToastProvider>
  );
}
