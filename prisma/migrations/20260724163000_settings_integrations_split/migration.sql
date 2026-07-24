-- Phase 4: split integration settings out of settings singleton.
-- Spec: docs/superpowers/specs/2026-07-24-settings-schema-split-design.md
--
-- Breaking: DROP COLUMN on settings. Triggers planned-downtime deploy mode.

-- CreateTable
CREATE TABLE "settings_stripes" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "stripePublishableKey" TEXT,
    "stripeSecretKey" TEXT,
    "stripeWebhookSecret" TEXT,
    "stripeAccountId" TEXT,
    "stripeCurrency" TEXT NOT NULL DEFAULT 'jpy',
    "stripePaymentMethodTypes" TEXT[] NOT NULL DEFAULT ARRAY['card']::text[],
    "stripeLastTestedAt" TIMESTAMP(3),
    "stripeConnectionStatus" TEXT,

    CONSTRAINT "settings_stripes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_resends" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resendApiKey" TEXT,
    "resendWebhookSecret" TEXT,
    "resendLastTestedAt" TIMESTAMP(3),
    "resendConnectionStatus" TEXT,

    CONSTRAINT "settings_resends_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_turnstiles" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "turnstileSiteKey" TEXT,
    "turnstileSecretKey" TEXT,
    "turnstileLastTestedAt" TIMESTAMP(3),
    "turnstileConnectionStatus" TEXT,

    CONSTRAINT "settings_turnstiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_google_maps" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "googleMapsApiKey" TEXT,
    "googleMapsLastTestedAt" TIMESTAMP(3),
    "googleMapsConnectionStatus" TEXT,

    CONSTRAINT "settings_google_maps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_custom_api_keys" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "customApiKeys" JSONB DEFAULT '{}',

    CONSTRAINT "settings_custom_api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_google_calendars" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "googleCalendarEnabled" BOOLEAN NOT NULL DEFAULT false,
    "googleCalendarServiceAccountJson" TEXT,
    "googleCalendarId" TEXT,
    "googleCalendarLastTestedAt" TIMESTAMP(3),
    "googleCalendarConnectionStatus" TEXT,
    "googleCalendarReminderMinutes" INTEGER,
    "icalAttachmentEnabled" BOOLEAN NOT NULL DEFAULT true,
    "addToCalendarLinksEnabled" BOOLEAN NOT NULL DEFAULT true,
    "googleCalendarTwoWaySyncEnabled" BOOLEAN NOT NULL DEFAULT false,
    "googleCalendarSyncMethod" "CalendarSyncMethod" NOT NULL DEFAULT 'polling',
    "googleCalendarSyncToken" TEXT,
    "googleCalendarLastSyncedAt" TIMESTAMP(3),
    "eventImportEnabled" BOOLEAN NOT NULL DEFAULT false,
    "eventImportSyncToken" TEXT,
    "googleCalendarWebhookChannelId" TEXT,
    "googleCalendarWebhookResourceId" TEXT,
    "googleCalendarWebhookExpiration" TIMESTAMP(3),
    "googleCalendarWebhookToken" TEXT,

    CONSTRAINT "settings_google_calendars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_google_business_profiles" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "googleBusinessProfileEnabled" BOOLEAN NOT NULL DEFAULT false,
    "googleBusinessProfileAuth" JSONB,

    CONSTRAINT "settings_google_business_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_instagrams" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "instagramAccessToken" TEXT,
    "instagramTokenExpiresAt" TIMESTAMP(3),
    "instagramUserId" TEXT,
    "instagramUsername" TEXT,
    "instagramAccountType" TEXT,

    CONSTRAINT "settings_instagrams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_switchbots" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "switchbotEnabled" BOOLEAN NOT NULL DEFAULT false,
    "switchbotOpenToken" TEXT,
    "switchbotSecretKey" TEXT,
    "switchbotConnectionStatus" TEXT,
    "switchbotLastTestedAt" TIMESTAMP(3),
    "switchbotPasscodeBufferMinutes" INTEGER NOT NULL DEFAULT 15,
    "switchbotWebhookPathToken" TEXT,

    CONSTRAINT "settings_switchbots_pkey" PRIMARY KEY ("id")
);

-- Copy existing singleton row
INSERT INTO "settings_stripes" (
    "id",
    "createdAt",
    "updatedAt",
    "stripePublishableKey",
    "stripeSecretKey",
    "stripeWebhookSecret",
    "stripeAccountId",
    "stripeCurrency",
    "stripePaymentMethodTypes",
    "stripeLastTestedAt",
    "stripeConnectionStatus"
)
SELECT
    'singleton',
    s."createdAt",
    s."updatedAt",
    s."stripePublishableKey",
    s."stripeSecretKey",
    s."stripeWebhookSecret",
    s."stripeAccountId",
    s."stripeCurrency",
    s."stripePaymentMethodTypes",
    s."stripeLastTestedAt",
    s."stripeConnectionStatus"
FROM "settings" s
WHERE s."id" = 'singleton';

INSERT INTO "settings_resends" (
    "id",
    "createdAt",
    "updatedAt",
    "resendApiKey",
    "resendWebhookSecret",
    "resendLastTestedAt",
    "resendConnectionStatus"
)
SELECT
    'singleton',
    s."createdAt",
    s."updatedAt",
    s."resendApiKey",
    s."resendWebhookSecret",
    s."resendLastTestedAt",
    s."resendConnectionStatus"
FROM "settings" s
WHERE s."id" = 'singleton';

INSERT INTO "settings_turnstiles" (
    "id",
    "createdAt",
    "updatedAt",
    "turnstileSiteKey",
    "turnstileSecretKey",
    "turnstileLastTestedAt",
    "turnstileConnectionStatus"
)
SELECT
    'singleton',
    s."createdAt",
    s."updatedAt",
    s."turnstileSiteKey",
    s."turnstileSecretKey",
    s."turnstileLastTestedAt",
    s."turnstileConnectionStatus"
FROM "settings" s
WHERE s."id" = 'singleton';

INSERT INTO "settings_google_maps" (
    "id",
    "createdAt",
    "updatedAt",
    "googleMapsApiKey",
    "googleMapsLastTestedAt",
    "googleMapsConnectionStatus"
)
SELECT
    'singleton',
    s."createdAt",
    s."updatedAt",
    s."googleMapsApiKey",
    s."googleMapsLastTestedAt",
    s."googleMapsConnectionStatus"
FROM "settings" s
WHERE s."id" = 'singleton';

INSERT INTO "settings_custom_api_keys" (
    "id",
    "createdAt",
    "updatedAt",
    "customApiKeys"
)
SELECT
    'singleton',
    s."createdAt",
    s."updatedAt",
    s."customApiKeys"
FROM "settings" s
WHERE s."id" = 'singleton';

INSERT INTO "settings_google_calendars" (
    "id",
    "createdAt",
    "updatedAt",
    "googleCalendarEnabled",
    "googleCalendarServiceAccountJson",
    "googleCalendarId",
    "googleCalendarLastTestedAt",
    "googleCalendarConnectionStatus",
    "googleCalendarReminderMinutes",
    "icalAttachmentEnabled",
    "addToCalendarLinksEnabled",
    "googleCalendarTwoWaySyncEnabled",
    "googleCalendarSyncMethod",
    "googleCalendarSyncToken",
    "googleCalendarLastSyncedAt",
    "eventImportEnabled",
    "eventImportSyncToken",
    "googleCalendarWebhookChannelId",
    "googleCalendarWebhookResourceId",
    "googleCalendarWebhookExpiration",
    "googleCalendarWebhookToken"
)
SELECT
    'singleton',
    s."createdAt",
    s."updatedAt",
    s."googleCalendarEnabled",
    s."googleCalendarServiceAccountJson",
    s."googleCalendarId",
    s."googleCalendarLastTestedAt",
    s."googleCalendarConnectionStatus",
    s."googleCalendarReminderMinutes",
    s."icalAttachmentEnabled",
    s."addToCalendarLinksEnabled",
    s."googleCalendarTwoWaySyncEnabled",
    s."googleCalendarSyncMethod",
    s."googleCalendarSyncToken",
    s."googleCalendarLastSyncedAt",
    s."eventImportEnabled",
    s."eventImportSyncToken",
    s."googleCalendarWebhookChannelId",
    s."googleCalendarWebhookResourceId",
    s."googleCalendarWebhookExpiration",
    s."googleCalendarWebhookToken"
FROM "settings" s
WHERE s."id" = 'singleton';

INSERT INTO "settings_google_business_profiles" (
    "id",
    "createdAt",
    "updatedAt",
    "googleBusinessProfileEnabled",
    "googleBusinessProfileAuth"
)
SELECT
    'singleton',
    s."createdAt",
    s."updatedAt",
    s."googleBusinessProfileEnabled",
    s."googleBusinessProfileAuth"
FROM "settings" s
WHERE s."id" = 'singleton';

INSERT INTO "settings_instagrams" (
    "id",
    "createdAt",
    "updatedAt",
    "instagramAccessToken",
    "instagramTokenExpiresAt",
    "instagramUserId",
    "instagramUsername",
    "instagramAccountType"
)
SELECT
    'singleton',
    s."createdAt",
    s."updatedAt",
    s."instagramAccessToken",
    s."instagramTokenExpiresAt",
    s."instagramUserId",
    s."instagramUsername",
    s."instagramAccountType"
FROM "settings" s
WHERE s."id" = 'singleton';

INSERT INTO "settings_switchbots" (
    "id",
    "createdAt",
    "updatedAt",
    "switchbotEnabled",
    "switchbotOpenToken",
    "switchbotSecretKey",
    "switchbotConnectionStatus",
    "switchbotLastTestedAt",
    "switchbotPasscodeBufferMinutes",
    "switchbotWebhookPathToken"
)
SELECT
    'singleton',
    s."createdAt",
    s."updatedAt",
    s."switchbotEnabled",
    s."switchbotOpenToken",
    s."switchbotSecretKey",
    s."switchbotConnectionStatus",
    s."switchbotLastTestedAt",
    s."switchbotPasscodeBufferMinutes",
    s."switchbotWebhookPathToken"
FROM "settings" s
WHERE s."id" = 'singleton';

-- Default singleton rows when settings row is absent (empty DB / partial seed)
INSERT INTO "settings_stripes" ("id", "createdAt", "updatedAt")
SELECT 'singleton', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "settings_stripes" WHERE "id" = 'singleton');

INSERT INTO "settings_resends" ("id", "createdAt", "updatedAt")
SELECT 'singleton', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "settings_resends" WHERE "id" = 'singleton');

INSERT INTO "settings_turnstiles" ("id", "createdAt", "updatedAt")
SELECT 'singleton', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "settings_turnstiles" WHERE "id" = 'singleton');

INSERT INTO "settings_google_maps" ("id", "createdAt", "updatedAt")
SELECT 'singleton', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "settings_google_maps" WHERE "id" = 'singleton');

INSERT INTO "settings_custom_api_keys" ("id", "createdAt", "updatedAt")
SELECT 'singleton', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "settings_custom_api_keys" WHERE "id" = 'singleton');

INSERT INTO "settings_google_calendars" ("id", "createdAt", "updatedAt")
SELECT 'singleton', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "settings_google_calendars" WHERE "id" = 'singleton');

INSERT INTO "settings_google_business_profiles" ("id", "createdAt", "updatedAt")
SELECT 'singleton', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "settings_google_business_profiles" WHERE "id" = 'singleton');

INSERT INTO "settings_instagrams" ("id", "createdAt", "updatedAt")
SELECT 'singleton', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "settings_instagrams" WHERE "id" = 'singleton');

INSERT INTO "settings_switchbots" ("id", "createdAt", "updatedAt")
SELECT 'singleton', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "settings_switchbots" WHERE "id" = 'singleton');

-- AlterTable (breaking clean-break)
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "stripePublishableKey";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "stripeSecretKey";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "stripeWebhookSecret";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "stripeAccountId";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "stripeCurrency";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "stripePaymentMethodTypes";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "stripeLastTestedAt";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "stripeConnectionStatus";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "resendApiKey";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "resendWebhookSecret";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "resendLastTestedAt";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "resendConnectionStatus";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "turnstileSiteKey";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "turnstileSecretKey";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "turnstileLastTestedAt";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "turnstileConnectionStatus";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "googleMapsApiKey";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "googleMapsLastTestedAt";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "googleMapsConnectionStatus";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "customApiKeys";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "googleCalendarEnabled";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "googleCalendarServiceAccountJson";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "googleCalendarId";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "googleCalendarLastTestedAt";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "googleCalendarConnectionStatus";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "googleCalendarReminderMinutes";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "icalAttachmentEnabled";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "addToCalendarLinksEnabled";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "googleCalendarTwoWaySyncEnabled";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "googleCalendarSyncMethod";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "googleCalendarSyncToken";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "googleCalendarLastSyncedAt";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "eventImportEnabled";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "eventImportSyncToken";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "googleCalendarWebhookChannelId";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "googleCalendarWebhookResourceId";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "googleCalendarWebhookExpiration";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "googleCalendarWebhookToken";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "googleBusinessProfileEnabled";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "googleBusinessProfileAuth";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "instagramAccessToken";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "instagramTokenExpiresAt";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "instagramUserId";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "instagramUsername";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "instagramAccountType";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "switchbotEnabled";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "switchbotOpenToken";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "switchbotSecretKey";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "switchbotConnectionStatus";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "switchbotLastTestedAt";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "switchbotPasscodeBufferMinutes";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "switchbotWebhookPathToken";
