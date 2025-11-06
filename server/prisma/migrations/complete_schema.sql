-- Complete Schema Migration for Wayfarian
-- Run this in Supabase Dashboard > SQL Editor
-- Creates all tables if they don't exist

-- ============================================
-- ENUMS
-- ============================================

DO $$ BEGIN
  CREATE TYPE "JourneyStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "GroupJourneyStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "GroupRole" AS ENUM ('CREATOR', 'ADMIN', 'MEMBER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "RideEventType" AS ENUM ('MESSAGE', 'PHOTO', 'CHECKPOINT', 'STATUS', 'EMERGENCY', 'CUSTOM');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============================================
-- BASE TABLES (no dependencies)
-- ============================================

-- Users table
CREATE TABLE IF NOT EXISTS "users" (
    "id" TEXT NOT NULL,
    "firebaseUid" TEXT NOT NULL UNIQUE,
    "email" TEXT UNIQUE,
    "phoneNumber" TEXT UNIQUE,
    "displayName" TEXT,
    "photoURL" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "totalDistance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalTime" INTEGER NOT NULL DEFAULT 0,
    "topSpeed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalTrips" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- Groups table
CREATE TABLE IF NOT EXISTS "groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "code" TEXT NOT NULL UNIQUE,
    "creatorId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "maxMembers" INTEGER NOT NULL DEFAULT 10,
    "allowLocationSharing" BOOLEAN NOT NULL DEFAULT true,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- ============================================
-- TABLES WITH USER/GROUP DEPENDENCIES
-- ============================================

-- Journeys table
CREATE TABLE IF NOT EXISTS "journeys" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "status" "JourneyStatus" NOT NULL DEFAULT 'ACTIVE',
    "totalDistance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalTime" INTEGER NOT NULL DEFAULT 0,
    "avgSpeed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "topSpeed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "startLatitude" DOUBLE PRECISION NOT NULL,
    "startLongitude" DOUBLE PRECISION NOT NULL,
    "endLatitude" DOUBLE PRECISION,
    "endLongitude" DOUBLE PRECISION,
    "routePoints" JSONB,
    "vehicle" TEXT,
    "weatherData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "groupId" TEXT,

    CONSTRAINT "journeys_pkey" PRIMARY KEY ("id")
);

-- Photos table
CREATE TABLE IF NOT EXISTS "photos" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "journeyId" TEXT,
    "filename" TEXT NOT NULL,
    "originalName" TEXT,
    "firebasePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "takenAt" TIMESTAMP(3) NOT NULL,
    "deviceInfo" JSONB,
    "thumbnailPath" TEXT,
    "isProcessed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "photos_pkey" PRIMARY KEY ("id")
);

-- Group Members table
CREATE TABLE IF NOT EXISTS "group_members" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "role" "GroupRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLatitude" DOUBLE PRECISION,
    "lastLongitude" DOUBLE PRECISION,
    "lastSeen" TIMESTAMP(3),
    "isLocationShared" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "group_members_pkey" PRIMARY KEY ("id")
);

-- Group Journeys table
CREATE TABLE IF NOT EXISTS "group_journeys" (
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

-- Journey Instances table
CREATE TABLE IF NOT EXISTS "journey_instances" (
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

-- Journey Photos table
CREATE TABLE IF NOT EXISTS "journey_photos" (
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

-- Ride Events table
CREATE TABLE IF NOT EXISTS "ride_events" (
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

-- ============================================
-- INDEXES
-- ============================================

-- Groups indexes
CREATE INDEX IF NOT EXISTS "groups_creatorId_idx" ON "groups"("creatorId");
CREATE INDEX IF NOT EXISTS "groups_isActive_idx" ON "groups"("isActive");

-- Group Members indexes
CREATE UNIQUE INDEX IF NOT EXISTS "group_members_userId_groupId_key" ON "group_members"("userId", "groupId");
CREATE INDEX IF NOT EXISTS "group_members_userId_idx" ON "group_members"("userId");
CREATE INDEX IF NOT EXISTS "group_members_groupId_idx" ON "group_members"("groupId");

-- Group Journeys indexes
CREATE INDEX IF NOT EXISTS "group_journeys_groupId_idx" ON "group_journeys"("groupId");
CREATE INDEX IF NOT EXISTS "group_journeys_creatorId_idx" ON "group_journeys"("creatorId");
CREATE INDEX IF NOT EXISTS "group_journeys_status_idx" ON "group_journeys"("status");

-- Journey Instances indexes
CREATE UNIQUE INDEX IF NOT EXISTS "journey_instances_groupJourneyId_userId_key" ON "journey_instances"("groupJourneyId", "userId");
CREATE INDEX IF NOT EXISTS "journey_instances_userId_idx" ON "journey_instances"("userId");
CREATE INDEX IF NOT EXISTS "journey_instances_status_idx" ON "journey_instances"("status");

-- Journey Photos indexes
CREATE INDEX IF NOT EXISTS "journey_photos_instanceId_idx" ON "journey_photos"("instanceId");
CREATE INDEX IF NOT EXISTS "journey_photos_userId_idx" ON "journey_photos"("userId");

-- Ride Events indexes
CREATE INDEX IF NOT EXISTS "ride_events_groupJourneyId_idx" ON "ride_events"("groupJourneyId");
CREATE INDEX IF NOT EXISTS "ride_events_instanceId_idx" ON "ride_events"("instanceId");
CREATE INDEX IF NOT EXISTS "ride_events_userId_idx" ON "ride_events"("userId");
CREATE INDEX IF NOT EXISTS "ride_events_type_idx" ON "ride_events"("type");

-- ============================================
-- FOREIGN KEY CONSTRAINTS
-- ============================================

-- Groups
DO $$ BEGIN
  ALTER TABLE "groups" ADD CONSTRAINT "groups_creatorId_fkey" 
    FOREIGN KEY ("creatorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Journeys
DO $$ BEGIN
  ALTER TABLE "journeys" ADD CONSTRAINT "journeys_userId_fkey" 
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "journeys" ADD CONSTRAINT "journeys_groupId_fkey" 
    FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Photos
DO $$ BEGIN
  ALTER TABLE "photos" ADD CONSTRAINT "photos_userId_fkey" 
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "photos" ADD CONSTRAINT "photos_journeyId_fkey" 
    FOREIGN KEY ("journeyId") REFERENCES "journeys"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Group Members
DO $$ BEGIN
  ALTER TABLE "group_members" ADD CONSTRAINT "group_members_userId_fkey" 
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "group_members" ADD CONSTRAINT "group_members_groupId_fkey" 
    FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Group Journeys
DO $$ BEGIN
  ALTER TABLE "group_journeys" ADD CONSTRAINT "group_journeys_groupId_fkey" 
    FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Journey Instances
DO $$ BEGIN
  ALTER TABLE "journey_instances" ADD CONSTRAINT "journey_instances_groupJourneyId_fkey" 
    FOREIGN KEY ("groupJourneyId") REFERENCES "group_journeys"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Journey Photos
DO $$ BEGIN
  ALTER TABLE "journey_photos" ADD CONSTRAINT "journey_photos_instanceId_fkey" 
    FOREIGN KEY ("instanceId") REFERENCES "journey_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Ride Events
DO $$ BEGIN
  ALTER TABLE "ride_events" ADD CONSTRAINT "ride_events_groupJourneyId_fkey" 
    FOREIGN KEY ("groupJourneyId") REFERENCES "group_journeys"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "ride_events" ADD CONSTRAINT "ride_events_instanceId_fkey" 
    FOREIGN KEY ("instanceId") REFERENCES "journey_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "ride_events" ADD CONSTRAINT "ride_events_userId_fkey" 
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============================================
-- VERIFICATION
-- ============================================

SELECT 
    schemaname,
    tablename
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;
