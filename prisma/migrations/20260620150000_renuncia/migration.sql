-- CreateEnum
CREATE TYPE "EstadoRenuncia" AS ENUM ('solicitada', 'aceptada_cd', 'ratificada_ag', 'efectiva', 'rechazada');

-- CreateTable
CREATE TABLE "Renuncia" (
    "id" TEXT NOT NULL,
    "socioId" TEXT NOT NULL,
    "estado" "EstadoRenuncia" NOT NULL DEFAULT 'solicitada',
    "motivo" TEXT,
    "fechaSolicitud" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actaCdNumero" TEXT,
    "actaCdFecha" TIMESTAMP(3),
    "actaAgNumero" TEXT,
    "actaAgFecha" TIMESTAMP(3),
    "efectivaEn" TIMESTAMP(3),
    "motivoRechazo" TEXT,
    "observaciones" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Renuncia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Renuncia_socioId_idx" ON "Renuncia"("socioId");

-- CreateIndex
CREATE INDEX "Renuncia_estado_idx" ON "Renuncia"("estado");

-- AddForeignKey
ALTER TABLE "Renuncia" ADD CONSTRAINT "Renuncia_socioId_fkey" FOREIGN KEY ("socioId") REFERENCES "Socio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Renuncia" ADD CONSTRAINT "Renuncia_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
