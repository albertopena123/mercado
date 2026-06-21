-- CreateEnum
CREATE TYPE "EstadoSolicitudActualizacion" AS ENUM ('pendiente', 'aprobada', 'rechazada');

-- CreateTable
CREATE TABLE "SolicitudActualizacionDatos" (
    "id" TEXT NOT NULL,
    "socioId" TEXT NOT NULL,
    "datos" JSONB NOT NULL,
    "estado" "EstadoSolicitudActualizacion" NOT NULL DEFAULT 'pendiente',
    "motivoRechazo" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revisadoPorId" TEXT,
    "revisadoEn" TIMESTAMP(3),

    CONSTRAINT "SolicitudActualizacionDatos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SolicitudActualizacionDatos_socioId_idx" ON "SolicitudActualizacionDatos"("socioId");

-- CreateIndex
CREATE INDEX "SolicitudActualizacionDatos_estado_idx" ON "SolicitudActualizacionDatos"("estado");

-- AddForeignKey
ALTER TABLE "SolicitudActualizacionDatos" ADD CONSTRAINT "SolicitudActualizacionDatos_socioId_fkey" FOREIGN KEY ("socioId") REFERENCES "Socio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitudActualizacionDatos" ADD CONSTRAINT "SolicitudActualizacionDatos_revisadoPorId_fkey" FOREIGN KEY ("revisadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Máximo UNA solicitud pendiente por socio (Prisma no expresa índices parciales).
CREATE UNIQUE INDEX "SolicitudActualizacion_unica_pendiente_por_socio"
  ON "SolicitudActualizacionDatos"("socioId")
  WHERE estado = 'pendiente';
