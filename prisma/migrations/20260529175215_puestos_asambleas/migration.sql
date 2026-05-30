-- CreateEnum
CREATE TYPE "EstadoPuesto" AS ENUM ('activo', 'vacio', 'clausurado', 'construccion');

-- CreateEnum
CREATE TYPE "TipoAsamblea" AS ENUM ('ordinaria', 'extraordinaria');

-- CreateEnum
CREATE TYPE "EstadoAsamblea" AS ENUM ('programada', 'en_curso', 'cerrada');

-- CreateEnum
CREATE TYPE "EstadoAsistencia" AS ENUM ('presente', 'ausente', 'justificado', 'tardanza');

-- CreateTable
CREATE TABLE "Puesto" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "giro" TEXT,
    "area" DOUBLE PRECISION,
    "zona" TEXT,
    "estado" "EstadoPuesto" NOT NULL DEFAULT 'vacio',
    "fotoUrl" TEXT,
    "observaciones" TEXT,
    "searchKey" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Puesto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PuestoAsignacion" (
    "id" TEXT NOT NULL,
    "puestoId" TEXT NOT NULL,
    "socioId" TEXT NOT NULL,
    "desde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hasta" TIMESTAMP(3),
    "motivo" TEXT,
    "byUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PuestoAsignacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asamblea" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "tipo" "TipoAsamblea" NOT NULL DEFAULT 'ordinaria',
    "fecha" TIMESTAMP(3) NOT NULL,
    "lugar" TEXT,
    "agenda" TEXT,
    "estado" "EstadoAsamblea" NOT NULL DEFAULT 'programada',
    "quorumMinimo" INTEGER,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asamblea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asistencia" (
    "id" TEXT NOT NULL,
    "asambleaId" TEXT NOT NULL,
    "socioId" TEXT NOT NULL,
    "estado" "EstadoAsistencia" NOT NULL DEFAULT 'ausente',
    "observacion" TEXT,
    "byUserId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asistencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Puesto_codigo_key" ON "Puesto"("codigo");

-- CreateIndex
CREATE INDEX "Puesto_estado_idx" ON "Puesto"("estado");

-- CreateIndex
CREATE INDEX "Puesto_giro_idx" ON "Puesto"("giro");

-- CreateIndex
CREATE INDEX "PuestoAsignacion_puestoId_hasta_idx" ON "PuestoAsignacion"("puestoId", "hasta");

-- CreateIndex
CREATE INDEX "PuestoAsignacion_socioId_hasta_idx" ON "PuestoAsignacion"("socioId", "hasta");

-- CreateIndex
CREATE INDEX "Asamblea_fecha_idx" ON "Asamblea"("fecha");

-- CreateIndex
CREATE INDEX "Asamblea_estado_idx" ON "Asamblea"("estado");

-- CreateIndex
CREATE INDEX "Asistencia_asambleaId_idx" ON "Asistencia"("asambleaId");

-- CreateIndex
CREATE INDEX "Asistencia_socioId_idx" ON "Asistencia"("socioId");

-- CreateIndex
CREATE UNIQUE INDEX "Asistencia_asambleaId_socioId_key" ON "Asistencia"("asambleaId", "socioId");

-- AddForeignKey
ALTER TABLE "Puesto" ADD CONSTRAINT "Puesto_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Puesto" ADD CONSTRAINT "Puesto_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PuestoAsignacion" ADD CONSTRAINT "PuestoAsignacion_puestoId_fkey" FOREIGN KEY ("puestoId") REFERENCES "Puesto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PuestoAsignacion" ADD CONSTRAINT "PuestoAsignacion_socioId_fkey" FOREIGN KEY ("socioId") REFERENCES "Socio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PuestoAsignacion" ADD CONSTRAINT "PuestoAsignacion_byUserId_fkey" FOREIGN KEY ("byUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asamblea" ADD CONSTRAINT "Asamblea_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asistencia" ADD CONSTRAINT "Asistencia_asambleaId_fkey" FOREIGN KEY ("asambleaId") REFERENCES "Asamblea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asistencia" ADD CONSTRAINT "Asistencia_socioId_fkey" FOREIGN KEY ("socioId") REFERENCES "Socio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asistencia" ADD CONSTRAINT "Asistencia_byUserId_fkey" FOREIGN KEY ("byUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
