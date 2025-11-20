-- AddForeignKey
ALTER TABLE "journey_instances" ADD CONSTRAINT "journey_instances_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
