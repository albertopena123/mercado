-- AlterTable
ALTER TABLE "Transferencia" ADD COLUMN     "contratoUploadedAt" TIMESTAMP(3),
ADD COLUMN     "contratoUploadedById" TEXT,
ADD COLUMN     "renunciaUploadedAt" TIMESTAMP(3),
ADD COLUMN     "renunciaUploadedById" TEXT;

-- AddForeignKey
ALTER TABLE "Transferencia" ADD CONSTRAINT "Transferencia_renunciaUploadedById_fkey" FOREIGN KEY ("renunciaUploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transferencia" ADD CONSTRAINT "Transferencia_contratoUploadedById_fkey" FOREIGN KEY ("contratoUploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
