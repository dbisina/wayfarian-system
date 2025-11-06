-- Migration: add_ride_events
-- Generated for Supabase (PostgreSQL)
-- Run this in Supabase Dashboard > SQL Editor when local connection fails

-- Create RideEventType enum
CREATE TYPE "RideEventType" AS ENUM ('MESSAGE', 'PHOTO', 'CHECKPOINT', 'STATUS', 'EMERGENCY', 'CUSTOM');

-- Create ride_events table
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

-- Create indexes for ride_events
CREATE INDEX "ride_events_groupJourneyId_idx" ON "ride_events"("groupJourneyId");
CREATE INDEX "ride_events_instanceId_idx" ON "ride_events"("instanceId");
CREATE INDEX "ride_events_userId_idx" ON "ride_events"("userId");
CREATE INDEX "ride_events_type_idx" ON "ride_events"("type");

-- Add foreign key constraints
ALTER TABLE "ride_events" ADD CONSTRAINT "ride_events_groupJourneyId_fkey" 
    FOREIGN KEY ("groupJourneyId") REFERENCES "group_journeys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ride_events" ADD CONSTRAINT "ride_events_instanceId_fkey" 
    FOREIGN KEY ("instanceId") REFERENCES "journey_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ride_events" ADD CONSTRAINT "ride_events_userId_fkey" 
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Verify migration
SELECT 
    'ride_events table created' as status,
    COUNT(*) as row_count 
FROM "ride_events";
