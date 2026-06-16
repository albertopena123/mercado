import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { hashPassword } from "../src/lib/auth/password";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
(async () => {
  if (process.argv.includes("--del")) { await prisma.user.deleteMany({ where: { email: "qa.verify@example.com" } }); console.log("del"); await prisma.$disconnect(); return; }
  const r = await prisma.role.findUnique({ where: { key: "superadmin" } });
  await prisma.user.upsert({ where: { email: "qa.verify@example.com" }, update: { passwordHash: await hashPassword("QaVerify1234"), active: true }, create: { name: "QA", email: "qa.verify@example.com", passwordHash: await hashPassword("QaVerify1234"), active: true, roles: { create: [{ roleId: r!.id }] } } });
  console.log("ok"); await prisma.$disconnect();
})().catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1); });
