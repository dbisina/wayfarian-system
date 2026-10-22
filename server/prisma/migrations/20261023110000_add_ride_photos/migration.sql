-- CreateTable
CREATE TABLE "ride_photos" (
    "id" TEXT NOT NULL,
    "rideId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "thumbPath" TEXT NOT NULL,
    "takenAt" TIMESTAMP(3) NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ride_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ride_photos_rideId_takenAt_idx" ON "ride_photos"("rideId", "takenAt");

-- CreateIndex
CREATE INDEX "ride_photos_userId_idx" ON "ride_photos"("userId");

-- AddForeignKey
ALTER TABLE "ride_photos" ADD CONSTRAINT "ride_photos_rideId_fkey" FOREIGN KEY ("rideId") REFERENCES "rides"("id") ON DELETE CASCADE ON UPDATE CASCADE;

