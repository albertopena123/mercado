-- AlterTable
ALTER TABLE "User" ADD COLUMN     "numeroDocumento" TEXT,
ADD COLUMN     "tipoDocumento" "TipoDocumento",
ALTER COLUMN "email" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "User_tipoDocumento_numeroDocumento_key" ON "User"("tipoDocumento", "numeroDocumento");
