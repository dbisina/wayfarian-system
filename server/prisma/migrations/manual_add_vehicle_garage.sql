-- Migration: Add Vehicle Garage feature
-- Run this manually when the DB is available if prisma migrate dev fails

-- Create vehicles table
CREATE TABLE IF NOT EXISTS "vehicles" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "make"      TEXT NOT NULL,
  "model"     TEXT NOT NULL,
  "year"      INTEGER,
  "color"     TEXT,
  "type"      TEXT NOT NULL DEFAULT 'motorcycle',
  "photoURL"  TEXT,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- Foreign key: vehicle → user
ALTER TABLE "vehicles"
  ADD CONSTRAINT "vehicles_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Indexes
CREATE INDEX IF NOT EXISTS "vehicles_userId_idx" ON "vehicles"("userId");
CREATE INDEX IF NOT EXISTS "vehicles_userId_isDefault_idx" ON "vehicles"("userId", "isDefault");

-- Add vehicle FK columns to journeys
ALTER TABLE "journeys"
  ADD COLUMN IF NOT EXISTS "vehicleId"   TEXT,
  ADD COLUMN IF NOT EXISTS "vehicleName" TEXT;

-- Foreign key: journey → vehicle (nullable, SET NULL on delete)
ALTER TABLE "journeys"
  ADD CONSTRAINT "journeys_vehicleId_fkey"
  FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
