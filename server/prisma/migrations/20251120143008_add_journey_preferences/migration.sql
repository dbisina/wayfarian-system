-- AlterEnum
ALTER TYPE "JourneyStatus" ADD VALUE 'PLANNED';

-- AlterTable
ALTER TABLE "journeys" ADD COLUMN     "customTitle" TEXT,
ADD COLUMN     "hiddenAt" TIMESTAMP(3),
ADD COLUMN     "isHidden" BOOLEAN NOT NULL DEFAULT false;
