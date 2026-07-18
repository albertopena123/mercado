-- AlterTable
ALTER TABLE "Directivo" ADD COLUMN     "firmaUploadedAt" TIMESTAMP(3),
ADD COLUMN     "firmaUploadedById" TEXT,
ADD COLUMN     "firmaUrl" TEXT;
