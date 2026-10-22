-- CreateTable
CREATE TABLE "vehicle_service_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'service',
    "doneAt" TIMESTAMP(3) NOT NULL,
    "odometerM" DOUBLE PRECISION NOT NULL,
    "intervalKm" INTEGER NOT NULL DEFAULT 2500,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_service_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vehicle_service_logs_vehicleId_doneAt_idx" ON "vehicle_service_logs"("vehicleId", "doneAt");

-- CreateIndex
CREATE INDEX "vehicle_service_logs_userId_idx" ON "vehicle_service_logs"("userId");

-- AddForeignKey
ALTER TABLE "vehicle_service_logs" ADD CONSTRAINT "vehicle_service_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_service_logs" ADD CONSTRAINT "vehicle_service_logs_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

