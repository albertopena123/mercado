-- CreateEnum
CREATE TYPE "UbicacionBien" AS ENUM ('oficina', 'almacen');

-- CreateEnum
CREATE TYPE "EstadoBien" AS ENUM ('nuevo', 'conservado', 'en_uso', 'sin_usar', 'desuso', 'mal_estado', 'roto', 'baja');

-- CreateEnum
CREATE TYPE "TipoMovBien" AS ENUM ('entrada', 'salida', 'ajuste');

-- CreateTable
CREATE TABLE "Bien" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "ubicacion" "UbicacionBien" NOT NULL DEFAULT 'almacen',
    "unidad" TEXT NOT NULL DEFAULT 'UND',
    "marcaModelo" TEXT,
    "cantidad" INTEGER NOT NULL DEFAULT 0,
    "estado" "EstadoBien" NOT NULL DEFAULT 'conservado',
    "observaciones" TEXT,
    "searchKey" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bien_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimientoBien" (
    "id" TEXT NOT NULL,
    "bienId" TEXT NOT NULL,
    "tipo" "TipoMovBien" NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "cantidadAnterior" INTEGER NOT NULL,
    "cantidadNueva" INTEGER NOT NULL,
    "motivo" TEXT,
    "byUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimientoBien_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Bien_codigo_key" ON "Bien"("codigo");

-- CreateIndex
CREATE INDEX "Bien_ubicacion_idx" ON "Bien"("ubicacion");

-- CreateIndex
CREATE INDEX "Bien_estado_idx" ON "Bien"("estado");

-- CreateIndex
CREATE INDEX "Bien_nombre_idx" ON "Bien"("nombre");

-- CreateIndex
CREATE INDEX "MovimientoBien_bienId_createdAt_idx" ON "MovimientoBien"("bienId", "createdAt");

-- AddForeignKey
ALTER TABLE "Bien" ADD CONSTRAINT "Bien_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bien" ADD CONSTRAINT "Bien_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoBien" ADD CONSTRAINT "MovimientoBien_bienId_fkey" FOREIGN KEY ("bienId") REFERENCES "Bien"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoBien" ADD CONSTRAINT "MovimientoBien_byUserId_fkey" FOREIGN KEY ("byUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
