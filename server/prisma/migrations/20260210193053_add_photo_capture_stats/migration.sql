-- AlterTable
ALTER TABLE "journey_photos" ADD COLUMN     "captureDistance" DOUBLE PRECISION,
ADD COLUMN     "captureHeading" DOUBLE PRECISION,
ADD COLUMN     "captureSpeed" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "photos" ADD COLUMN     "captureDistance" DOUBLE PRECISION,
ADD COLUMN     "captureHeading" DOUBLE PRECISION,
ADD COLUMN     "captureSpeed" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "ride_events" ADD COLUMN     "captureDistance" DOUBLE PRECISION,
ADD COLUMN     "captureSpeed" DOUBLE PRECISION;
