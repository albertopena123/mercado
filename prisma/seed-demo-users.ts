import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { hashPassword } from "../src/lib/auth/password";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const DEMO = [
  { name: "Erika Cusi Arangoitia", email: "erika.cusi@unamad.edu.pe", role: "admin", active: true, daysAgoLastLogin: 0 },
  { name: "Juan Quispe Mamani", email: "j.quispe@unamad.edu.pe", role: "editor", active: true, daysAgoLastLogin: 1 },
  { name: "María Salas Yáñez", email: "m.salas@unamad.edu.pe", role: "editor", active: true, daysAgoLastLogin: 3 },
  { name: "Carlos Mamani Apaza", email: "c.mamani@unamad.edu.pe", role: "viewer", active: true, daysAgoLastLogin: 12 },
  { name: "Lucía Romero Vásquez", email: "l.romero@unamad.edu.pe", role: "admin", active: false, daysAgoLastLogin: 40 },
  { name: "Pedro Huamán Ríos", email: "p.huaman@unamad.edu.pe", role: "viewer", active: true, daysAgoLastLogin: 7 },
  { name: "Ana Choque Layme", email: "a.choque.layme@unamad.edu.pe", role: "viewer", active: true, daysAgoLastLogin: 90 },
  { name: "José Tarazona Quiroz Mancilla del Castillo", email: "jose.tarazona.quiroz.mancilla@unamad.edu.pe", role: null, active: true, daysAgoLastLogin: null },
  { name: "Ronaldo Vega", email: "r.vega@unamad.edu.pe", role: "editor", active: false, daysAgoLastLogin: 120 },
  { name: "Sofía Mendoza", email: "s.mendoza@unamad.edu.pe", role: "viewer", active: true, daysAgoLastLogin: 0 },
];

async function main() {
  console.log("→ Sembrando usuarios demo");
  const rolesByKey = Object.fromEntries(
    (await prisma.role.findMany()).map((r) => [r.key, r.id]),
  );

  for (const u of DEMO) {
    const passwordHash = await hashPassword("demo123");
    const lastLoginAt =
      u.daysAgoLastLogin === null
        ? null
        : new Date(Date.now() - u.daysAgoLastLogin * 86_400_000);
    const created = await prisma.user.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        active: u.active,
        lastLoginAt: lastLoginAt ?? undefined,
      },
      create: {
        name: u.name,
        email: u.email,
        passwordHash,
        active: u.active,
        lastLoginAt,
      },
    });
    if (u.role) {
      const roleId = rolesByKey[u.role];
      if (roleId) {
        await prisma.userRole.upsert({
          where: { userId_roleId: { userId: created.id, roleId } },
          update: {},
          create: { userId: created.id, roleId },
        });
      }
    }
    console.log(`  ✓ ${u.email}`);
  }

  await prisma.$disconnect();
  console.log("Listo.");
}

main();
