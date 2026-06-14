"use client";

import "./socio.css";
import { type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/admin/Icon";
import { ToastProvider } from "@/components/admin/toast";

export function SocioShell({
  socio,
  children,
}: {
  socio: { nombre: string; codigo: string };
  children: ReactNode;
}) {
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
    router.refresh();
  }

  return (
    <ToastProvider>
      <div className="pt">
        <header className="pt-top">
          <Link href="/portal" className="pt-brand">
            <span className="pt-brand__logo">M</span>
            <span className="pt-brand__name">Mercado Milagros</span>
          </Link>
          <div className="pt-top__right">
            <span className="pt-user" title={socio.codigo}>
              {socio.nombre}
            </span>
            <button type="button" className="pt-logout" onClick={logout}>
              <Icon name="lock" size={15} />
              <span>Salir</span>
            </button>
          </div>
        </header>
        <main className="pt-main">{children}</main>
        <footer className="pt-foot">
          Mercado Milagros · Portal del socio
        </footer>
      </div>
    </ToastProvider>
  );
}
