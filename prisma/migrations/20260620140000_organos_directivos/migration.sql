-- CreateEnum
CREATE TYPE "Organo" AS ENUM ('consejo_directivo', 'fiscalia', 'comite', 'coordinacion_bloque');

-- CreateEnum
CREATE TYPE "CargoDirectivo" AS ENUM ('presidente', 'vicepresidente', 'secretario', 'tesorero', 'fiscal', 'vocal', 'coordinador', 'otro');

-- CreateTable
CREATE TABLE "Directivo" (
    "id" TEXT NOT NULL,
    "socioId" TEXT NOT NULL,
    "organo" "Organo" NOT NULL,
    "cargo" "CargoDirectivo" NOT NULL,
    "bloque" TEXT,
    "periodo" TEXT,
    "desde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hasta" TIMESTAMP(3),
    "observaciones" TEXT,
    "byUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Directivo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Directivo_socioId_idx" ON "Directivo"("socioId");

-- CreateIndex
CREATE INDEX "Directivo_organo_hasta_idx" ON "Directivo"("organo", "hasta");

-- CreateIndex
CREATE INDEX "Directivo_cargo_hasta_idx" ON "Directivo"("cargo", "hasta");

-- AddForeignKey
ALTER TABLE "Directivo" ADD CONSTRAINT "Directivo_socioId_fkey" FOREIGN KEY ("socioId") REFERENCES "Socio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Directivo" ADD CONSTRAINT "Directivo_byUserId_fkey" FOREIGN KEY ("byUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
