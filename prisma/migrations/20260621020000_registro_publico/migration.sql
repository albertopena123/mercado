-- CreateTable
CREATE TABLE "SolicitudRegistroPublico" (
    "id" TEXT NOT NULL,
    "tipoDocumento" "TipoDocumento" NOT NULL DEFAULT 'DNI',
    "numeroDocumento" TEXT NOT NULL,
    "nombreCompleto" TEXT NOT NULL,
    "telefono" TEXT NOT NULL,
    "email" TEXT,
    "estado" "EstadoSolicitudActualizacion" NOT NULL DEFAULT 'pendiente',
    "socioVinculadoId" TEXT,
    "motivoRechazo" TEXT,
    "ip" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revisadoPorId" TEXT,
    "revisadoEn" TIMESTAMP(3),

    CONSTRAINT "SolicitudRegistroPublico_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SolicitudRegistroPublico_estado_idx" ON "SolicitudRegistroPublico"("estado");
CREATE INDEX "SolicitudRegistroPublico_numeroDocumento_idx" ON "SolicitudRegistroPublico"("numeroDocumento");

-- AddForeignKey
ALTER TABLE "SolicitudRegistroPublico" ADD CONSTRAINT "SolicitudRegistroPublico_socioVinculadoId_fkey" FOREIGN KEY ("socioVinculadoId") REFERENCES "Socio"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SolicitudRegistroPublico" ADD CONSTRAINT "SolicitudRegistroPublico_revisadoPorId_fkey" FOREIGN KEY ("revisadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Máximo UNA pendiente por DNI.
CREATE UNIQUE INDEX "RegistroPublico_unico_pendiente_por_doc"
  ON "SolicitudRegistroPublico"("numeroDocumento")
  WHERE estado = 'pendiente';
