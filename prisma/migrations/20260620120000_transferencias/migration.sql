-- CreateEnum
CREATE TYPE "EstadoTransferencia" AS ENUM ('borrador', 'completada', 'anulada');

-- CreateTable
CREATE TABLE "Transferencia" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "transferenteId" TEXT NOT NULL,
    "puestoId" TEXT NOT NULL,
    "adqTipoDocumento" "TipoDocumento" NOT NULL DEFAULT 'DNI',
    "adqNumeroDocumento" TEXT NOT NULL,
    "adqApellidoPaterno" TEXT NOT NULL,
    "adqApellidoMaterno" TEXT,
    "adqNombres" TEXT NOT NULL,
    "adqEstadoCivil" TEXT,
    "adqDireccion" TEXT,
    "adqDistrito" TEXT,
    "adqProvincia" TEXT,
    "adqDepartamento" TEXT,
    "adqTelefono" TEXT,
    "monto" DECIMAL(10,2),
    "fecha" TIMESTAMP(3) NOT NULL,
    "estado" "EstadoTransferencia" NOT NULL DEFAULT 'borrador',
    "adquirienteSocioId" TEXT,
    "completadaEn" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transferencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Transferencia_codigo_key" ON "Transferencia"("codigo");

-- CreateIndex
CREATE INDEX "Transferencia_transferenteId_idx" ON "Transferencia"("transferenteId");

-- CreateIndex
CREATE INDEX "Transferencia_puestoId_idx" ON "Transferencia"("puestoId");

-- CreateIndex
CREATE INDEX "Transferencia_estado_idx" ON "Transferencia"("estado");

-- CreateIndex
CREATE INDEX "Transferencia_createdAt_idx" ON "Transferencia"("createdAt");

-- AddForeignKey
ALTER TABLE "Transferencia" ADD CONSTRAINT "Transferencia_transferenteId_fkey" FOREIGN KEY ("transferenteId") REFERENCES "Socio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transferencia" ADD CONSTRAINT "Transferencia_puestoId_fkey" FOREIGN KEY ("puestoId") REFERENCES "Puesto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transferencia" ADD CONSTRAINT "Transferencia_adquirienteSocioId_fkey" FOREIGN KEY ("adquirienteSocioId") REFERENCES "Socio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transferencia" ADD CONSTRAINT "Transferencia_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
