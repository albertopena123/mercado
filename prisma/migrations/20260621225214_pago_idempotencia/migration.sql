-- CreateTable
CREATE TABLE "PagoIdempotencia" (
    "key" TEXT NOT NULL,
    "socioId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PagoIdempotencia_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "PagoIdempotencia_createdAt_idx" ON "PagoIdempotencia"("createdAt");
