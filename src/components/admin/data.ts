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
  { id: "personal", label: "Personal", icon: "users", href: "/personal" },
  { id: "puestos", label: "Puestos", icon: "folder", href: "/puestos" },
  {
    id: "transferencias",
    label: "Transferencias",
    icon: "external",
    href: "/transferencias",
  },
  { id: "organos", label: "Junta directiva", icon: "user", href: "/organos" },
  { id: "inventario", label: "Inventario", icon: "rules", href: "/inventario" },
  { id: "cuotas", label: "Cuotas y deuda", icon: "chart", href: "/cuotas" },
  { id: "caja", label: "Caja", icon: "card", href: "/caja" },
  { id: "guardiania", label: "Guardianía", icon: "shield", href: "/guardiania" },
  { id: "asambleas", label: "Asambleas", icon: "calendar", href: "/asambleas" },
  { id: "reportes", label: "Reportes", icon: "chart", href: "/reportes" },
  { id: "anuncios", label: "Anuncios", icon: "bell", href: "/anuncios" },
];
