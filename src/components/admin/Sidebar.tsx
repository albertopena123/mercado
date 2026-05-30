"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { SIDEBAR_NAV } from "./data";

type Props = {
  collapsed: boolean;
  mobileOpen?: boolean;
};

function pathToActiveId(pathname: string): string {
  const segment = pathname.replace(/^\/+/, "").split("/")[0] || "";
  return segment;
}

export function Sidebar({ collapsed, mobileOpen = false }: Props) {
  const pathname = usePathname();
  const activeId = pathToActiveId(pathname);

  const parentOfActive =
    SIDEBAR_NAV.find((g) =>
      g.children?.some((c) => c.id === activeId),
    )?.id ?? null;

  const [openId, setOpenId] = useState<string | null>(parentOfActive);

  useEffect(() => {
    if (parentOfActive) setOpenId(parentOfActive);
  }, [parentOfActive]);

  return (
    <aside
      className={`sidebar ${collapsed ? "sidebar--collapsed" : ""} ${
        mobileOpen ? "sidebar--mobile-open" : ""
      }`}
    >
      <nav className="sidebar__nav">
        {SIDEBAR_NAV.map((item) => {
          const isOpen = openId === item.id;
          const isSelf = activeId === item.id;
          const hasActiveChild =
            item.children?.some((c) => c.id === activeId) ?? false;

          const itemClass = `sidebar__item ${
            isSelf && !hasActiveChild ? "is-active" : ""
          } ${hasActiveChild ? "is-parent-active" : ""}`;

          const inner = (
            <>
              <span className="sidebar__icon">
                <Icon name={item.icon} size={20} />
                {item.dot && <span className="sidebar__dot" />}
              </span>
              <span className="sidebar__label">{item.label}</span>
              {item.expandable && (
                <span className="sidebar__chev">
                  <Icon
                    name={isOpen ? "chevron-down" : "chevron-right"}
                    size={16}
                  />
                </span>
              )}
            </>
          );

          return (
            <div key={item.id} className="sidebar__group">
              {item.expandable ? (
                <button
                  className={itemClass}
                  onClick={() => setOpenId(isOpen ? null : item.id)}
                  title={collapsed ? item.label : undefined}
                >
                  {inner}
                </button>
              ) : (
                <Link
                  href={item.href ?? `/${item.id}`}
                  className={itemClass}
                  title={collapsed ? item.label : undefined}
                >
                  {inner}
                </Link>
              )}

              {item.children && isOpen && !collapsed && (
                <div className="sidebar__sub">
                  {item.children.map((child) => (
                    <Link
                      key={child.id}
                      href={child.href}
                      className={`sidebar__subitem ${
                        activeId === child.id ? "is-active" : ""
                      }`}
                    >
                      {child.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
