import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/server";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { RolesView } from "./RolesView";
import type {
  AvailablePermission,
  PermFlags,
  RoleRow,
} from "./types";

export const metadata = { title: "Roles · UNAMAD Admin" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const me = await requirePermission("roles.read");

  const [roles, totalUsers] = await Promise.all([
    prisma.role.findMany({
      include: {
        permissions: { include: { permission: true } },
        users: {
          include: {
            user: {
              select: { id: true, name: true, email: true, active: true },
            },
          },
          orderBy: { user: { name: "asc" } },
        },
        _count: { select: { users: true } },
      },
      orderBy: [{ system: "desc" }, { name: "asc" }],
    }),
    prisma.user.count(),
  ]);

  const rows: RoleRow[] = roles.map((r) => ({
    id: r.id,
    key: r.key,
    name: r.name,
    description: r.description,
    system: r.system,
    userCount: r._count.users,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    permissions: r.permissions.map((rp) => ({
      key: rp.permission.key,
      name: rp.permission.name,
      description: rp.permission.description ?? "",
      category: rp.permission.category,
    })),
    users: r.users.map((ur) => ({
      id: ur.user.id,
      name: ur.user.name,
      email: ur.user.email ?? "",
      active: ur.user.active,
    })),
  }));

  // Available permissions (from source of truth in code, not just DB)
  const available: AvailablePermission[] = PERMISSIONS.map((p) => ({
    key: p.key,
    name: p.name,
    description: p.description,
    category: p.category,
  }));

  const perms: PermFlags = {
    canRead: me.permissions.has("roles.read"),
    canWrite: me.permissions.has("roles.write"),
    canAssignRoles: me.permissions.has("users.assign-roles"),
  };

  return (
    <RolesView
      rows={rows}
      available={available}
      totalUsers={totalUsers}
      perms={perms}
    />
  );
}
