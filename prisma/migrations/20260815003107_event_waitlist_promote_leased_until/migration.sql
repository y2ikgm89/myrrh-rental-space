BEGIN;

ALTER TABLE "events" ADD COLUMN "waitlist_promote_leased_until" TIMESTAMPTZ(6);

COMMIT;
