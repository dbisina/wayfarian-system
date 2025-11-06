-- Add coverPhotoURL to groups table
ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "coverPhotoURL" TEXT;
