-- AlterEnum
ALTER TYPE "JourneyStatus" ADD VALUE 'READY_TO_START';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "expoPushToken" TEXT;

-- CreateTable
CREATE TABLE "journey_reminders" (
    "id" TEXT NOT NULL,
    "journeyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journey_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "journey_reminders_journeyId_idx" ON "journey_reminders"("journeyId");

-- CreateIndex
CREATE UNIQUE INDEX "journey_reminders_journeyId_type_key" ON "journey_reminders"("journeyId", "type");

-- AddForeignKey
ALTER TABLE "journey_reminders" ADD CONSTRAINT "journey_reminders_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "journeys"("id") ON DELETE CASCADE ON UPDATE CASCADE;
