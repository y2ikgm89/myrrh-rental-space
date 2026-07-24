-- Phase 5: split featureModules / dataRetention out of settings hub and drop settings table.
-- Spec: docs/superpowers/specs/2026-07-24-settings-schema-split-design.md
--
-- Breaking: DROP TABLE settings. Triggers planned-downtime deploy mode.

-- CreateTable
CREATE TABLE "settings_features" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "featureModules" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "settings_features_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_data_retentions" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "dataRetention" JSONB NOT NULL DEFAULT '{"sessionMonths":6,"verificationMonths":6,"loginAttemptMonths":6,"reservationGuestMonths":12,"inquiryMonths":36,"customerInactiveMonths":84}',

    CONSTRAINT "settings_data_retentions_pkey" PRIMARY KEY ("id")
);

-- Copy existing singleton row
INSERT INTO "settings_features" (
    "id",
    "createdAt",
    "updatedAt",
    "featureModules"
)
SELECT
    'singleton',
    s."createdAt",
    s."updatedAt",
    s."featureModules"
FROM "settings" s
WHERE s."id" = 'singleton';

INSERT INTO "settings_data_retentions" (
    "id",
    "createdAt",
    "updatedAt",
    "dataRetention"
)
SELECT
    'singleton',
    s."createdAt",
    s."updatedAt",
    s."dataRetention"
FROM "settings" s
WHERE s."id" = 'singleton';

-- Default singleton rows when settings row is absent (empty DB / partial seed)
INSERT INTO "settings_features" ("id", "createdAt", "updatedAt")
SELECT 'singleton', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "settings_features" WHERE "id" = 'singleton');

INSERT INTO "settings_data_retentions" ("id", "createdAt", "updatedAt")
SELECT 'singleton', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "settings_data_retentions" WHERE "id" = 'singleton');

-- AlterTable (breaking clean-break)
-- squawk-ignore ban-drop-table
DROP TABLE "settings";
