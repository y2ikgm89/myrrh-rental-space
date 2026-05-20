-- CreateTable: event_tickets
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE "event_tickets" (
    "id" VARCHAR(30) NOT NULL,
    "eventId" VARCHAR(30) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "price" INTEGER NOT NULL,
    "capacity" INTEGER,
    "unitSize" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_tickets_eventId_sortOrder_idx" ON "event_tickets"("eventId", "sortOrder");
CREATE INDEX "event_tickets_eventId_isAvailable_idx" ON "event_tickets"("eventId", "isAvailable");

-- AddForeignKey: event_tickets -> events
ALTER TABLE "event_tickets" ADD CONSTRAINT "event_tickets_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate existing events: create one default ticket per event that had no price
-- Events with price = NULL get price = 0 (free) ticket
INSERT INTO "event_tickets" ("id", "eventId", "name", "price", "capacity", "sortOrder", "isAvailable", "createdAt", "updatedAt")
SELECT
    'tk' || substring(replace(gen_random_uuid()::text, '-', '') from 1 for 28),
    id,
    title,
    COALESCE(price, 0),
    capacity,
    0,
    true,
    NOW(),
    NOW()
FROM "events";

-- AlterTable: event_registrations - add ticketId and quantity, drop numberOfPeople
ALTER TABLE "event_registrations" ADD COLUMN "ticketId" VARCHAR(30);
ALTER TABLE "event_registrations" ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 1;

-- Migrate quantity from numberOfPeople
UPDATE "event_registrations" SET "quantity" = "numberOfPeople";

-- Set ticketId to the default ticket for each event
UPDATE "event_registrations" er
SET "ticketId" = (
    SELECT et.id FROM "event_tickets" et
    WHERE et."eventId" = er."eventId"
    ORDER BY et."sortOrder" ASC
    LIMIT 1
);

-- Delete registrations that could not get a ticketId (orphaned)
DELETE FROM "event_registrations" WHERE "ticketId" IS NULL;

-- Make ticketId NOT NULL
ALTER TABLE "event_registrations" ALTER COLUMN "ticketId" SET NOT NULL;

-- AddForeignKey: event_registrations -> event_tickets
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "event_tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex: event_registrations.ticketId
CREATE INDEX "event_registrations_ticketId_idx" ON "event_registrations"("ticketId");

-- Drop numberOfPeople column
ALTER TABLE "event_registrations" DROP COLUMN "numberOfPeople";

-- Drop price from events
ALTER TABLE "events" DROP COLUMN IF EXISTS "price";
