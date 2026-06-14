import type { IconName } from "./Icon";

export type SidebarChild = { id: string; label: string; href: string };
export type SidebarItem = {
  id: string;
  label: string;
  icon: IconName;
  href?: string;
  expandable?: boolean;
  dot?: boolean;
  children?: SidebarChild[];
};

export const SIDEBAR_NAV: SidebarItem[] = [
  { id: "usuarios", label: "Usuarios", icon: "users", href: "/usuarios" },
  { id: "roles", label: "Roles", icon: "shield", href: "/roles" },
  { id: "socios", label: "Padrón de socios", icon: "card", href: "/socios" },
  { id: "puestos", label: "Puestos", icon: "folder", href: "/puestos" },
  { id: "cuotas", label: "Cuotas y deuda", icon: "chart", href: "/cuotas" },
  { id: "asambleas", label: "Asambleas", icon: "calendar", href: "/asambleas" },
  { id: "anuncios", label: "Anuncios", icon: "bell", href: "/anuncios" },
];
