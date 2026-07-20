-- CreateTable
CREATE TABLE "Empadronamiento" (
    "id" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "fuente" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Empadronamiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PadronRegistro" (
    "id" TEXT NOT NULL,
    "empadronamientoId" TEXT NOT NULL,
    "puestoId" TEXT NOT NULL,
    "nombreOriginal" TEXT,
    "nombre" TEXT,
    "observacion" TEXT,
    "numeroPadron" INTEGER,
    "numeroDocumento" TEXT,
    "socioId" TEXT,
    "searchKey" TEXT NOT NULL DEFAULT '',
    "filaExcel" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PadronRegistro_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Empadronamiento_anio_key" ON "Empadronamiento"("anio");

-- CreateIndex
CREATE UNIQUE INDEX "Empadronamiento_orden_key" ON "Empadronamiento"("orden");

-- CreateIndex
CREATE INDEX "PadronRegistro_puestoId_idx" ON "PadronRegistro"("puestoId");

-- CreateIndex
CREATE INDEX "PadronRegistro_socioId_idx" ON "PadronRegistro"("socioId");

-- CreateIndex
CREATE UNIQUE INDEX "PadronRegistro_empadronamientoId_puestoId_key" ON "PadronRegistro"("empadronamientoId", "puestoId");

-- AddForeignKey
ALTER TABLE "PadronRegistro" ADD CONSTRAINT "PadronRegistro_empadronamientoId_fkey" FOREIGN KEY ("empadronamientoId") REFERENCES "Empadronamiento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PadronRegistro" ADD CONSTRAINT "PadronRegistro_puestoId_fkey" FOREIGN KEY ("puestoId") REFERENCES "Puesto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PadronRegistro" ADD CONSTRAINT "PadronRegistro_socioId_fkey" FOREIGN KEY ("socioId") REFERENCES "Socio"("id") ON DELETE SET NULL ON UPDATE CASCADE;
