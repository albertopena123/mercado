// Standalone integrity check for the /usuarios data layer.
// Exercises Prisma transactions + the superadmin invariant exactly the way
// the server actions do, without going through the Next runtime.

import "dotenv/config";
import assert from "node:assert/strict";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../src/generated/prisma/client";
import { hashPassword } from "../src/lib/auth/password";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function ensureSuperadminRemains(tx: Prisma.TransactionClient) {
  const remaining = await tx.user.count({
    where: {
      active: true,
      roles: { some: { role: { key: "superadmin" } } },
    },
  });
  if (remaining < 1) throw new Error("LAST_SUPERADMIN");
}

async function main() {
  const stamp = `test-${Date.now()}@unamad.edu.pe`;
  console.log("→ Creando usuario de prueba", stamp);

  const editorRole = await prisma.role.findUnique({ where: { key: "editor" } });
  const adminRole = await prisma.role.findUnique({ where: { key: "admin" } });
  const superRole = await prisma.role.findUnique({
    where: { key: "superadmin" },
  });
  if (!editorRole || !adminRole || !superRole)
    throw new Error("Roles base ausentes; corre el seed primero.");

  const passwordHash = await hashPassword("test1234");
  const created = await prisma.user.create({
    data: {
      name: "Usuario Test",
      email: stamp,
      passwordHash,
      roles: { create: [{ roleId: editorRole.id }] },
    },
    include: { roles: true },
  });
  assert.equal(created.roles.length, 1, "debería tener 1 rol al crear");
  console.log("  ✓ create con roles funciona");

  // Reassignar roles
  await prisma.$transaction(async (tx) => {
    await tx.userRole.deleteMany({ where: { userId: created.id } });
    await tx.userRole.createMany({
      data: [
        { userId: created.id, roleId: adminRole.id },
        { userId: created.id, roleId: editorRole.id },
      ],
      skipDuplicates: true,
    });
    await ensureSuperadminRemains(tx);
  });
  const reload = await prisma.user.findUnique({
    where: { id: created.id },
    include: { roles: true },
  });
  assert.equal(reload?.roles.length, 2, "ahora debería tener 2 roles");
  console.log("  ✓ setUserRoles reemplaza correctamente");

  // Suspender
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: created.id }, data: { active: false } });
    await ensureSuperadminRemains(tx);
  });
  console.log("  ✓ suspend respeta invariante");

  // Cambiar password
  const newHash = await hashPassword("nuevoPass!9");
  await prisma.user.update({
    where: { id: created.id },
    data: { passwordHash: newHash },
  });
  console.log("  ✓ setPassword funciona");

  // Intento de violar invariante: suspender el único superadmin
  const onlySuper = await prisma.user.findFirst({
    where: {
      active: true,
      roles: { some: { role: { key: "superadmin" } } },
    },
  });
  if (onlySuper) {
    let threw = false;
    try {
      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: onlySuper.id },
          data: { active: false },
        });
        await ensureSuperadminRemains(tx);
      });
    } catch (e) {
      threw = (e as Error).message.includes("LAST_SUPERADMIN");
    }
    assert.equal(threw, true, "la transacción debió revertirse");
    const stillActive = await prisma.user.findUnique({
      where: { id: onlySuper.id },
    });
    assert.equal(
      stillActive?.active,
      true,
      "el superadmin debe seguir activo tras el rollback",
    );
    console.log("  ✓ invariante de superadmin bloquea + rollback funciona");
  } else {
    console.log("  ⚠ no había superadmin único; salto el test de invariante");
  }

  // Eliminar (cascade en UserRole + Session)
  await prisma.user.delete({ where: { id: created.id } });
  const gone = await prisma.user.findUnique({ where: { id: created.id } });
  assert.equal(gone, null, "el usuario debió eliminarse");
  const orphanRoles = await prisma.userRole.findMany({
    where: { userId: created.id },
  });
  assert.equal(orphanRoles.length, 0, "UserRole debió cascadear");
  console.log("  ✓ delete cascadea UserRole");

  console.log("\n✅ Todos los tests de integridad pasaron.");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("✗", e);
  await prisma.$disconnect();
  process.exit(1);
});
