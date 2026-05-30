"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/server";
import type { PermissionKey } from "@/lib/auth/permissions";
import type { ActionResult } from "./types";

const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const NAME_MIN = 2;
const NAME_MAX = 80;
const PASSWORD_MIN = 6;
const PASSWORD_MAX = 200;
const SUPERADMIN_KEY = "superadmin";

class Denied extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Denied";
  }
}

async function authorize(perm: PermissionKey): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new Denied("No autenticado.");
  if (!user.permissions.has(perm)) {
    throw new Denied("No tienes permisos para esta acción.");
  }
  return user;
}

function fail(error: string, fieldErrors?: Record<string, string>): ActionResult {
  return { ok: false, error, fieldErrors };
}

function ok<T>(data?: T): ActionResult<T> {
  return { ok: true, data };
}

function dedupe(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const out = new Set<string>();
  for (const x of list) if (typeof x === "string") out.add(x);
  return [...out];
}

async function ensureSuperadminRemains(
  tx: Prisma.TransactionClient,
): Promise<void> {
  const remaining = await tx.user.count({
    where: {
      active: true,
      roles: { some: { role: { key: SUPERADMIN_KEY } } },
    },
  });
  if (remaining < 1) {
    throw new Denied(
      "Debe existir al menos un superadministrador activo. Acción cancelada.",
    );
  }
}

// Returns true if `userId` has the superadmin role.
async function isTargetSuper(userId: string): Promise<boolean> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { roles: { select: { role: { select: { key: true } } } } },
  });
  return !!u?.roles.some((ur) => ur.role.key === SUPERADMIN_KEY);
}

function meIsSuper(me: CurrentUser): boolean {
  return me.roles.some((r) => r.key === SUPERADMIN_KEY);
}

function refresh() {
  revalidatePath("/usuarios");
}

function isP2002(e: unknown): boolean {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002"
  );
}

/* ────────────────────────────────── createUser ────────────────────────────────── */

type CreateInput = {
  name: string;
  email: string;
  password: string;
  roleIds: string[];
};

export async function createUser(
  input: CreateInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const me = await authorize("users.write");

    const name = (input.name ?? "").trim();
    const email = (input.email ?? "").trim().toLowerCase();
    const password = input.password ?? "";
    const roleIds = dedupe(input.roleIds);

    const fieldErrors: Record<string, string> = {};
    if (name.length < NAME_MIN) fieldErrors.name = "El nombre es obligatorio.";
    else if (name.length > NAME_MAX)
      fieldErrors.name = `Máximo ${NAME_MAX} caracteres.`;
    if (!EMAIL_RE.test(email)) fieldErrors.email = "Correo no válido.";
    if (password.length < PASSWORD_MIN)
      fieldErrors.password = `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres.`;
    else if (password.length > PASSWORD_MAX)
      fieldErrors.password = "Contraseña demasiado larga.";

    if (Object.keys(fieldErrors).length > 0) {
      return fail("Revisa los campos marcados.", fieldErrors);
    }

    if (roleIds.length > 0) {
      // Asignar roles es una autoridad distinta de crear usuarios. Sin esto un
      // principal con solo "users.write" podría crear una cuenta y adjuntarle
      // el rol admin (escalada de privilegios). Exigimos el mismo permiso que
      // setUserRoles.
      if (!me.permissions.has("users.assign-roles")) {
        return fail(
          "No tienes permiso para asignar roles. Crea el usuario sin roles o pide el permiso correspondiente.",
        );
      }
      const found = await prisma.role.findMany({
        where: { id: { in: roleIds } },
        select: { id: true, key: true },
      });
      if (found.length !== roleIds.length) {
        return fail("Uno de los roles seleccionados no existe.");
      }
      // C1: only superadmin may create users with the superadmin role.
      const grantsSuper = found.some((r) => r.key === SUPERADMIN_KEY);
      const meIsSuper = me.roles.some((r) => r.key === SUPERADMIN_KEY);
      if (grantsSuper && !meIsSuper) {
        return fail(
          "Solo un superadministrador puede otorgar el rol Superadministrador.",
        );
      }
    }

    const passwordHash = await hashPassword(password);
    try {
      const created = await prisma.user.create({
        data: {
          name,
          email,
          passwordHash,
          roles: { create: roleIds.map((roleId) => ({ roleId })) },
        },
      });
      refresh();
      return ok({ id: created.id });
    } catch (e) {
      if (isP2002(e)) {
        return fail("Ya existe un usuario con ese correo.", {
          email: "Correo en uso.",
        });
      }
      throw e;
    }
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("createUser", e);
    return fail("No se pudo crear el usuario.");
  }
}

/* ─────────────────────────────── updateUserProfile ─────────────────────────────── */

export async function updateUserProfile(
  userId: string,
  input: { name?: string },
): Promise<ActionResult> {
  try {
    await authorize("users.write");

    const data: { name?: string } = {};
    if (typeof input.name === "string") {
      const trimmed = input.name.trim();
      if (trimmed.length < NAME_MIN)
        return fail("Nombre demasiado corto.", {
          name: `Mínimo ${NAME_MIN} caracteres.`,
        });
      if (trimmed.length > NAME_MAX)
        return fail("Nombre demasiado largo.", {
          name: `Máximo ${NAME_MAX} caracteres.`,
        });
      data.name = trimmed;
    }

    if (Object.keys(data).length === 0) return ok();

    await prisma.user.update({ where: { id: userId }, data });
    refresh();
    return ok();
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("updateUserProfile", e);
    return fail("No se pudo actualizar el usuario.");
  }
}

/* ───────────────────────────────── setUserActive ───────────────────────────────── */

export async function setUserActive(
  userId: string,
  active: boolean,
): Promise<ActionResult> {
  try {
    const me = await authorize("users.write");
    if (userId === me.id && !active) {
      return fail("No puedes suspender tu propia cuenta.");
    }

    // Lateral escalation guard: a non-superadmin cannot suspend/reactivate a superadmin.
    if (userId !== me.id && !meIsSuper(me) && (await isTargetSuper(userId))) {
      return fail(
        "Solo un superadministrador puede modificar el estado de otro superadministrador.",
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { active } });
      if (!active) await ensureSuperadminRemains(tx);
    });

    refresh();
    return ok();
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("setUserActive", e);
    return fail("No se pudo cambiar el estado del usuario.");
  }
}

/* ─────────────────────────────── setUserRoles ─────────────────────────────── */

export async function setUserRoles(
  userId: string,
  roleIds: string[],
): Promise<ActionResult> {
  try {
    const me = await authorize("users.assign-roles");

    const cleanIds = dedupe(roleIds);

    const validRoles = await prisma.role.findMany({
      where: { id: { in: cleanIds } },
      select: { id: true, key: true },
    });
    if (validRoles.length !== cleanIds.length) {
      return fail("Uno o más roles seleccionados no existen.");
    }

    // C1: Lock the superadmin role behind being a superadmin yourself.
    // This covers BOTH granting and revoking; the existing self-demote check below remains.
    const newHasSuper = validRoles.some((r) => r.key === SUPERADMIN_KEY);
    const target = await prisma.user.findUnique({
      where: { id: userId },
      include: { roles: { include: { role: true } } },
    });
    if (!target) return fail("Usuario no encontrado.");
    const oldHasSuper = target.roles.some(
      (ur) => ur.role.key === SUPERADMIN_KEY,
    );

    if (newHasSuper !== oldHasSuper) {
      const meIsSuper = me.roles.some((r) => r.key === SUPERADMIN_KEY);
      if (!meIsSuper) {
        return fail(
          "Solo un superadministrador puede asignar o revocar el rol Superadministrador.",
        );
      }
    }

    // Existing self-demote guard
    if (userId === me.id) {
      const myCurrentSuper = me.roles.find((r) => r.key === SUPERADMIN_KEY);
      const stillSuper = myCurrentSuper
        ? cleanIds.includes(myCurrentSuper.id)
        : false;
      if (myCurrentSuper && !stillSuper) {
        return fail("No puedes quitarte el rol de superadministrador.");
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId } });
      if (cleanIds.length > 0) {
        await tx.userRole.createMany({
          data: cleanIds.map((roleId) => ({ userId, roleId })),
          skipDuplicates: true,
        });
      }
      await ensureSuperadminRemains(tx);
    });

    refresh();
    return ok();
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("setUserRoles", e);
    return fail("No se pudieron asignar los roles.");
  }
}

/* ────────────────────────────── setUserPassword ────────────────────────────── */

export async function setUserPassword(
  userId: string,
  newPassword: string,
): Promise<ActionResult<{ sessionsRevoked: number }>> {
  try {
    const me = await authorize("users.write");
    if (typeof newPassword !== "string" || newPassword.length < PASSWORD_MIN) {
      return fail(
        `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres.`,
        { password: `Mínimo ${PASSWORD_MIN} caracteres.` },
      );
    }
    if (newPassword.length > PASSWORD_MAX) {
      return fail("Contraseña demasiado larga.", {
        password: "Máximo 200 caracteres.",
      });
    }

    // Lateral escalation guard: changing a superadmin's password = taking over.
    if (userId !== me.id && !meIsSuper(me) && (await isTargetSuper(userId))) {
      return fail(
        "Solo un superadministrador puede cambiar la contraseña de otro superadministrador.",
      );
    }

    const passwordHash = await hashPassword(newPassword);

    // C4: rotate password + invalidate all other sessions atomically.
    // If the admin is changing their own password, preserve THIS session
    // so they're not logged out mid-flow; all OTHER sessions still die.
    const preserveSelfClause =
      me.id === userId ? { NOT: { id: me.sessionId } } : {};

    const result = await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash } });
      const purged = await tx.session.deleteMany({
        where: { userId, ...preserveSelfClause },
      });
      return purged.count;
    });

    refresh();
    return ok({ sessionsRevoked: result });
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("setUserPassword", e);
    return fail("No se pudo actualizar la contraseña.");
  }
}

/* ─────────────────────────────── revokeUserSessions ─────────────────────────────── */

export async function revokeUserSessions(
  userId: string,
): Promise<ActionResult<{ count: number }>> {
  try {
    const me = await authorize("users.write");

    // Lateral escalation guard: hostile revoke vector against a superadmin.
    if (userId !== me.id && !meIsSuper(me) && (await isTargetSuper(userId))) {
      return fail(
        "Solo un superadministrador puede cerrar las sesiones de otro superadministrador.",
      );
    }

    // Preserve own current session when self-revoking.
    const preserveSelfClause =
      me.id === userId ? { NOT: { id: me.sessionId } } : {};
    const result = await prisma.session.deleteMany({
      where: { userId, ...preserveSelfClause },
    });
    refresh();
    return ok({ count: result.count });
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("revokeUserSessions", e);
    return fail("No se pudieron cerrar las sesiones.");
  }
}

/* ─────────────────────────────────── deleteUser ─────────────────────────────────── */

export async function deleteUser(userId: string): Promise<ActionResult> {
  try {
    const me = await authorize("users.write");
    if (userId === me.id) return fail("No puedes eliminar tu propia cuenta.");

    // Block non-superadmins from deleting a superadmin (otherwise admin could
    // demote, then delete the only super, etc.). C1 corollary.
    const target = await prisma.user.findUnique({
      where: { id: userId },
      include: { roles: { include: { role: true } } },
    });
    if (!target) return fail("Usuario no encontrado.");
    const targetIsSuper = target.roles.some(
      (ur) => ur.role.key === SUPERADMIN_KEY,
    );
    const meIsSuper = me.roles.some((r) => r.key === SUPERADMIN_KEY);
    if (targetIsSuper && !meIsSuper) {
      return fail(
        "Solo un superadministrador puede eliminar a otro superadministrador.",
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.delete({ where: { id: userId } });
      await ensureSuperadminRemains(tx);
    });

    refresh();
    return ok();
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("deleteUser", e);
    return fail("No se pudo eliminar el usuario.");
  }
}

/* ───────────────────────────────── bulk actions ───────────────────────────────── */

export async function bulkSetActive(
  userIds: string[],
  active: boolean,
): Promise<ActionResult<{ count: number; skippedSupers: number }>> {
  try {
    const me = await authorize("users.write");
    const targets = dedupe(userIds).filter((id) => id !== me.id);
    if (targets.length === 0) {
      return fail("No hay usuarios válidos para esta operación.");
    }

    // Lateral escalation guard for bulk path.
    let finalTargets = targets;
    let skippedSupers = 0;
    if (!meIsSuper(me)) {
      const supers = await prisma.user.findMany({
        where: {
          id: { in: targets },
          roles: { some: { role: { key: SUPERADMIN_KEY } } },
        },
        select: { id: true },
      });
      if (supers.length > 0) {
        const supSet = new Set(supers.map((u) => u.id));
        skippedSupers = supers.length;
        finalTargets = targets.filter((id) => !supSet.has(id));
      }
      if (finalTargets.length === 0) {
        return fail(
          "Solo un superadministrador puede modificar el estado de otros superadministradores.",
        );
      }
    }

    let count = 0;
    await prisma.$transaction(async (tx) => {
      const result = await tx.user.updateMany({
        where: { id: { in: finalTargets } },
        data: { active },
      });
      count = result.count;
      if (!active) await ensureSuperadminRemains(tx);
    });

    refresh();
    return ok({ count, skippedSupers });
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("bulkSetActive", e);
    return fail("No se pudo aplicar la acción en lote.");
  }
}

export async function bulkDelete(
  userIds: string[],
): Promise<ActionResult<{ count: number; skippedSupers: number }>> {
  try {
    const me = await authorize("users.write");
    const targets = dedupe(userIds).filter((id) => id !== me.id);
    if (targets.length === 0) {
      return fail("No hay usuarios válidos para esta operación.");
    }

    // C1 corollary: a non-superadmin must not be able to delete superadmins
    // via the bulk path either. Filter them out and surface a warning if any.
    const meIsSuper = me.roles.some((r) => r.key === SUPERADMIN_KEY);
    let skippedSupers = 0;
    let finalTargets = targets;
    if (!meIsSuper) {
      const supers = await prisma.user.findMany({
        where: {
          id: { in: targets },
          roles: { some: { role: { key: SUPERADMIN_KEY } } },
        },
        select: { id: true },
      });
      if (supers.length > 0) {
        const supSet = new Set(supers.map((u) => u.id));
        skippedSupers = supers.length;
        finalTargets = targets.filter((id) => !supSet.has(id));
      }
      if (finalTargets.length === 0) {
        return fail(
          "Solo un superadministrador puede eliminar a otros superadministradores.",
        );
      }
    }

    let count = 0;
    await prisma.$transaction(async (tx) => {
      const result = await tx.user.deleteMany({
        where: { id: { in: finalTargets } },
      });
      count = result.count;
      await ensureSuperadminRemains(tx);
    });

    refresh();
    return ok({ count, skippedSupers });
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("bulkDelete", e);
    return fail("No se pudo eliminar el lote.");
  }
}
