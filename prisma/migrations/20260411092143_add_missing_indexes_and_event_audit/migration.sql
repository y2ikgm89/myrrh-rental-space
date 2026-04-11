-- AlterTable
ALTER TABLE "events" ADD COLUMN     "deletedById" UUID;

-- CreateIndex
CREATE INDEX "event_registrations_eventId_status_createdAt_idx" ON "event_registrations"("eventId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "inquiries_createdAt_status_idx" ON "inquiries"("createdAt", "status");

-- CreateIndex
CREATE INDEX "spaces_publishedAt_isActive_idx" ON "spaces"("publishedAt", "isActive");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
