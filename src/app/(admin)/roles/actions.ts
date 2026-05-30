"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/server";
import {
  PERMISSIONS,
  ROLE_DEFS,
  type PermissionKey,
} from "@/lib/auth/permissions";
import type { ActionResult } from "./types";

const KEY_MIN = 2;
const KEY_MAX = 40;
const NAME_MIN = 2;
const NAME_MAX = 60;
const DESC_MAX = 200;

const KEY_RE = /^[a-z][a-z0-9-]*[a-z0-9]$/;
const RESERVED_KEYS = new Set<string>(ROLE_DEFS.map((r) => r.key));
const ALL_PERMISSION_KEYS = new Set<string>(PERMISSIONS.map((p) => p.key));

class Denied extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Denied";
  }
}

async function authorize(): Promise<CurrentUser> {
  const me = await getCurrentUser();
  if (!me) throw new Denied("No autenticado.");
  if (!me.permissions.has("roles.write")) {
    throw new Denied("No tienes permiso para gestionar roles.");
  }
  return me;
}

function fail<T = void>(
  error: string,
  fieldErrors?: Record<string, string>,
): ActionResult<T> {
  return { ok: false, error, fieldErrors };
}

function ok<T>(data?: T): ActionResult<T> {
  return { ok: true, data };
}

function dedupePerms(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const out = new Set<string>();
  for (const x of list) {
    if (typeof x === "string" && ALL_PERMISSION_KEYS.has(x)) out.add(x);
  }
  return [...out];
}

function isP2002(e: unknown): boolean {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002"
  );
}

function refresh() {
  revalidatePath("/roles");
  revalidatePath("/usuarios");
}

/* ───────────────────────────────── createRole ───────────────────────────────── */

type CreateInput = {
  key: string;
  name: string;
  description?: string;
  permissionKeys: string[];
};

export async function createRole(
  input: CreateInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    await authorize();

    const key = (input.key ?? "").trim().toLowerCase();
    const name = (input.name ?? "").trim();
    const description = (input.description ?? "").trim();
    const permKeys = dedupePerms(input.permissionKeys);

    const fieldErrors: Record<string, string> = {};
    if (key.length < KEY_MIN || key.length > KEY_MAX) {
      fieldErrors.key = `Entre ${KEY_MIN} y ${KEY_MAX} caracteres.`;
    } else if (!KEY_RE.test(key)) {
      fieldErrors.key =
        "Solo letras, números y guiones; debe empezar con letra.";
    } else if (RESERVED_KEYS.has(key)) {
      fieldErrors.key = "Este identificador está reservado.";
    }
    if (name.length < NAME_MIN || name.length > NAME_MAX) {
      fieldErrors.name = `Entre ${NAME_MIN} y ${NAME_MAX} caracteres.`;
    }
    if (description.length > DESC_MAX) {
      fieldErrors.description = `Máximo ${DESC_MAX} caracteres.`;
    }
    if (Object.keys(fieldErrors).length > 0) {
      return fail("Revisa los campos marcados.", fieldErrors);
    }

    try {
      const permIds = await prisma.permission.findMany({
        where: { key: { in: permKeys } },
        select: { id: true },
      });
      const created = await prisma.role.create({
        data: {
          key,
          name,
          description: description || null,
          system: false,
          permissions: {
            create: permIds.map((p) => ({ permissionId: p.id })),
          },
        },
      });
      refresh();
      return ok({ id: created.id });
    } catch (e) {
      if (isP2002(e)) {
        return fail("Ya existe un rol con ese identificador.", {
          key: "Identificador en uso.",
        });
      }
      throw e;
    }
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("createRole", e);
    return fail("No se pudo crear el rol.");
  }
}

/* ───────────────────────────────── updateRole ───────────────────────────────── */

type UpdateInput = {
  name?: string;
  description?: string | null;
};

export async function updateRole(
  roleId: string,
  input: UpdateInput,
): Promise<ActionResult> {
  try {
    await authorize();

    const target = await prisma.role.findUnique({ where: { id: roleId } });
    if (!target) return fail("Rol no encontrado.");
    if (target.system) {
      return fail("Los roles del sistema no se pueden modificar.");
    }

    const data: { name?: string; description?: string | null } = {};
    if (typeof input.name === "string") {
      const trimmed = input.name.trim();
      if (trimmed.length < NAME_MIN || trimmed.length > NAME_MAX) {
        return fail("Nombre inválido.", {
          name: `Entre ${NAME_MIN} y ${NAME_MAX} caracteres.`,
        });
      }
      data.name = trimmed;
    }
    if (input.description !== undefined) {
      const d = (input.description ?? "").toString().trim();
      if (d.length > DESC_MAX) {
        return fail("Descripción demasiado larga.", {
          description: `Máximo ${DESC_MAX} caracteres.`,
        });
      }
      data.description = d || null;
    }
    if (Object.keys(data).length === 0) return ok();

    await prisma.role.update({ where: { id: roleId }, data });
    refresh();
    return ok();
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("updateRole", e);
    return fail("No se pudo actualizar el rol.");
  }
}

/* ─────────────────────────────── setRolePermissions ─────────────────────────── */

export async function setRolePermissions(
  roleId: string,
  permissionKeys: string[],
): Promise<ActionResult<{ count: number }>> {
  try {
    await authorize();

    const target = await prisma.role.findUnique({ where: { id: roleId } });
    if (!target) return fail("Rol no encontrado.");
    if (target.system) {
      return fail("Los permisos de los roles del sistema no se pueden modificar.");
    }

    const keys = dedupePerms(permissionKeys) as PermissionKey[];

    await prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId } });
      if (keys.length > 0) {
        const perms = await tx.permission.findMany({
          where: { key: { in: keys } },
          select: { id: true },
        });
        await tx.rolePermission.createMany({
          data: perms.map((p) => ({ roleId, permissionId: p.id })),
          skipDuplicates: true,
        });
      }
    });

    refresh();
    return ok({ count: keys.length });
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("setRolePermissions", e);
    return fail("No se pudieron actualizar los permisos.");
  }
}

/* ─────────────────────────────────── deleteRole ─────────────────────────────── */

export async function deleteRole(roleId: string): Promise<ActionResult> {
  try {
    await authorize();

    const target = await prisma.role.findUnique({
      where: { id: roleId },
      include: { _count: { select: { users: true } } },
    });
    if (!target) return fail("Rol no encontrado.");
    if (target.system) {
      return fail("Los roles del sistema no se pueden eliminar.");
    }
    if (target._count.users > 0) {
      return fail(
        `Este rol tiene ${target._count.users} usuario(s) asignado(s). Reasigna a otro rol antes de eliminar.`,
      );
    }

    await prisma.role.delete({ where: { id: roleId } });
    refresh();
    return ok();
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("deleteRole", e);
    return fail("No se pudo eliminar el rol.");
  }
}

/* ──────────────────────── removeUserFromRole (drill-down) ───────────────────── */

export async function removeUserFromRole(
  roleId: string,
  userId: string,
): Promise<ActionResult> {
  try {
    const me = await getCurrentUser();
    if (!me) return fail("No autenticado.");
    if (!me.permissions.has("users.assign-roles")) {
      return fail("No tienes permiso para reasignar roles.");
    }

    const role = await prisma.role.findUnique({ where: { id: roleId } });
    if (!role) return fail("Rol no encontrado.");

    // Privilege escalation guard (mirror of usuarios setUserRoles):
    if (role.key === "superadmin") {
      const meIsSuper = me.roles.some((r) => r.key === "superadmin");
      if (!meIsSuper) {
        return fail(
          "Solo un superadministrador puede modificar el rol superadmin.",
        );
      }
    }

    // Self-demote guard for superadmin
    if (role.key === "superadmin" && userId === me.id) {
      return fail("No puedes quitarte el rol de superadministrador.");
    }

    await prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { roleId, userId } });
      // If we just removed a super, make sure at least one remains active.
      if (role.key === "superadmin") {
        const remaining = await tx.user.count({
          where: {
            active: true,
            roles: { some: { role: { key: "superadmin" } } },
          },
        });
        if (remaining < 1) {
          throw new Denied(
            "Debe existir al menos un superadministrador activo.",
          );
        }
      }
    });

    refresh();
    return ok();
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("removeUserFromRole", e);
    return fail("No se pudo quitar el rol al usuario.");
  }
}
