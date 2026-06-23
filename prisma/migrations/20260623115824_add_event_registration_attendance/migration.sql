-- AlterTable
ALTER TABLE "event_registrations" ADD COLUMN     "attendedAt" TIMESTAMP(3),
ALTER COLUMN "email" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "event_registrations_eventId_attendedAt_idx" ON "event_registrations"("eventId", "attendedAt");
