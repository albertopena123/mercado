-- AlterTable
ALTER TABLE "Renuncia" ADD COLUMN     "puestoId" TEXT;

-- CreateIndex
CREATE INDEX "Renuncia_puestoId_idx" ON "Renuncia"("puestoId");

-- AddForeignKey
ALTER TABLE "Renuncia" ADD CONSTRAINT "Renuncia_puestoId_fkey" FOREIGN KEY ("puestoId") REFERENCES "Puesto"("id") ON DELETE SET NULL ON UPDATE CASCADE;
