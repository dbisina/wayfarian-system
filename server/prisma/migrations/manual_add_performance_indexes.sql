-- Performance indexes for group journey system
-- Run with: psql $DATABASE_URL -f manual_add_performance_indexes.sql

-- Index for finding active group journeys by group
CREATE INDEX IF NOT EXISTS idx_group_journey_status 
  ON group_journeys ("groupId", status);

-- Index for finding active instances for a journey
CREATE INDEX IF NOT EXISTS idx_instance_active 
  ON journey_instances ("groupJourneyId", status);

-- Index for finding user's instance in a journey
CREATE INDEX IF NOT EXISTS idx_instance_user 
  ON journey_instances ("groupJourneyId", "userId");

-- Index for group membership lookups
CREATE INDEX IF NOT EXISTS idx_group_member 
  ON group_members ("groupId", "userId");

-- Index for finding user's groups
CREATE INDEX IF NOT EXISTS idx_group_member_user 
  ON group_members ("userId");

-- Index for ride events by journey
CREATE INDEX IF NOT EXISTS idx_ride_event_journey 
  ON ride_events ("groupJourneyId", "createdAt" DESC);

-- Index for finding instances by user
CREATE INDEX IF NOT EXISTS idx_instance_by_user 
  ON journey_instances ("userId", status);

-- Index for journey timestamps
CREATE INDEX IF NOT EXISTS idx_group_journey_created 
  ON group_journeys ("createdAt" DESC);
