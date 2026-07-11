-- Add `dataRetention` JSONB column to Settings singleton row.
--
-- Data-retention feature (feature module `data-retention`, opt-in) reads this
-- JSON to decide how many months of Session / Verification / login_attempts /
-- Reservation.guest* / Inquiry / Customer to keep. Each key is an int; `0`
-- means "never purge that table" (per-field opt-out). Defaults align with our
-- terms templates: Customer 7yr, Reservation.guest* 1yr, Inquiry 3yr,
-- Session/Verification/login_attempts 6mo. Runtime shape enforced by
-- `parseDataRetentionConfig` in src/shared/lib/json-validators.ts.

-- AlterTable
ALTER TABLE "settings" ADD COLUMN "dataRetention" JSONB NOT NULL DEFAULT '{"sessionMonths": 6, "verificationMonths": 6, "loginAttemptMonths": 6, "reservationGuestMonths": 12, "inquiryMonths": 36, "customerInactiveMonths": 84}';

-- Merge the `data-retention` feature module key into the singleton row's
-- featureModules JSONB so admin UI can distinguish "not yet configured"
-- (key absent → fail-closed OFF) from "explicitly OFF" (key = false).
-- Value stays `false` — the feature is opt-in and must be enabled from
-- /admin/settings/features by an operator who has confirmed the retention
-- months match business policy. Idempotent: `||` right-merge overwrites
-- only if the key already exists (safe because this is a new module).
UPDATE "settings"
SET "featureModules" = COALESCE("featureModules", '{}'::jsonb) || '{"data-retention": false}'::jsonb
WHERE "id" = 'singleton';
