import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
async function main() {
  const ps = await prisma.puesto.findMany({ where: { etapa: 1, bloque: "A" }, orderBy: { numero: "asc" },
    select: { numero:true, dimension:true, tipo:true, estado:true, observaciones:true,
      asignaciones: { where: { hasta: null }, select: { socio: { select: { apellidoPaterno:true, nombres:true } } } } } });
  console.log(`Bloque A Etapa 1: ${ps.length} puestos`);
  for (const p of ps) {
    const a = p.asignaciones[0]?.socio;
    const tag = (p.observaciones??"").toLowerCase().includes("alquiler") ? "ALQUILER" : p.tipo;
    console.log(`  #${String(p.numero).padStart(2)} ${p.dimension} ${tag.padEnd(8)} ${p.estado.padEnd(8)} ${a? a.apellidoPaterno+" "+a.nombres : (tag==="puesto"?"(vacío)":"")}`);
  }
  console.log("\n¿Existen los socios 3×3 a agregar?");
  for (const dni of ["45628459","44955597","41884131","25216349"]) {
    const s = await prisma.socio.findFirst({ where: { numeroDocumento: dni }, select: { codigo:true, apellidoPaterno:true } });
    console.log(`  DNI ${dni}: ${s? s.codigo+" "+s.apellidoPaterno : "NO EXISTE"}`);
  }
  await prisma.$disconnect();
}
main();
