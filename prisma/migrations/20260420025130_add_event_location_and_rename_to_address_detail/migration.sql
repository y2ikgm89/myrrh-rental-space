-- Rename existing column to preserve data (was a free-text field, now addressDetail for consistency with spaces.addressDetail)
ALTER TABLE "events" RENAME COLUMN "location" TO "addressDetail";

-- Add new locationId FK column (nullable — events can be at external venues)
ALTER TABLE "events" ADD COLUMN "locationId" UUID;

-- Index + FK
CREATE INDEX "events_locationId_idx" ON "events"("locationId");
ALTER TABLE "events" ADD CONSTRAINT "events_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
