-- A group ride can belong to a crew (a persistent group), and a crew has a message feed.
ALTER TABLE "group_rides" ADD COLUMN "crewId" TEXT;
CREATE INDEX "group_rides_crewId_status_idx" ON "group_rides"("crewId", "status");
ALTER TABLE "group_rides" ADD CONSTRAINT "group_rides_crewId_fkey" FOREIGN KEY ("crewId") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "group_messages" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "group_messages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "group_messages_groupId_createdAt_idx" ON "group_messages"("groupId", "createdAt");
ALTER TABLE "group_messages" ADD CONSTRAINT "group_messages_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_messages" ADD CONSTRAINT "group_messages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
