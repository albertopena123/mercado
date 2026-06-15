-- DropForeignKey
ALTER TABLE "PuestoAsignacion" DROP CONSTRAINT "PuestoAsignacion_puestoId_fkey";

-- AddForeignKey
ALTER TABLE "PuestoAsignacion" ADD CONSTRAINT "PuestoAsignacion_puestoId_fkey" FOREIGN KEY ("puestoId") REFERENCES "Puesto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
