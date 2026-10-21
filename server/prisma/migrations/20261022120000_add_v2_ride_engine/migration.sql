-- CreateEnum
CREATE TYPE "RideStatus" AS ENUM ('RECORDING', 'PAUSED', 'ENDED', 'FINALIZED', 'DELETED');

-- CreateEnum
CREATE TYPE "RideLifecycleType" AS ENUM ('START', 'PAUSE', 'RESUME', 'END');

-- CreateTable
CREATE TABLE "rides" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "groupRideId" TEXT,
    "title" TEXT,
    "status" "RideStatus" NOT NULL DEFAULT 'RECORDING',
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "timezone" TEXT,
    "distanceM" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "movingTimeS" INTEGER NOT NULL DEFAULT 0,
    "elapsedTimeS" INTEGER NOT NULL DEFAULT 0,
    "topSpeedMps" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgSpeedMps" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pointCount" INTEGER NOT NULL DEFAULT 0,
    "statsVersion" INTEGER NOT NULL DEFAULT 1,
    "finalizedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "legacyJourneyId" TEXT,
    "isLegacy" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ride_points" (
    "rideId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "segment" INTEGER NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "accuracy" DOUBLE PRECISION,

    CONSTRAINT "ride_points_pkey" PRIMARY KEY ("rideId","seq")
);

-- CreateTable
CREATE TABLE "ride_lifecycle_events" (
    "id" TEXT NOT NULL,
    "rideId" TEXT NOT NULL,
    "type" "RideLifecycleType" NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ride_lifecycle_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_stats" (
    "userId" TEXT NOT NULL,
    "distanceM" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "movingTimeS" INTEGER NOT NULL DEFAULT 0,
    "elapsedTimeS" INTEGER NOT NULL DEFAULT 0,
    "topSpeedMps" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rides" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_stats_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "xp_ledger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "xp_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rides_legacyJourneyId_key" ON "rides"("legacyJourneyId");

-- CreateIndex
CREATE INDEX "rides_userId_startedAt_idx" ON "rides"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "rides_userId_status_idx" ON "rides"("userId", "status");

-- CreateIndex
CREATE INDEX "rides_status_updatedAt_idx" ON "rides"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "ride_points_rideId_segment_recordedAt_idx" ON "ride_points"("rideId", "segment", "recordedAt");

-- CreateIndex
CREATE INDEX "ride_lifecycle_events_rideId_at_idx" ON "ride_lifecycle_events"("rideId", "at");

-- CreateIndex
CREATE INDEX "xp_ledger_userId_createdAt_idx" ON "xp_ledger"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "xp_ledger_userId_source_key" ON "xp_ledger"("userId", "source");

-- AddForeignKey
ALTER TABLE "rides" ADD CONSTRAINT "rides_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_points" ADD CONSTRAINT "ride_points_rideId_fkey" FOREIGN KEY ("rideId") REFERENCES "rides"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_lifecycle_events" ADD CONSTRAINT "ride_lifecycle_events_rideId_fkey" FOREIGN KEY ("rideId") REFERENCES "rides"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_stats" ADD CONSTRAINT "user_stats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xp_ledger" ADD CONSTRAINT "xp_ledger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

