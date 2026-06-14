-- CreateEnum
CREATE TYPE "TipoAnuncio" AS ENUM ('anuncio', 'comunicado');

-- CreateEnum
CREATE TYPE "VisibilidadAnuncio" AS ENUM ('publico', 'socios');

-- CreateEnum
CREATE TYPE "EstadoAnuncio" AS ENUM ('borrador', 'publicado', 'archivado');

-- CreateTable
CREATE TABLE "Anuncio" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "resumen" TEXT,
    "contenido" TEXT NOT NULL,
    "tipo" "TipoAnuncio" NOT NULL DEFAULT 'anuncio',
    "visibilidad" "VisibilidadAnuncio" NOT NULL DEFAULT 'publico',
    "estado" "EstadoAnuncio" NOT NULL DEFAULT 'borrador',
    "fijado" BOOLEAN NOT NULL DEFAULT false,
    "imagenUrl" TEXT,
    "publicadoEn" TIMESTAMP(3),
    "validoHasta" TIMESTAMP(3),
    "searchKey" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Anuncio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Anuncio_estado_idx" ON "Anuncio"("estado");

-- CreateIndex
CREATE INDEX "Anuncio_visibilidad_estado_idx" ON "Anuncio"("visibilidad", "estado");

-- CreateIndex
CREATE INDEX "Anuncio_publicadoEn_idx" ON "Anuncio"("publicadoEn");

-- AddForeignKey
ALTER TABLE "Anuncio" ADD CONSTRAINT "Anuncio_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Anuncio" ADD CONSTRAINT "Anuncio_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
