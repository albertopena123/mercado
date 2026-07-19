-- AlterEnum
ALTER TYPE "EstadoCuota" ADD VALUE 'exonerada';

-- AlterTable
ALTER TABLE "Cuota" ADD COLUMN     "motivo" TEXT;
