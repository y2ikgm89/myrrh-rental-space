-- Customer email is no longer an ownership key.
-- Authenticated ownership is represented by customers.userId.
-- emailCanonical is the stable comparison key for duplicate detection and
-- for reusing unlinked guest customer records.

ALTER TABLE "customers" ADD COLUMN "emailCanonical" TEXT;

UPDATE "customers"
SET "emailCanonical" = lower(btrim("email"));

ALTER TABLE "customers" ALTER COLUMN "emailCanonical" SET NOT NULL;

DROP INDEX IF EXISTS "customers_email_key";

CREATE INDEX "customers_emailCanonical_idx" ON "customers"("emailCanonical");
CREATE INDEX "customers_emailCanonical_userId_idx" ON "customers"("emailCanonical", "userId");

CREATE UNIQUE INDEX "customers_guest_emailCanonical_key"
  ON "customers"("emailCanonical")
  WHERE "userId" IS NULL;
