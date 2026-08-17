-- 接続状態を IntegrationHealth へ集約するため旧 12 列を落とす
-- squawk-ignore-file ban-drop-column
BEGIN;

CREATE TYPE "integration_key" AS ENUM (
  'STRIPE',
  'RESEND',
  'TURNSTILE',
  'GOOGLE_MAPS',
  'GOOGLE_CALENDAR',
  'GOOGLE_BUSINESS_PROFILE',
  'INSTAGRAM',
  'SWITCHBOT'
);

CREATE TABLE "integration_healths" (
  "integration" "integration_key" NOT NULL,
  "status" "connection_status",
  "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
  "last_success_at" TIMESTAMPTZ(6),
  "last_failure_at" TIMESTAMPTZ(6),
  "last_error_message" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "integration_healths_pkey" PRIMARY KEY ("integration")
);

ALTER TABLE "integration_healths"
  ADD CONSTRAINT "integration_healths_consecutive_failures_non_negative_check"
  CHECK (("consecutive_failures" >= 0));

INSERT INTO "integration_healths" (
  "integration",
  "status",
  "last_success_at",
  "last_failure_at",
  "created_at",
  "updated_at"
)
SELECT
  'STRIPE'::"integration_key",
  "stripe_connection_status",
  CASE
    WHEN "stripe_connection_status" = 'CONNECTED' THEN "stripe_last_tested_at"
  END,
  CASE
    WHEN "stripe_connection_status" = 'ERROR' THEN "stripe_last_tested_at"
  END,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "settings_stripe"
WHERE "id" = 'singleton'
  AND (
    "stripe_connection_status" IS NOT NULL
    OR "stripe_last_tested_at" IS NOT NULL
  );

INSERT INTO "integration_healths" (
  "integration",
  "status",
  "last_success_at",
  "last_failure_at",
  "created_at",
  "updated_at"
)
SELECT
  'RESEND'::"integration_key",
  "resend_connection_status",
  CASE
    WHEN "resend_connection_status" = 'CONNECTED' THEN "resend_last_tested_at"
  END,
  CASE
    WHEN "resend_connection_status" = 'ERROR' THEN "resend_last_tested_at"
  END,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "settings_resend"
WHERE "id" = 'singleton'
  AND (
    "resend_connection_status" IS NOT NULL
    OR "resend_last_tested_at" IS NOT NULL
  );

INSERT INTO "integration_healths" (
  "integration",
  "status",
  "last_success_at",
  "last_failure_at",
  "created_at",
  "updated_at"
)
SELECT
  'TURNSTILE'::"integration_key",
  "turnstile_connection_status",
  CASE
    WHEN "turnstile_connection_status" = 'CONNECTED' THEN "turnstile_last_tested_at"
  END,
  CASE
    WHEN "turnstile_connection_status" = 'ERROR' THEN "turnstile_last_tested_at"
  END,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "settings_turnstile"
WHERE "id" = 'singleton'
  AND (
    "turnstile_connection_status" IS NOT NULL
    OR "turnstile_last_tested_at" IS NOT NULL
  );

INSERT INTO "integration_healths" (
  "integration",
  "status",
  "last_success_at",
  "last_failure_at",
  "created_at",
  "updated_at"
)
SELECT
  'GOOGLE_MAPS'::"integration_key",
  "google_maps_connection_status",
  CASE
    WHEN "google_maps_connection_status" = 'CONNECTED' THEN "google_maps_last_tested_at"
  END,
  CASE
    WHEN "google_maps_connection_status" = 'ERROR' THEN "google_maps_last_tested_at"
  END,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "settings_google_maps"
WHERE "id" = 'singleton'
  AND (
    "google_maps_connection_status" IS NOT NULL
    OR "google_maps_last_tested_at" IS NOT NULL
  );

INSERT INTO "integration_healths" (
  "integration",
  "status",
  "last_success_at",
  "last_failure_at",
  "created_at",
  "updated_at"
)
SELECT
  'GOOGLE_CALENDAR'::"integration_key",
  "google_calendar_connection_status",
  CASE
    WHEN "google_calendar_connection_status" = 'CONNECTED' THEN "google_calendar_last_tested_at"
  END,
  CASE
    WHEN "google_calendar_connection_status" = 'ERROR' THEN "google_calendar_last_tested_at"
  END,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "settings_google_calendar"
WHERE "id" = 'singleton'
  AND (
    "google_calendar_connection_status" IS NOT NULL
    OR "google_calendar_last_tested_at" IS NOT NULL
  );

INSERT INTO "integration_healths" (
  "integration",
  "status",
  "last_success_at",
  "last_failure_at",
  "created_at",
  "updated_at"
)
SELECT
  'SWITCHBOT'::"integration_key",
  "switchbot_connection_status",
  CASE
    WHEN "switchbot_connection_status" = 'CONNECTED' THEN "switchbot_last_tested_at"
  END,
  CASE
    WHEN "switchbot_connection_status" = 'ERROR' THEN "switchbot_last_tested_at"
  END,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "settings_switchbot"
WHERE "id" = 'singleton'
  AND (
    "switchbot_connection_status" IS NOT NULL
    OR "switchbot_last_tested_at" IS NOT NULL
  );

ALTER TABLE "settings_google_calendar"
  DROP COLUMN "google_calendar_connection_status",
  DROP COLUMN "google_calendar_last_tested_at";

ALTER TABLE "settings_google_maps"
  DROP COLUMN "google_maps_connection_status",
  DROP COLUMN "google_maps_last_tested_at";

ALTER TABLE "settings_resend"
  DROP COLUMN "resend_connection_status",
  DROP COLUMN "resend_last_tested_at";

ALTER TABLE "settings_stripe"
  DROP COLUMN "stripe_connection_status",
  DROP COLUMN "stripe_last_tested_at";

ALTER TABLE "settings_switchbot"
  DROP COLUMN "switchbot_connection_status",
  DROP COLUMN "switchbot_last_tested_at";

ALTER TABLE "settings_turnstile"
  DROP COLUMN "turnstile_connection_status",
  DROP COLUMN "turnstile_last_tested_at";

COMMIT;
