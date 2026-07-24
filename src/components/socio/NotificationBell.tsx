"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { Icon, type IconName } from "@/components/admin/Icon";
import { getNotificacionesPortal } from "@/app/(socio)/portal/actions";
import type { Notificacion, TipoNotificacion } from "@/lib/portal/data";

// Cada cuánto re-consultar las notificaciones con la pestaña visible. El layout
// solo las calcula al renderizar; sin esto, un comunicado publicado con el
// portal ya abierto no aparecería nunca (hasta un F5).
const POLL_MS = 60_000;

const TIPO_ICON: Record<TipoNotificacion, IconName> = {
  reunion: "calendar",
  deuda: "chart",
  comunicado: "bell",
};

// El "leído" vive en el dispositivo (sin tocar la BD). Lo leemos con
// useSyncExternalStore para que sea consistente en hidratación (en el servidor
// no hay nada visto → el badge aparece tras hidratar, sin desajustes).
const SEEN_KEY = "pt-notif-seen";
const seenListeners = new Set<() => void>();

function readSeen(): string {
  try {
    return localStorage.getItem(SEEN_KEY) ?? "[]";
  } catch {
    return "[]";
  }
}
function serverSeen(): string {
  return "[]";
}
function subscribeSeen(cb: () => void): () => void {
  seenListeners.add(cb);
  if (typeof window !== "undefined") window.addEventListener("storage", cb);
  return () => {
    seenListeners.delete(cb);
    if (typeof window !== "undefined") window.removeEventListener("storage", cb);
  };
}
function markSeen(ids: string[]): void {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(ids));
  } catch {
    /* localStorage no disponible */
  }
  seenListeners.forEach((l) => l());
}

export function NotificationBell({ items: initial }: { items: Notificacion[] }) {
  const [open, setOpen] = useState(false);
  // Arranca con lo que calculó el servidor (sin parpadeo) y se mantiene fresco
  // por sondeo + al recuperar el foco/visibilidad de la pestaña. Si una
  // navegación trae un `initial` nuevo del layout, se adopta durante el render
  // (patrón de React para derivar estado de un prop que cambia).
  const [items, setItems] = useState<Notificacion[]>(initial);
  const [prevInitial, setPrevInitial] = useState(initial);
  if (prevInitial !== initial) {
    setPrevInitial(initial);
    setItems(initial);
  }
  const ref = useRef<HTMLDivElement>(null);
  const enVuelo = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function refrescar() {
      // Sin solapar peticiones y sin gastar red con la pestaña oculta.
      if (enVuelo.current || document.hidden) return;
      enVuelo.current = true;
      try {
        const r = await getNotificacionesPortal();
        if (!cancelled && r.ok && r.data) setItems(r.data);
      } finally {
        enVuelo.current = false;
      }
    }
    const timer = setInterval(refrescar, POLL_MS);
    // Al volver a la pestaña (celular desbloqueado, cambio de app) refresca ya.
    function onVisible() {
      if (!document.hidden) void refrescar();
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  const seenRaw = useSyncExternalStore(subscribeSeen, readSeen, serverSeen);
  const seen = useMemo<Set<string>>(() => {
    try {
      return new Set(JSON.parse(seenRaw) as string[]);
    } catch {
      return new Set();
    }
  }, [seenRaw]);

  const unread = items.filter((n) => !seen.has(n.id)).length;

  // Cerrar al hacer click afuera o con Escape.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    // Abrir marca todo como visto (limpia el badge).
    if (next && items.length > 0) {
      markSeen([...new Set([...seen, ...items.map((n) => n.id)])]);
    }
  }

  return (
    <div className="pt-bell" ref={ref}>
      <button
        type="button"
        className="pt-iconbtn"
        onClick={toggle}
        aria-label={
          unread > 0 ? `Notificaciones (${unread} sin leer)` : "Notificaciones"
        }
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Icon name="bell" size={18} />
        {unread > 0 && (
          <span className="pt-bell__badge">{unread > 9 ? "9+" : unread}</span>
        )}
      </button>

      {open && (
        <div className="pt-notif" role="menu" aria-label="Notificaciones">
          <div className="pt-notif__head">
            <span>Notificaciones</span>
            {items.length > 0 && (
              <span className="pt-notif__count">{items.length}</span>
            )}
          </div>

          {items.length === 0 ? (
            <p className="pt-notif__empty">No tienes notificaciones por ahora.</p>
          ) : (
            <ul className="pt-notif__list">
              {items.map((n) => (
                <li key={n.id}>
                  <Link
                    href={n.href}
                    className="pt-notif__item"
                    role="menuitem"
                    onClick={() => setOpen(false)}
                  >
                    <span className={`pt-notif__icon pt-notif__icon--${n.tipo}`}>
                      <Icon name={TIPO_ICON[n.tipo]} size={16} />
                    </span>
                    <span className="pt-notif__body">
                      <span className="pt-notif__title">
                        {n.titulo}
                        {n.urgente && <span className="pt-notif__dot" />}
                      </span>
                      <span className="pt-notif__detail">{n.detalle}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <Link
            href="/portal/asambleas"
            className="pt-notif__foot"
            onClick={() => setOpen(false)}
          >
            Ver reuniones
          </Link>
        </div>
      )}
    </div>
  );
}
