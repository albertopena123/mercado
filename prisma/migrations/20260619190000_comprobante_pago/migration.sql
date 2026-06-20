-- AlterTable
ALTER TABLE "MovimientoCaja" ADD COLUMN     "nroOperacion" TEXT;

-- CreateTable
CREATE TABLE "Comprobante" (
    "id" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "socioId" TEXT,
    "socioCodigo" TEXT NOT NULL,
    "socioNombre" TEXT NOT NULL,
    "numeroDocumento" TEXT NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "metodoPago" TEXT,
    "nroOperacion" TEXT,
    "detalle" TEXT NOT NULL,
    "movimientoCajaId" TEXT,
    "emitidoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "anulada" BOOLEAN NOT NULL DEFAULT false,
    "emitidoPorId" TEXT,

    CONSTRAINT "Comprobante_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Comprobante_folio_key" ON "Comprobante"("folio");

-- CreateIndex
CREATE UNIQUE INDEX "Comprobante_codigo_key" ON "Comprobante"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Comprobante_movimientoCajaId_key" ON "Comprobante"("movimientoCajaId");

-- CreateIndex
CREATE INDEX "Comprobante_socioId_idx" ON "Comprobante"("socioId");

-- CreateIndex
CREATE INDEX "Comprobante_emitidoEn_idx" ON "Comprobante"("emitidoEn");

-- AddForeignKey
ALTER TABLE "Comprobante" ADD CONSTRAINT "Comprobante_socioId_fkey" FOREIGN KEY ("socioId") REFERENCES "Socio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comprobante" ADD CONSTRAINT "Comprobante_movimientoCajaId_fkey" FOREIGN KEY ("movimientoCajaId") REFERENCES "MovimientoCaja"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comprobante" ADD CONSTRAINT "Comprobante_emitidoPorId_fkey" FOREIGN KEY ("emitidoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
