-- Event reservations are slot-scoped. This migration intentionally removes
-- legacy ambiguity and turns schedule shape into an explicit DB invariant.

CREATE TYPE "EventScheduleMode" AS ENUM ('SINGLE_OCCURRENCE', 'TIMED_ENTRY');

ALTER TABLE "events"
ADD COLUMN "scheduleMode" "EventScheduleMode";

-- Slot timestamps are timestamptz, so deadline must use the same instant-based
-- type before DB-level comparisons are introduced.
ALTER TABLE "events"
-- squawk-ignore changing-column-type
ALTER COLUMN "registrationDeadline" TYPE TIMESTAMPTZ(6)
USING "registrationDeadline" AT TIME ZONE 'UTC';

-- Events without any slot cannot be represented in the cleaned model.
DELETE FROM "events"
WHERE NOT EXISTS (
  SELECT 1
  FROM "event_time_slots"
  WHERE "event_time_slots"."eventId" = "events"."id"
);

-- Slots with non-positive duration are invalid. Deleting the parent event keeps
-- registrations, tickets, and slots consistent through existing cascades.
DELETE FROM "events"
WHERE EXISTS (
  SELECT 1
  FROM "event_time_slots"
  WHERE "event_time_slots"."eventId" = "events"."id"
    AND "event_time_slots"."endAt" <= "event_time_slots"."startAt"
);

-- Normalize historical scalar-domain violations before adding constraints.
UPDATE "event_time_slots"
SET "capacity" = 1
WHERE "capacity" < 1;

UPDATE "event_tickets"
SET "price" = 0
WHERE "price" < 0;

UPDATE "event_tickets"
SET "capacity" = NULL
WHERE "capacity" IS NOT NULL
  AND "capacity" < 1;

UPDATE "event_tickets"
SET "unitSize" = 1
WHERE "unitSize" < 1;

UPDATE "event_registrations"
SET "quantity" = 1
WHERE "quantity" < 1;

UPDATE "events"
SET "registrationDeadline" = NULL
WHERE "registrationDeadline" IS NOT NULL
  AND "registrationDeadline" > (
    SELECT MIN("event_time_slots"."startAt")
    FROM "event_time_slots"
    WHERE "event_time_slots"."eventId" = "events"."id"
  );

UPDATE "events"
SET "scheduleMode" = CASE
  WHEN (
    SELECT COUNT(*)
    FROM "event_time_slots"
    WHERE "event_time_slots"."eventId" = "events"."id"
  ) >= 2 THEN 'TIMED_ENTRY'::"EventScheduleMode"
  ELSE 'SINGLE_OCCURRENCE'::"EventScheduleMode"
END;

ALTER TABLE "events"
-- squawk-ignore adding-not-nullable-field
ALTER COLUMN "scheduleMode" SET NOT NULL;

ALTER TABLE "event_time_slots"
ADD CONSTRAINT "event_time_slots_capacity_positive"
CHECK ("capacity" >= 1);

ALTER TABLE "event_time_slots"
ADD CONSTRAINT "event_time_slots_time_order"
CHECK ("startAt" < "endAt");

ALTER TABLE "event_tickets"
ADD CONSTRAINT "event_tickets_price_non_negative"
CHECK ("price" >= 0);

ALTER TABLE "event_tickets"
ADD CONSTRAINT "event_tickets_capacity_positive_or_null"
CHECK ("capacity" IS NULL OR "capacity" >= 1);

ALTER TABLE "event_tickets"
ADD CONSTRAINT "event_tickets_unit_size_positive"
CHECK ("unitSize" >= 1);

ALTER TABLE "event_registrations"
ADD CONSTRAINT "event_registrations_quantity_positive"
CHECK ("quantity" >= 1);

COMMENT ON COLUMN "events"."scheduleMode" IS
'SINGLE_OCCURRENCE = exactly one EventTimeSlot; TIMED_ENTRY = two or more EventTimeSlot rows. Registrations always attach to EventTimeSlot.';

COMMENT ON COLUMN "events"."registrationDeadline" IS
'Optional registration deadline as an instant. When null, registration closes at the first slot start.';

COMMENT ON CONSTRAINT "event_time_slots_capacity_positive" ON "event_time_slots" IS
'EventTimeSlot.capacity is a positive concrete seat count; zero is intentionally invalid.';

COMMENT ON CONSTRAINT "event_time_slots_time_order" ON "event_time_slots" IS
'EventTimeSlot.startAt must be earlier than endAt.';

COMMENT ON CONSTRAINT "event_tickets_price_non_negative" ON "event_tickets" IS
'EventTicket.price is stored as a non-negative integer amount.';

COMMENT ON CONSTRAINT "event_tickets_capacity_positive_or_null" ON "event_tickets" IS
'EventTicket.capacity is null for no ticket-level cap, otherwise positive.';

COMMENT ON CONSTRAINT "event_tickets_unit_size_positive" ON "event_tickets" IS
'EventTicket.unitSize must be positive.';

COMMENT ON CONSTRAINT "event_registrations_quantity_positive" ON "event_registrations" IS
'EventRegistration.quantity must be positive.';

CREATE OR REPLACE FUNCTION "check_event_schedule_integrity"("targetEventId" text)
RETURNS void AS $$
DECLARE
  current_mode "EventScheduleMode";
  current_deadline timestamp with time zone;
  slot_count integer;
  first_slot_start timestamp with time zone;
BEGIN
  SELECT "scheduleMode", "registrationDeadline"
  INTO current_mode, current_deadline
  FROM "events"
  WHERE "id" = "targetEventId"
    AND "deletedAt" IS NULL;

  IF current_mode IS NULL THEN
    RETURN;
  END IF;

  SELECT COUNT(*), MIN("startAt")
  INTO slot_count, first_slot_start
  FROM "event_time_slots"
  WHERE "eventId" = "targetEventId";

  IF current_mode = 'SINGLE_OCCURRENCE' AND slot_count <> 1 THEN
    RAISE EXCEPTION
      'SINGLE_OCCURRENCE events must have exactly one EventTimeSlot; eventId=%, slot_count=%',
      "targetEventId",
      slot_count
      USING ERRCODE = '23514';
  END IF;

  IF current_mode = 'TIMED_ENTRY' AND slot_count < 2 THEN
    RAISE EXCEPTION
      'TIMED_ENTRY events must have at least two EventTimeSlot rows; eventId=%, slot_count=%',
      "targetEventId",
      slot_count
      USING ERRCODE = '23514';
  END IF;

  IF current_deadline IS NOT NULL
    AND first_slot_start IS NOT NULL
    AND current_deadline > first_slot_start THEN
    RAISE EXCEPTION
      'Event registrationDeadline must be on or before the first slot start; eventId=%',
      "targetEventId"
      USING ERRCODE = '23514';
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "check_event_schedule_integrity_from_event"()
RETURNS trigger AS $$
BEGIN
  PERFORM "check_event_schedule_integrity"(NEW."id");
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "check_event_schedule_integrity_from_slot"()
RETURNS trigger AS $$
DECLARE
  target_event_id text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_event_id := OLD."eventId";
    PERFORM "check_event_schedule_integrity"(target_event_id);
    RETURN OLD;
  END IF;

  target_event_id := NEW."eventId";
  PERFORM "check_event_schedule_integrity"(target_event_id);

  IF TG_OP = 'UPDATE' AND OLD."eventId" <> NEW."eventId" THEN
    PERFORM "check_event_schedule_integrity"(OLD."eventId");
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "events_schedule_integrity_check"
AFTER INSERT OR UPDATE OF "scheduleMode", "deletedAt", "registrationDeadline" ON "events"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "check_event_schedule_integrity_from_event"();

CREATE CONSTRAINT TRIGGER "event_time_slots_schedule_integrity_check"
AFTER INSERT OR UPDATE OF "eventId", "startAt" OR DELETE ON "event_time_slots"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "check_event_schedule_integrity_from_slot"();

COMMENT ON FUNCTION "check_event_schedule_integrity"(text) IS
'Deferred DB invariant: SINGLE_OCCURRENCE has exactly one EventTimeSlot, TIMED_ENTRY has two or more, and registrationDeadline is not after the first slot start.';
