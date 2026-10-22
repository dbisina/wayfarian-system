-- CreateEnum
CREATE TYPE "GroupRideStatus" AS ENUM ('PLANNED', 'ACTIVE', 'ENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GroupRideRole" AS ENUM ('LEADER', 'MEMBER');

-- CreateTable
CREATE TABLE "group_rides" (
    "id" TEXT NOT NULL,
    "leaderId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "GroupRideStatus" NOT NULL DEFAULT 'PLANNED',
    "maxParticipants" INTEGER NOT NULL DEFAULT 20,
    "destinationName" TEXT,
    "destinationLat" DOUBLE PRECISION,
    "destinationLng" DOUBLE PRECISION,
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "group_rides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_ride_participants" (
    "id" TEXT NOT NULL,
    "groupRideId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "GroupRideRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "group_ride_participants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "group_rides_code_key" ON "group_rides"("code");

-- CreateIndex
CREATE INDEX "group_rides_leaderId_idx" ON "group_rides"("leaderId");

-- CreateIndex
CREATE INDEX "group_rides_status_updatedAt_idx" ON "group_rides"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "group_ride_participants_groupRideId_userId_key" ON "group_ride_participants"("groupRideId", "userId");

-- CreateIndex
CREATE INDEX "group_ride_participants_userId_leftAt_idx" ON "group_ride_participants"("userId", "leftAt");

-- CreateIndex
CREATE INDEX "rides_groupRideId_idx" ON "rides"("groupRideId");

-- AddForeignKey
ALTER TABLE "group_rides" ADD CONSTRAINT "group_rides_leaderId_fkey" FOREIGN KEY ("leaderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_ride_participants" ADD CONSTRAINT "group_ride_participants_groupRideId_fkey" FOREIGN KEY ("groupRideId") REFERENCES "group_rides"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_ride_participants" ADD CONSTRAINT "group_ride_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rides" ADD CONSTRAINT "rides_groupRideId_fkey" FOREIGN KEY ("groupRideId") REFERENCES "group_rides"("id") ON DELETE SET NULL ON UPDATE CASCADE;
