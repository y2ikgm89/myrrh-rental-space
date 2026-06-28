-- Customer email is no longer an ownership key.
-- Authenticated ownership is represented by customers.userId.
-- emailCanonical is the stable comparison key for duplicate detection and
-- for reusing unlinked guest customer records.
-- It intentionally stays nullable in this expand migration so the previous
-- Cloud Run revision can keep inserting customers during rollout. The new
-- application always writes emailCanonical; a later contract migration can
-- backfill any rollout-window nulls and make the column NOT NULL.

ALTER TABLE "customers" ADD COLUMN "emailCanonical" TEXT;

UPDATE "customers"
SET "emailCanonical" = lower(btrim("email"));

DROP INDEX IF EXISTS "customers_email_key";

CREATE INDEX "customers_emailCanonical_idx" ON "customers"("emailCanonical");
CREATE INDEX "customers_emailCanonical_userId_idx" ON "customers"("emailCanonical", "userId");

CREATE UNIQUE INDEX "customers_guest_emailCanonical_key"
  ON "customers"("emailCanonical")
  WHERE "userId" IS NULL AND "emailCanonical" IS NOT NULL;
