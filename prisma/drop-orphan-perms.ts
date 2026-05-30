import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });

  const ORPHANS = [
    "groups.read",
    "groups.write",
    "audit.read",
    "settings.write",
  ];

  // RolePermission rows will cascade via fk onDelete? Let's be safe and clear them first.
  const perms = await prisma.permission.findMany({
    where: { key: { in: ORPHANS } },
    select: { id: true, key: true },
  });
  if (perms.length === 0) {
    console.log("No orphan permissions to remove.");
    await prisma.$disconnect();
    return;
  }
  const ids = perms.map((p) => p.id);
  const links = await prisma.rolePermission.deleteMany({
    where: { permissionId: { in: ids } },
  });
  const deleted = await prisma.permission.deleteMany({
    where: { id: { in: ids } },
  });
  console.log(`Removed ${links.count} role-permission link(s).`);
  console.log(
    `Removed ${deleted.count} orphan permission(s): ${perms.map((p) => p.key).join(", ")}.`,
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
