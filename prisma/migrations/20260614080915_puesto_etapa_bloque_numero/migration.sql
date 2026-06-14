-- CreateEnum
CREATE TYPE "BandaPuesto" AS ENUM ('alta', 'media', 'baja');
CREATE TYPE "DimensionPuesto" AS ENUM ('d3x5', 'd3x3');
CREATE TYPE "Giro" AS ENUM ('verduras', 'abarrotes', 'carnes', 'pescados', 'comidas', 'ropa', 'calzado', 'ferreteria', 'productos_region', 'juguetes', 'flores_plantas', 'otros');

-- Nuevas columnas (nullable para poder backfillear filas existentes)
ALTER TABLE "Puesto" ADD COLUMN "etapa" INTEGER;
ALTER TABLE "Puesto" ADD COLUMN "bloque" TEXT;
ALTER TABLE "Puesto" ADD COLUMN "numero" INTEGER;
ALTER TABLE "Puesto" ADD COLUMN "banda" "BandaPuesto";
ALTER TABLE "Puesto" ADD COLUMN "dimension" "DimensionPuesto";
ALTER TABLE "Puesto" ADD COLUMN "giro_new" "Giro";

-- Backfill desde el codigo actual ('A-12') y el giro string
UPDATE "Puesto" SET
  "etapa" = 1,
  "bloque" = upper(split_part("codigo", '-', 1)),
  "numero" = NULLIF(split_part("codigo", '-', 2), '')::int,
  "banda" = 'alta',
  "dimension" = 'd3x5',
  "giro_new" = CASE lower(coalesce("giro", ''))
      WHEN 'abarrotes' THEN 'abarrotes'::"Giro"
      WHEN 'verduras' THEN 'verduras'::"Giro"
      WHEN 'carnes' THEN 'carnes'::"Giro"
      ELSE 'otros'::"Giro" END,
  "codigo" = 'E1-' || upper(split_part("codigo", '-', 1)) || '-' || split_part("codigo", '-', 2),
  "searchKey" = lower('e1-' || split_part("codigo", '-', 1) || '-' || split_part("codigo", '-', 2))
WHERE "numero" IS NULL;

-- Reemplazar giro string por enum
ALTER TABLE "Puesto" DROP COLUMN "giro";
ALTER TABLE "Puesto" RENAME COLUMN "giro_new" TO "giro";

-- Quitar columnas obsoletas
ALTER TABLE "Puesto" DROP COLUMN "zona";
ALTER TABLE "Puesto" DROP COLUMN "area";

-- NOT NULL tras backfill
ALTER TABLE "Puesto" ALTER COLUMN "etapa" SET NOT NULL;
ALTER TABLE "Puesto" ALTER COLUMN "bloque" SET NOT NULL;
ALTER TABLE "Puesto" ALTER COLUMN "numero" SET NOT NULL;
ALTER TABLE "Puesto" ALTER COLUMN "banda" SET NOT NULL;
ALTER TABLE "Puesto" ALTER COLUMN "dimension" SET NOT NULL;

-- Indices
CREATE INDEX "Puesto_etapa_bloque_idx" ON "Puesto"("etapa", "bloque");
CREATE INDEX "Puesto_giro_idx" ON "Puesto"("giro");
CREATE UNIQUE INDEX "Puesto_etapa_bloque_numero_key" ON "Puesto"("etapa", "bloque", "numero");
