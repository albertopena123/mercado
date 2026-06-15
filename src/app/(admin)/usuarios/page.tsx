import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/server";
import { UsersClient } from "./UsersClient";
import type { PermFlags, RoleOption, UserRow } from "./types";

export const metadata = { title: "Usuarios · UNAMAD Admin" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const me = await requirePermission("users.read");

  const [users, roles] = await Promise.all([
    prisma.user.findMany({
      // select explícito (no include): nunca traer passwordHash a memoria del
      // servidor sin necesidad, y omitir _count.sessions que no se usa.
      select: {
        id: true,
        name: true,
        email: true,
        tipoDocumento: true,
        numeroDocumento: true,
        active: true,
        lastLoginAt: true,
        createdAt: true,
        roles: { select: { role: { select: { id: true, key: true, name: true } } } },
        socioAccount: { select: { id: true, codigo: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.role.findMany({
      orderBy: [{ system: "desc" }, { name: "asc" }],
    }),
  ]);

  const rows: UserRow[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    tipoDocumento: u.tipoDocumento,
    numeroDocumento: u.numeroDocumento,
    socio: u.socioAccount
      ? { id: u.socioAccount.id, codigo: u.socioAccount.codigo }
      : null,
    active: u.active,
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
    createdAt: u.createdAt.toISOString(),
    roles: u.roles.map((r) => ({
      id: r.role.id,
      key: r.role.key,
      name: r.role.name,
    })),
  }));

  const roleOptions: RoleOption[] = roles.map((r) => ({
    id: r.id,
    key: r.key,
    name: r.name,
    description: r.description,
    system: r.system,
  }));

  const perms: PermFlags = {
    canRead: me.permissions.has("users.read"),
    canWrite: me.permissions.has("users.write"),
    canAssignRoles: me.permissions.has("users.assign-roles"),
  };

  return (
    <UsersClient
      rows={rows}
      roles={roleOptions}
      perms={perms}
      currentUserId={me.id}
    />
  );
}
