-- CreateTable
CREATE TABLE "ride_achievements" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "achievementId" TEXT NOT NULL,
    "rideId" TEXT,
    "xpAwarded" INTEGER NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ride_achievements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ride_achievements_userId_earnedAt_idx" ON "ride_achievements"("userId", "earnedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ride_achievements_userId_achievementId_key" ON "ride_achievements"("userId", "achievementId");

-- AddForeignKey
ALTER TABLE "ride_achievements" ADD CONSTRAINT "ride_achievements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

