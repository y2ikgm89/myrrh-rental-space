-- L1: Reservation / ReservationSeries / Event / EventRegistration bare timestamps → TIMESTAMPTZ(6)
-- L2: Reservation / Space / SpaceRatePlan / Coupon / Customer money columns → INTEGER (円)
-- Stored TIMESTAMP WITHOUT TIME ZONE values are interpreted as UTC (app SSoT).
-- Money columns: ROUND(numeric)::integer (JPY zero-decimal, Stripe-aligned).

-- reservations EXCLUDE constraint + cross-overlap trigger must drop before column type change
ALTER TABLE "reservations" DROP CONSTRAINT IF EXISTS "reservations_no_active_time_overlap_excl";
DROP TRIGGER IF EXISTS "reservations_no_event_slot_overlap_check" ON "reservations";

-- reservation_series
ALTER TABLE "reservation_series"
  ALTER COLUMN "dtstart" TYPE TIMESTAMPTZ(6) USING "dtstart" AT TIME ZONE 'UTC',
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "cancelledAt" TYPE TIMESTAMPTZ(6) USING "cancelledAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "deletedAt" TYPE TIMESTAMPTZ(6) USING "deletedAt" AT TIME ZONE 'UTC';

-- reservations (timestamps)
ALTER TABLE "reservations"
  ALTER COLUMN "startTime" TYPE TIMESTAMPTZ(6) USING "startTime" AT TIME ZONE 'UTC',
  ALTER COLUMN "endTime" TYPE TIMESTAMPTZ(6) USING "endTime" AT TIME ZONE 'UTC',
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "calendarSyncedAt" TYPE TIMESTAMPTZ(6) USING "calendarSyncedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "deletedAt" TYPE TIMESTAMPTZ(6) USING "deletedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "paidAt" TYPE TIMESTAMPTZ(6) USING "paidAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "paymentInitiatedAt" TYPE TIMESTAMPTZ(6) USING "paymentInitiatedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "cancelledAt" TYPE TIMESTAMPTZ(6) USING "cancelledAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "reminderSentAt" TYPE TIMESTAMPTZ(6) USING "reminderSentAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "smart_lock_reissue_pending_at" TYPE TIMESTAMPTZ(6) USING "smart_lock_reissue_pending_at" AT TIME ZONE 'UTC';

-- reservations (money → integer yen)
ALTER TABLE "reservations"
  ALTER COLUMN "totalPrice" TYPE INTEGER USING ROUND("totalPrice"::numeric)::integer,
  ALTER COLUMN "basePrice" TYPE INTEGER USING ROUND("basePrice"::numeric)::integer,
  ALTER COLUMN "couponDiscountAmount" TYPE INTEGER USING ROUND("couponDiscountAmount"::numeric)::integer,
  ALTER COLUMN "durationDiscountAmount" TYPE INTEGER USING ROUND("durationDiscountAmount"::numeric)::integer,
  ALTER COLUMN "spaceDiscountAmount" TYPE INTEGER USING ROUND("spaceDiscountAmount"::numeric)::integer,
  ALTER COLUMN "taxAmount" TYPE INTEGER USING ROUND("taxAmount"::numeric)::integer,
  ALTER COLUMN "totalPriceWithTax" TYPE INTEGER USING ROUND("totalPriceWithTax"::numeric)::integer;

ALTER TABLE "reservations"
ADD CONSTRAINT "reservations_no_active_time_overlap_excl"
EXCLUDE USING gist (
  "spaceId" WITH =,
  tstzrange("startTime", "endTime", '[)') WITH &&
)
WHERE (
  "deletedAt" IS NULL
  AND "status" IN (
    'PENDING'::"ReservationStatus",
    'CONFIRMED'::"ReservationStatus"
  )
);

-- squawk-ignore prefer-robust-stmts
CREATE CONSTRAINT TRIGGER reservations_no_event_slot_overlap_check
AFTER INSERT OR UPDATE OF "spaceId", "startTime", "endTime", status, "deletedAt"
ON reservations
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION check_reservation_no_event_slot_overlap();

-- events
DROP TRIGGER IF EXISTS "events_schedule_integrity_check" ON "events";
DROP TRIGGER IF EXISTS "events_no_reservation_overlap_check" ON "events";

ALTER TABLE "events"
  ALTER COLUMN "publishedAt" TYPE TIMESTAMPTZ(6) USING "publishedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "deletedAt" TYPE TIMESTAMPTZ(6) USING "deletedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

-- squawk-ignore prefer-robust-stmts
CREATE CONSTRAINT TRIGGER "events_schedule_integrity_check"
AFTER INSERT OR UPDATE OF "scheduleMode", "deletedAt", "registrationDeadline" ON "events"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "check_event_schedule_integrity_from_event"();

-- squawk-ignore prefer-robust-stmts
CREATE CONSTRAINT TRIGGER events_no_reservation_overlap_check
AFTER INSERT OR UPDATE OF "spaceId", status, "deletedAt"
ON events
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION check_event_no_reservation_overlap();

-- event_registrations
ALTER TABLE "event_registrations"
  ALTER COLUMN "cancelledAt" TYPE TIMESTAMPTZ(6) USING "cancelledAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "attendedAt" TYPE TIMESTAMPTZ(6) USING "attendedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "reminderSentAt" TYPE TIMESTAMPTZ(6) USING "reminderSentAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "paidAt" TYPE TIMESTAMPTZ(6) USING "paidAt" AT TIME ZONE 'UTC';

-- spaces
ALTER TABLE "spaces"
  ALTER COLUMN "hourlyPrice" TYPE INTEGER USING ROUND("hourlyPrice"::numeric)::integer,
  ALTER COLUMN "discountValue" TYPE INTEGER USING ROUND("discountValue"::numeric)::integer;

-- space_rate_plans
ALTER TABLE "space_rate_plans"
  ALTER COLUMN "hourlyPrice" TYPE INTEGER USING ROUND("hourlyPrice"::numeric)::integer;

-- coupons
ALTER TABLE "coupons"
  ALTER COLUMN "discountValue" TYPE INTEGER USING ROUND("discountValue"::numeric)::integer,
  ALTER COLUMN "minReservationAmount" TYPE INTEGER USING ROUND("minReservationAmount"::numeric)::integer,
  ALTER COLUMN "maxDiscountAmount" TYPE INTEGER USING ROUND("maxDiscountAmount"::numeric)::integer;

-- customers
ALTER TABLE "customers"
  ALTER COLUMN "totalSpent" TYPE INTEGER USING ROUND("totalSpent"::numeric)::integer;
