-- CreateEnum
CREATE TYPE "GuardianiaOrigen" AS ENUM ('import', 'manual');

-- CreateTable
CREATE TABLE "GuardianiaPago" (
    "id" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "nroRecibo" TEXT,
    "periodo" TEXT NOT NULL,
    "mesEtiqueta" TEXT,
    "importe" DECIMAL(10,2) NOT NULL,
    "socioId" TEXT,
    "puestoId" TEXT,
    "etapa" INTEGER,
    "bloque" TEXT,
    "numeroPuesto" INTEGER,
    "parcela" TEXT,
    "socioNombre" TEXT NOT NULL,
    "numeroPadron" INTEGER,
    "responsable" TEXT,
    "metodoPago" TEXT,
    "origen" "GuardianiaOrigen" NOT NULL DEFAULT 'manual',
    "observacion" TEXT,
    "searchKey" TEXT NOT NULL DEFAULT '',
    "registradoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuardianiaPago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuardianiaCuenta" (
    "id" TEXT NOT NULL,
    "puestoId" TEXT NOT NULL,
    "socioId" TEXT,
    "tarifaMensual" DECIMAL(10,2) NOT NULL,
    "inicioPeriodo" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "deudaBaseline" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuardianiaCuenta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GuardianiaPago_periodo_idx" ON "GuardianiaPago"("periodo");

-- CreateIndex
CREATE INDEX "GuardianiaPago_fecha_idx" ON "GuardianiaPago"("fecha");

-- CreateIndex
CREATE INDEX "GuardianiaPago_nroRecibo_idx" ON "GuardianiaPago"("nroRecibo");

-- CreateIndex
CREATE INDEX "GuardianiaPago_socioId_idx" ON "GuardianiaPago"("socioId");

-- CreateIndex
CREATE INDEX "GuardianiaPago_puestoId_idx" ON "GuardianiaPago"("puestoId");

-- CreateIndex
CREATE INDEX "GuardianiaPago_searchKey_idx" ON "GuardianiaPago"("searchKey");

-- CreateIndex
CREATE UNIQUE INDEX "GuardianiaCuenta_puestoId_key" ON "GuardianiaCuenta"("puestoId");

-- CreateIndex
CREATE INDEX "GuardianiaCuenta_socioId_idx" ON "GuardianiaCuenta"("socioId");

-- CreateIndex
CREATE INDEX "GuardianiaCuenta_activo_idx" ON "GuardianiaCuenta"("activo");

-- AddForeignKey
ALTER TABLE "GuardianiaPago" ADD CONSTRAINT "GuardianiaPago_socioId_fkey" FOREIGN KEY ("socioId") REFERENCES "Socio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuardianiaPago" ADD CONSTRAINT "GuardianiaPago_puestoId_fkey" FOREIGN KEY ("puestoId") REFERENCES "Puesto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuardianiaPago" ADD CONSTRAINT "GuardianiaPago_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuardianiaCuenta" ADD CONSTRAINT "GuardianiaCuenta_puestoId_fkey" FOREIGN KEY ("puestoId") REFERENCES "Puesto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuardianiaCuenta" ADD CONSTRAINT "GuardianiaCuenta_socioId_fkey" FOREIGN KEY ("socioId") REFERENCES "Socio"("id") ON DELETE SET NULL ON UPDATE CASCADE;
