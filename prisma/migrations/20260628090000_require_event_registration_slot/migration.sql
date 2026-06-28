-- Event registrations are now slot-scoped. Legacy rows without a slot cannot
-- be represented in the cleaned model and are intentionally removed.
DELETE FROM "event_registrations"
WHERE "slotId" IS NULL;

ALTER TABLE "event_registrations"
ALTER COLUMN "slotId" SET NOT NULL;
