-- AlterTable
ALTER TABLE "Asamblea" ADD COLUMN     "codigoVerificacion" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Asamblea_codigoVerificacion_key" ON "Asamblea"("codigoVerificacion");
