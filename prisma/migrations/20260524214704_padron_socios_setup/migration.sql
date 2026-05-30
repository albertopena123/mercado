/*
  Warnings:

  - You are about to drop the `Incident` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `IncidentAttachment` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `IncidentCategory` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `IncidentComment` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `IncidentStatusLog` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "TipoDocumento" AS ENUM ('DNI', 'CE', 'PASAPORTE', 'RUC');

-- CreateEnum
CREATE TYPE "EstadoSocio" AS ENUM ('activo', 'suspendido', 'retirado', 'fallecido');

-- CreateEnum
CREATE TYPE "Sexo" AS ENUM ('M', 'F');

-- DropForeignKey
ALTER TABLE "Incident" DROP CONSTRAINT "Incident_assignedToId_fkey";

-- DropForeignKey
ALTER TABLE "Incident" DROP CONSTRAINT "Incident_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "Incident" DROP CONSTRAINT "Incident_reporterId_fkey";

-- DropForeignKey
ALTER TABLE "IncidentAttachment" DROP CONSTRAINT "IncidentAttachment_incidentId_fkey";

-- DropForeignKey
ALTER TABLE "IncidentAttachment" DROP CONSTRAINT "IncidentAttachment_uploadedById_fkey";

-- DropForeignKey
ALTER TABLE "IncidentComment" DROP CONSTRAINT "IncidentComment_authorId_fkey";

-- DropForeignKey
ALTER TABLE "IncidentComment" DROP CONSTRAINT "IncidentComment_incidentId_fkey";

-- DropForeignKey
ALTER TABLE "IncidentStatusLog" DROP CONSTRAINT "IncidentStatusLog_byUserId_fkey";

-- DropForeignKey
ALTER TABLE "IncidentStatusLog" DROP CONSTRAINT "IncidentStatusLog_incidentId_fkey";

-- DropTable
DROP TABLE "Incident";

-- DropTable
DROP TABLE "IncidentAttachment";

-- DropTable
DROP TABLE "IncidentCategory";

-- DropTable
DROP TABLE "IncidentComment";

-- DropTable
DROP TABLE "IncidentStatusLog";

-- DropEnum
DROP TYPE "IncidentSeverity";

-- DropEnum
DROP TYPE "IncidentStatus";

-- CreateTable
CREATE TABLE "Socio" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "tipoDocumento" "TipoDocumento" NOT NULL,
    "numeroDocumento" TEXT NOT NULL,
    "apellidoPaterno" TEXT NOT NULL,
    "apellidoMaterno" TEXT,
    "nombres" TEXT NOT NULL,
    "fechaNacimiento" TIMESTAMP(3),
    "sexo" "Sexo",
    "estadoCivil" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "direccion" TEXT,
    "distrito" TEXT,
    "provincia" TEXT,
    "departamento" TEXT,
    "fechaIngreso" TIMESTAMP(3) NOT NULL,
    "estado" "EstadoSocio" NOT NULL DEFAULT 'activo',
    "observaciones" TEXT,
    "fotoUrl" TEXT,
    "userId" TEXT,
    "portalEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Socio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocioAdjunto" (
    "id" TEXT NOT NULL,
    "socioId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocioAdjunto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocioEstadoLog" (
    "id" TEXT NOT NULL,
    "socioId" TEXT NOT NULL,
    "fromEstado" "EstadoSocio" NOT NULL,
    "toEstado" "EstadoSocio" NOT NULL,
    "motivo" TEXT NOT NULL,
    "byUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocioEstadoLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Socio_codigo_key" ON "Socio"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Socio_userId_key" ON "Socio"("userId");

-- CreateIndex
CREATE INDEX "Socio_estado_idx" ON "Socio"("estado");

-- CreateIndex
CREATE INDEX "Socio_apellidoPaterno_apellidoMaterno_nombres_idx" ON "Socio"("apellidoPaterno", "apellidoMaterno", "nombres");

-- CreateIndex
CREATE UNIQUE INDEX "Socio_tipoDocumento_numeroDocumento_key" ON "Socio"("tipoDocumento", "numeroDocumento");

-- CreateIndex
CREATE INDEX "SocioAdjunto_socioId_idx" ON "SocioAdjunto"("socioId");

-- CreateIndex
CREATE INDEX "SocioEstadoLog_socioId_idx" ON "SocioEstadoLog"("socioId");

-- AddForeignKey
ALTER TABLE "Socio" ADD CONSTRAINT "Socio_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Socio" ADD CONSTRAINT "Socio_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Socio" ADD CONSTRAINT "Socio_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocioAdjunto" ADD CONSTRAINT "SocioAdjunto_socioId_fkey" FOREIGN KEY ("socioId") REFERENCES "Socio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocioAdjunto" ADD CONSTRAINT "SocioAdjunto_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocioEstadoLog" ADD CONSTRAINT "SocioEstadoLog_socioId_fkey" FOREIGN KEY ("socioId") REFERENCES "Socio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocioEstadoLog" ADD CONSTRAINT "SocioEstadoLog_byUserId_fkey" FOREIGN KEY ("byUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
