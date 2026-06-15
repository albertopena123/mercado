-- CreateEnum
CREATE TYPE "TipoMovimiento" AS ENUM ('ingreso', 'egreso');

-- CreateEnum
CREATE TYPE "CategoriaMovimiento" AS ENUM ('cuota', 'inscripcion', 'bano', 'multa', 'alquiler', 'otro_ingreso', 'personal', 'compra', 'servicio', 'mantenimiento', 'evento', 'servicios_basicos', 'otro_egreso');

-- CreateEnum
CREATE TYPE "TipoComprobante" AS ENUM ('ninguno', 'boleta', 'factura', 'recibo');

-- CreateTable
CREATE TABLE "MovimientoCaja" (
    "id" TEXT NOT NULL,
    "tipo" "TipoMovimiento" NOT NULL,
    "categoria" "CategoriaMovimiento" NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concepto" TEXT NOT NULL,
    "metodoPago" TEXT,
    "comprobanteTipo" "TipoComprobante" NOT NULL DEFAULT 'ninguno',
    "comprobanteNumero" TEXT,
    "comprobanteUrl" TEXT,
    "socioId" TEXT,
    "origen" TEXT NOT NULL DEFAULT 'manual',
    "registradoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "searchKey" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "MovimientoCaja_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MovimientoCaja_tipo_idx" ON "MovimientoCaja"("tipo");

-- CreateIndex
CREATE INDEX "MovimientoCaja_categoria_idx" ON "MovimientoCaja"("categoria");

-- CreateIndex
CREATE INDEX "MovimientoCaja_fecha_idx" ON "MovimientoCaja"("fecha");

-- CreateIndex
CREATE INDEX "MovimientoCaja_socioId_idx" ON "MovimientoCaja"("socioId");

-- AddForeignKey
ALTER TABLE "MovimientoCaja" ADD CONSTRAINT "MovimientoCaja_socioId_fkey" FOREIGN KEY ("socioId") REFERENCES "Socio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoCaja" ADD CONSTRAINT "MovimientoCaja_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
