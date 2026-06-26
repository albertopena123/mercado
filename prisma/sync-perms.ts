import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { PERMISSIONS, ROLE_DEFS } from "../src/lib/auth/permissions";

// Sincroniza SOLO permisos y los role-permission de los roles del sistema.
// NO crea el usuario admin del seed, NO re-indexa socios, NO toca roles custom
// (p. ej. "tesorera") que no están en ROLE_DEFS. Idempotente y aditivo.
async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  const before = await prisma.permission.count();
  console.log(`Permisos en BD antes: ${before} (el código define ${PERMISSIONS.length})`);

  console.log("→ Upsert de permisos…");
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: p.key },
      update: { name: p.name, description: p.description, category: p.category },
      create: p,
    });
  }

  console.log("→ Re-sincronizando role-permissions de roles del sistema…");
  const permByKey = new Map(
    (await prisma.permission.findMany()).map((p) => [p.key, p.id]),
  );

  for (const role of ROLE_DEFS) {
    const dbRole = await prisma.role.findUnique({ where: { key: role.key } });
    if (!dbRole) {
      console.warn(`  ⚠ rol "${role.key}" no existe en BD, saltando`);
      continue;
    }
    await prisma.rolePermission.deleteMany({ where: { roleId: dbRole.id } });
    for (const permKey of role.permissions) {
      const permId = permByKey.get(permKey);
      if (!permId) continue;
      await prisma.rolePermission.create({
        data: { roleId: dbRole.id, permissionId: permId },
      });
    }
    const n = role.permissions.length;
    console.log(`  ✓ ${role.key}: ${n} permisos`);
  }

  const after = await prisma.permission.count();
  console.log(`Permisos en BD después: ${after}`);

  // Reporte de control: ¿al superadmin le falta algo?
  const missing = await prisma.permission.findMany({
    where: {
      roles: { none: { role: { key: "superadmin" } } },
    },
    select: { key: true },
  });
  console.log(
    missing.length === 0
      ? "✓ superadmin tiene TODOS los permisos."
      : `⚠ superadmin aún sin: ${missing.map((m) => m.key).join(", ")}`,
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
