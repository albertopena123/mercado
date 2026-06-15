"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
} from "react";
import { Icon, type IconName } from "./Icon";
import { ChangePasswordModal } from "./ChangePasswordModal";

type Props = {
  onMenuClick: () => void;
  user: { name: string; email: string };
};

type Notification = { t: string; s: string; k: IconName };

const NOTIFICATIONS: Notification[] = [
  { t: "Nuevo usuario solicita acceso", s: "j.salas@unamad.edu.pe · hace 12 min", k: "user" },
  { t: "Grupo «Profesores de Classroom» actualizado", s: "222 miembros · hace 1 h", k: "users" },
  { t: "Política de seguridad aplicada", s: "12 dispositivos afectados · hace 3 h", k: "shield" },
  { t: "Almacenamiento al 78%", s: "Considera aumentar la cuota · ayer", k: "cloud" },
];

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function TopBar({ onMenuClick, user }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const initialQuery = params.get("q") ?? "";
  const [search, setSearch] = useState(initialQuery);
  const [focused, setFocused] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [perfilOpen, setPerfilOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const avatarRef = useRef<HTMLDivElement>(null);

  // Keep input synced when navigation drops ?q= (sync intencional desde la URL)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearch(params.get("q") ?? "");
  }, [params]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (notifRef.current && !notifRef.current.contains(target)) setNotifOpen(false);
      if (avatarRef.current && !avatarRef.current.contains(target)) setAvatarOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  // Aplica el query a la URL. Resetea la paginación: al filtrar por q la página
  // actual puede quedar fuera del rango del resultado filtrado (tabla vacía).
  const navigateQuery = (value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value.trim()) next.set("q", value);
    else next.delete("q");
    next.delete("page");
    const qs = next.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  };

  // Debounce: no dispares una navegación/consulta a la BD por cada tecla.
  const updateQuery = (value: string, immediate = false) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (immediate) {
      navigateQuery(value);
      return;
    }
    debounceRef.current = setTimeout(() => navigateQuery(value), 300);
  };

  const onSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
    updateQuery(e.target.value);
  };

  const onLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    router.replace("/login");
    router.refresh();
  };

  return (
    <>
    <header className="topbar">
      <div className="topbar__left">
        <button className="iconbtn" onClick={onMenuClick} aria-label="Menú">
          <Icon name="menu" size={22} />
        </button>
        <div className="topbar__brand">
          <Icon name="logo" size={28} />
          <span className="topbar__brand-text">Admin</span>
        </div>
      </div>

      <div className={`topbar__search ${focused ? "is-focused" : ""}`}>
        <Icon name="search" size={20} className="topbar__search-icon" />
        <input
          type="text"
          placeholder="Buscar usuarios, grupos, ajustes o dispositivos"
          value={search}
          onChange={onSearchChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        {search && (
          <button
            className="topbar__search-clear"
            onClick={() => updateQuery("", true)}
            aria-label="Borrar búsqueda"
          >
            <Icon name="close" size={16} />
          </button>
        )}
      </div>

      <div className="topbar__right">
        <div className="topbar__action-wrap" ref={notifRef}>
          <button
            className="iconbtn"
            onClick={() => setNotifOpen((v) => !v)}
            aria-label="Notificaciones"
          >
            <Icon name="bell" size={20} />
            <span className="iconbtn__badge">3</span>
          </button>
          {notifOpen && (
            <div className="popover popover--notif">
              <div className="popover__head">
                <b>Notificaciones</b>
                <button className="linkbtn">Marcar todo como leído</button>
              </div>
              <ul className="notif-list">
                {NOTIFICATIONS.map((n, i) => (
                  <li key={i} className="notif-item">
                    <span className="notif-item__icon">
                      <Icon name={n.k} size={18} />
                    </span>
                    <div>
                      <div className="notif-item__t">{n.t}</div>
                      <div className="notif-item__s">{n.s}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="topbar__action-wrap" ref={avatarRef}>
          <button
            className="avatar"
            onClick={() => setAvatarOpen((v) => !v)}
            aria-label="Cuenta"
          >
            {initialsFor(user.name)}
          </button>
          {avatarOpen && (
            <div className="popover popover--avatar">
              <div className="account">
                <div className="account__row">
                  <div className="account__avatar">{initialsFor(user.name)}</div>
                  <div>
                    <div className="account__name">{user.name}</div>
                    <div className="account__email">{user.email}</div>
                  </div>
                </div>
              </div>
              <div className="account__divider" />
              <div className="account__actions">
                <button
                  className="account__action"
                  onClick={() => {
                    setAvatarOpen(false);
                    setPerfilOpen(true);
                  }}
                >
                  <Icon name="user" size={18} />
                  <span>Cambiar contraseña</span>
                </button>
                <button
                  className="account__action"
                  onClick={onLogout}
                  disabled={loggingOut}
                >
                  <Icon name="lock" size={18} />
                  <span>{loggingOut ? "Cerrando…" : "Cerrar sesión"}</span>
                </button>
              </div>
              <div className="account__foot">
                Política de Privacidad · Términos del Servicio
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
    {perfilOpen && (
      <ChangePasswordModal onClose={() => setPerfilOpen(false)} />
    )}
    </>
  );
}
