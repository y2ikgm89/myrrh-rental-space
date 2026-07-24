-- Phase 1: split announcement carousel + system settings out of settings singleton.
-- Spec: docs/superpowers/specs/2026-07-24-settings-schema-split-design.md
--
-- Breaking: DROP COLUMN on settings. Triggers planned-downtime deploy mode.

-- CreateTable
CREATE TABLE "settings_announcement_carousels" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "animation" "AnnouncementBarAnimation" NOT NULL DEFAULT 'fade',
    "duration" INTEGER NOT NULL DEFAULT 5000,
    "autoPlay" BOOLEAN NOT NULL DEFAULT true,
    "pauseOnHover" BOOLEAN NOT NULL DEFAULT true,
    "showArrows" BOOLEAN NOT NULL DEFAULT true,
    "showIndicator" BOOLEAN NOT NULL DEFAULT true,
    "designStyle" "AnnouncementBarDesignStyle" NOT NULL DEFAULT 'solid',
    "bgColor" TEXT,
    "textColor" TEXT,
    "stripeColor" TEXT,
    "stripeAnimation" BOOLEAN NOT NULL DEFAULT false,
    "gradientAnimation" BOOLEAN NOT NULL DEFAULT false,
    "glassAnimation" BOOLEAN NOT NULL DEFAULT false,
    "sticky" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "settings_announcement_carousels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_systems" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "maintenanceMode" BOOLEAN NOT NULL DEFAULT false,
    "maintenanceMessage" TEXT,
    "cookieConsentEnabled" BOOLEAN NOT NULL DEFAULT false,
    "cookieConsentMessage" TEXT,
    "cookieConsentAcceptText" TEXT,
    "cookieConsentRejectText" TEXT,
    "cookieConsentPolicyUrl" TEXT,

    CONSTRAINT "settings_systems_pkey" PRIMARY KEY ("id")
);

-- Copy existing singleton row (column renames for carousel)
INSERT INTO "settings_announcement_carousels" (
    "id",
    "createdAt",
    "updatedAt",
    "animation",
    "duration",
    "autoPlay",
    "pauseOnHover",
    "showArrows",
    "showIndicator",
    "designStyle",
    "bgColor",
    "textColor",
    "stripeColor",
    "stripeAnimation",
    "gradientAnimation",
    "glassAnimation",
    "sticky"
)
SELECT
    'singleton',
    s."createdAt",
    s."updatedAt",
    s."announcementBarAnimation",
    s."announcementBarDuration",
    s."announcementBarAutoPlay",
    s."announcementBarPauseOnHover",
    s."announcementBarShowArrows",
    s."announcementBarShowIndicator",
    s."announcementBarDesignStyle",
    s."announcementBarBgColor",
    s."announcementBarTextColor",
    s."announcementBarStripeColor",
    s."announcementBarStripeAnimation",
    s."announcementBarGradientAnimation",
    s."announcementBarGlassAnimation",
    s."announcementBarSticky"
FROM "settings" s
WHERE s."id" = 'singleton';

INSERT INTO "settings_systems" (
    "id",
    "createdAt",
    "updatedAt",
    "maintenanceMode",
    "maintenanceMessage",
    "cookieConsentEnabled",
    "cookieConsentMessage",
    "cookieConsentAcceptText",
    "cookieConsentRejectText",
    "cookieConsentPolicyUrl"
)
SELECT
    'singleton',
    s."createdAt",
    s."updatedAt",
    s."maintenanceMode",
    s."maintenanceMessage",
    s."cookieConsentEnabled",
    s."cookieConsentMessage",
    s."cookieConsentAcceptText",
    s."cookieConsentRejectText",
    s."cookieConsentPolicyUrl"
FROM "settings" s
WHERE s."id" = 'singleton';

-- Default singleton rows when settings row is absent (empty DB / partial seed)
INSERT INTO "settings_announcement_carousels" ("id", "createdAt", "updatedAt")
SELECT 'singleton', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (
    SELECT 1 FROM "settings_announcement_carousels" WHERE "id" = 'singleton'
);

INSERT INTO "settings_systems" ("id", "createdAt", "updatedAt")
SELECT 'singleton', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (
    SELECT 1 FROM "settings_systems" WHERE "id" = 'singleton'
);

-- AlterTable (breaking clean-break)
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "maintenanceMode";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "maintenanceMessage";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "cookieConsentEnabled";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "cookieConsentMessage";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "cookieConsentAcceptText";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "cookieConsentRejectText";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "cookieConsentPolicyUrl";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "announcementBarAnimation";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "announcementBarDuration";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "announcementBarAutoPlay";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "announcementBarPauseOnHover";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "announcementBarShowArrows";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "announcementBarShowIndicator";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "announcementBarDesignStyle";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "announcementBarBgColor";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "announcementBarTextColor";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "announcementBarStripeColor";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "announcementBarStripeAnimation";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "announcementBarGradientAnimation";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "announcementBarGlassAnimation";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "announcementBarSticky";
