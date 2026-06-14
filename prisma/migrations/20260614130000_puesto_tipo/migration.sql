-- CreateEnum
CREATE TYPE "TipoEspacio" AS ENUM ('puesto', 'sshh', 'almacen');

-- AlterTable
ALTER TABLE "Puesto" ADD COLUMN     "tipo" "TipoEspacio" NOT NULL DEFAULT 'puesto';
