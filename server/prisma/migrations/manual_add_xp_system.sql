-- Add XP and Level system to users
-- Migration: manual_add_xp_system.sql

-- Add xp column with default 0 (PostgreSQL syntax)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='xp') THEN
    ALTER TABLE users ADD COLUMN xp INTEGER DEFAULT 0 NOT NULL;
  END IF;
END $$;

-- Add level column with default 1
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='level') THEN
    ALTER TABLE users ADD COLUMN level INTEGER DEFAULT 1 NOT NULL;
  END IF;
END $$;

-- Create index for leaderboard queries
CREATE INDEX IF NOT EXISTS idx_users_xp ON users(xp DESC);
CREATE INDEX IF NOT EXISTS idx_users_level ON users(level DESC);
