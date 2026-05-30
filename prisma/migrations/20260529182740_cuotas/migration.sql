-- CreateEnum
CREATE TYPE "EstadoCuota" AS ENUM ('pendiente', 'pagada', 'anulada');

-- CreateTable
CREATE TABLE "Cuota" (
    "id" TEXT NOT NULL,
    "socioId" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "concepto" TEXT NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "vencimiento" TIMESTAMP(3),
    "estado" "EstadoCuota" NOT NULL DEFAULT 'pendiente',
    "pagadoEn" TIMESTAMP(3),
    "pagadoMonto" DECIMAL(10,2),
    "metodoPago" TEXT,
    "byUserId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cuota_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Cuota_socioId_estado_idx" ON "Cuota"("socioId", "estado");

-- CreateIndex
CREATE INDEX "Cuota_periodo_idx" ON "Cuota"("periodo");

-- CreateIndex
CREATE INDEX "Cuota_estado_idx" ON "Cuota"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "Cuota_socioId_periodo_concepto_key" ON "Cuota"("socioId", "periodo", "concepto");

-- AddForeignKey
ALTER TABLE "Cuota" ADD CONSTRAINT "Cuota_socioId_fkey" FOREIGN KEY ("socioId") REFERENCES "Socio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cuota" ADD CONSTRAINT "Cuota_byUserId_fkey" FOREIGN KEY ("byUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
