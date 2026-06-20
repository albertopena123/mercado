-- CreateEnum
CREATE TYPE "TipoConstancia" AS ENUM ('socio_habil', 'no_adeudo');

-- AlterTable
ALTER TABLE "Constancia" ADD COLUMN     "tipo" "TipoConstancia" NOT NULL DEFAULT 'socio_habil';
