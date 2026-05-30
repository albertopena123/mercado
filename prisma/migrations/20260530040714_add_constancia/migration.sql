-- CreateTable
CREATE TABLE "Constancia" (
    "id" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "socioId" TEXT,
    "socioCodigo" TEXT NOT NULL,
    "socioNombre" TEXT NOT NULL,
    "tipoDocumento" TEXT NOT NULL,
    "numeroDocumento" TEXT NOT NULL,
    "estadoSnapshot" TEXT NOT NULL,
    "habil" BOOLEAN NOT NULL DEFAULT true,
    "emitidoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validoHasta" TIMESTAMP(3),
    "anulada" BOOLEAN NOT NULL DEFAULT false,
    "emitidoPorId" TEXT,

    CONSTRAINT "Constancia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Constancia_folio_key" ON "Constancia"("folio");

-- CreateIndex
CREATE UNIQUE INDEX "Constancia_codigo_key" ON "Constancia"("codigo");

-- CreateIndex
CREATE INDEX "Constancia_socioId_idx" ON "Constancia"("socioId");

-- CreateIndex
CREATE INDEX "Constancia_emitidoEn_idx" ON "Constancia"("emitidoEn");

-- AddForeignKey
ALTER TABLE "Constancia" ADD CONSTRAINT "Constancia_socioId_fkey" FOREIGN KEY ("socioId") REFERENCES "Socio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Constancia" ADD CONSTRAINT "Constancia_emitidoPorId_fkey" FOREIGN KEY ("emitidoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
