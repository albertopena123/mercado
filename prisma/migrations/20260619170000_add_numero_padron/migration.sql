-- AlterTable
ALTER TABLE "Socio" ADD COLUMN     "numeroPadron" INTEGER;

-- CreateIndex
CREATE INDEX "Socio_numeroPadron_idx" ON "Socio"("numeroPadron");
