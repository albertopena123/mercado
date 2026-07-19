-- AlterTable
ALTER TABLE "Constancia" ADD COLUMN     "anuladaEn" TIMESTAMP(3),
ADD COLUMN     "anuladaPorId" TEXT,
ADD COLUMN     "motivo" TEXT,
ADD COLUMN     "motivoAnulacion" TEXT;

-- AddForeignKey
ALTER TABLE "Constancia" ADD CONSTRAINT "Constancia_anuladaPorId_fkey" FOREIGN KEY ("anuladaPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
