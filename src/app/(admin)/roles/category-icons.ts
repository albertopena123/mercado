import type { IconName } from "@/components/admin/Icon";

const MAP: Record<string, IconName> = {
  Usuarios: "users",
  Roles: "shield",
  Incidentes: "info",
};

export function categoryIcon(category: string): IconName {
  return MAP[category] ?? "folder";
}
