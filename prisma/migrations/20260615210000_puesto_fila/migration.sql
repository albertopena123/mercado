-- DropIndex
DROP INDEX "Puesto_etapa_bloque_numero_key";

-- AlterTable
ALTER TABLE "Puesto" ADD COLUMN     "fila" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE UNIQUE INDEX "Puesto_etapa_bloque_fila_numero_key" ON "Puesto"("etapa", "bloque", "fila", "numero");
