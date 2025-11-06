-- CreateEnum
CREATE TYPE "GroupJourneyStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RideEventType" AS ENUM ('MESSAGE', 'PHOTO', 'CHECKPOINT', 'STATUS', 'EMERGENCY', 'CUSTOM');

-- CreateTable
CREATE TABLE "group_journeys" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startLatitude" DOUBLE PRECISION NOT NULL,
    "startLongitude" DOUBLE PRECISION NOT NULL,
    "endLatitude" DOUBLE PRECISION,
    "endLongitude" DOUBLE PRECISION,
    "routePoints" JSONB,
    "status" "GroupJourneyStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "group_journeys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journey_instances" (
    "id" TEXT NOT NULL,
    "groupJourneyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "JourneyStatus" NOT NULL DEFAULT 'ACTIVE',
    "startTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endTime" TIMESTAMP(3),
    "totalDistance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalTime" INTEGER NOT NULL DEFAULT 0,
    "avgSpeed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "topSpeed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentLatitude" DOUBLE PRECISION,
    "currentLongitude" DOUBLE PRECISION,
    "lastLocationUpdate" TIMESTAMP(3),
    "routePoints" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "journey_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journey_photos" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "originalName" TEXT,
    "firebasePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "takenAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journey_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ride_events" (
    "id" TEXT NOT NULL,
    "groupJourneyId" TEXT NOT NULL,
    "instanceId" TEXT,
    "userId" TEXT NOT NULL,
    "type" "RideEventType" NOT NULL,
    "message" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "mediaUrl" TEXT,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ride_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "group_journeys_groupId_idx" ON "group_journeys"("groupId");

-- CreateIndex
CREATE INDEX "group_journeys_creatorId_idx" ON "group_journeys"("creatorId");

-- CreateIndex
CREATE INDEX "group_journeys_status_idx" ON "group_journeys"("status");

-- CreateIndex
CREATE INDEX "journey_instances_userId_idx" ON "journey_instances"("userId");

-- CreateIndex
CREATE INDEX "journey_instances_status_idx" ON "journey_instances"("status");

-- CreateIndex
CREATE UNIQUE INDEX "journey_instances_groupJourneyId_userId_key" ON "journey_instances"("groupJourneyId", "userId");

-- CreateIndex
CREATE INDEX "journey_photos_instanceId_idx" ON "journey_photos"("instanceId");

-- CreateIndex
CREATE INDEX "journey_photos_userId_idx" ON "journey_photos"("userId");

-- CreateIndex
CREATE INDEX "ride_events_groupJourneyId_idx" ON "ride_events"("groupJourneyId");

-- CreateIndex
CREATE INDEX "ride_events_instanceId_idx" ON "ride_events"("instanceId");

-- CreateIndex
CREATE INDEX "ride_events_userId_idx" ON "ride_events"("userId");

-- CreateIndex
CREATE INDEX "ride_events_type_idx" ON "ride_events"("type");

-- AddForeignKey
ALTER TABLE "group_journeys" ADD CONSTRAINT "group_journeys_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journey_instances" ADD CONSTRAINT "journey_instances_groupJourneyId_fkey" FOREIGN KEY ("groupJourneyId") REFERENCES "group_journeys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journey_photos" ADD CONSTRAINT "journey_photos_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "journey_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_events" ADD CONSTRAINT "ride_events_groupJourneyId_fkey" FOREIGN KEY ("groupJourneyId") REFERENCES "group_journeys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_events" ADD CONSTRAINT "ride_events_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "journey_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_events" ADD CONSTRAINT "ride_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
