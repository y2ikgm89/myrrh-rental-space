-- Complete the Customer.emailCanonical contract.
-- All runtime writes set emailCanonical from normalizeEmailForIdentity(email).
-- Existing rows are backfilled before the column is made required.
-- squawk-ignore-file adding-not-nullable-field

UPDATE "customers" SET "emailCanonical" = lower(btrim("email"))
WHERE "emailCanonical" IS NULL OR btrim("emailCanonical") = '';

ALTER TABLE "customers"
    ALTER COLUMN "emailCanonical" SET NOT NULL,
    ADD CONSTRAINT "customers_emailCanonical_not_empty_check"
        CHECK (btrim("emailCanonical") <> '');
