-- AlterTable: N.° de operación / recibo registrado al pagar la cuota.
ALTER TABLE "Cuota" ADD COLUMN "nroOperacion" TEXT;

-- Unicidad del N.° de operación entre cuotas de AUTOVALÚO: un mismo recibo no
-- puede usarse para pagar el autovalúo de otro año/socio (control antifraude).
-- Índice parcial: solo aplica a cuotas de autovalúo con N.° de operación.
CREATE UNIQUE INDEX "Cuota_autovaluo_nroOperacion_key"
  ON "Cuota" ("nroOperacion")
  WHERE "nroOperacion" IS NOT NULL AND concepto ILIKE '%autoval%';
