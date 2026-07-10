-- Space reservations are range reservations, not persisted slot inventory.
-- The database is the final authority for scalar time validity and active
-- reservation overlap. Prisma schema DSL cannot express PostgreSQL EXCLUDE
-- constraints, so this custom SQL migration is intentionally hand-authored.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Impossible reservations cannot be represented in the cleaned model.
DELETE FROM "reservations"
WHERE "endTime" <= "startTime";

-- Intentionally no automated repair of historical active-reservation overlaps.
-- `lockReservationSpaceForTransaction` + the pre-write overlap check make
-- overlapping active reservations for the same space unreachable through any
-- application write path, so none are expected to exist. If the ADD
-- CONSTRAINT below still fails, that means a real duplicate booking slipped
-- through — it must be resolved through the normal cancellation command
-- (`applyCancellationSideEffects`: refund / calendar sync / notification /
-- audit log) by a human, not silently rewritten here.

ALTER TABLE "reservations"
ADD CONSTRAINT "reservations_time_order_check"
CHECK ("startTime" < "endTime");

ALTER TABLE "reservations"
ADD CONSTRAINT "reservations_no_active_time_overlap_excl"
EXCLUDE USING gist (
  "spaceId" WITH =,
  tsrange("startTime", "endTime", '[)') WITH &&
)
WHERE (
  "deletedAt" IS NULL
  AND "status" IN (
    'PENDING'::"ReservationStatus",
    'CONFIRMED'::"ReservationStatus"
  )
);

COMMENT ON CONSTRAINT "reservations_time_order_check" ON "reservations" IS
'Reservation.startTime must be earlier than endTime. Space reservations use half-open intervals [startTime, endTime).';

COMMENT ON CONSTRAINT "reservations_no_active_time_overlap_excl" ON "reservations" IS
'For each space, active non-deleted reservations (PENDING/CONFIRMED) must not overlap. This is the DB authority for double-booking prevention.';
