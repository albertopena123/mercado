import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { hashPassword } from "../src/lib/auth/password";
import { PERMISSIONS, ROLE_DEFS } from "../src/lib/auth/permissions";
import { buildSocioSearchKey } from "../src/lib/socios/normalize";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  console.log("→ Sincronizando permisos…");
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: p.key },
      update: { name: p.name, description: p.description, category: p.category },
      create: p,
    });
  }

  console.log("→ Sincronizando roles…");
  const permByKey = new Map(
    (await prisma.permission.findMany()).map((p) => [p.key, p.id]),
  );

  for (const role of ROLE_DEFS) {
    const dbRole = await prisma.role.upsert({
      where: { key: role.key },
      update: {
        name: role.name,
        description: role.description,
        system: role.system,
      },
      create: {
        key: role.key,
        name: role.name,
        description: role.description,
        system: role.system,
      },
    });

    // Replace role-permission links to match definition
    await prisma.rolePermission.deleteMany({ where: { roleId: dbRole.id } });
    for (const permKey of role.permissions) {
      const permId = permByKey.get(permKey);
      if (!permId) {
        console.warn(`  ⚠ permiso "${permKey}" no encontrado, saltando`);
        continue;
      }
      await prisma.rolePermission.create({
        data: { roleId: dbRole.id, permissionId: permId },
      });
    }
  }

  const adminEmail = process.env.SEED_ADMIN_EMAIL?.toLowerCase();
  const adminName = process.env.SEED_ADMIN_NAME ?? "Administrador";
  const adminPass = process.env.SEED_ADMIN_PASSWORD;

  if (!adminEmail || !adminPass) {
    console.log(
      "→ SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD no definidos; omitiendo usuario.",
    );
  } else {
    console.log(`→ Asegurando usuario admin ${adminEmail}…`);
    const superadminRole = await prisma.role.findUnique({
      where: { key: "superadmin" },
    });
    if (!superadminRole) throw new Error("superadmin role missing after seed");

    const passwordHash = await hashPassword(adminPass);
    const user = await prisma.user.upsert({
      where: { email: adminEmail },
      update: { name: adminName, active: true },
      create: { email: adminEmail, name: adminName, passwordHash, active: true },
    });

    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: superadminRole.id } },
      update: {},
      create: { userId: user.id, roleId: superadminRole.id },
    });

    console.log(`✓ admin listo: ${adminEmail}`);
  }

  console.log("→ Limpiando permisos huérfanos (no presentes en PERMISSIONS)…");
  const validKeys = new Set(PERMISSIONS.map((p) => p.key));
  const orphaned = await prisma.permission.findMany({
    where: { key: { notIn: [...validKeys] } },
  });
  if (orphaned.length > 0) {
    await prisma.permission.deleteMany({
      where: { id: { in: orphaned.map((p) => p.id) } },
    });
    console.log(`  ✓ ${orphaned.length} permisos antiguos eliminados.`);
  }

  console.log("→ Recalculando searchKey de socios existentes…");
  const socios = await prisma.socio.findMany({
    select: {
      id: true,
      codigo: true,
      numeroDocumento: true,
      apellidoPaterno: true,
      apellidoMaterno: true,
      nombres: true,
      searchKey: true,
    },
  });
  let updated = 0;
  for (const s of socios) {
    const expected = buildSocioSearchKey(s);
    if (expected !== s.searchKey) {
      await prisma.socio.update({
        where: { id: s.id },
        data: { searchKey: expected },
      });
      updated++;
    }
  }
  console.log(`  ✓ ${updated} de ${socios.length} socios re-indexados.`);

  console.log("✓ Seed completado.");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
