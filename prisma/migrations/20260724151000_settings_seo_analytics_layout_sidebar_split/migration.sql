-- Phase 2: split SEO, analytics, layout, and sidebar settings out of settings singleton.
-- Spec: docs/superpowers/specs/2026-07-24-settings-schema-split-design.md
--
-- Breaking: DROP COLUMN on settings. Triggers planned-downtime deploy mode.

-- CreateTable
CREATE TABLE "settings_seos" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "siteName" TEXT,
    "siteDescription" TEXT,
    "faviconUrl" TEXT NOT NULL DEFAULT '',
    "defaultOgpImageUrl" TEXT,
    "headerLogoUrl" TEXT,
    "footerLogoUrl" TEXT,
    "footerCopyright" TEXT,
    "useHeaderLogo" BOOLEAN NOT NULL DEFAULT true,
    "useFooterLogo" BOOLEAN NOT NULL DEFAULT true,
    "defaultMetaDescription" TEXT,
    "defaultMetaKeywords" TEXT,
    "defaultOgpTitle" TEXT,
    "defaultOgpDescription" TEXT,

    CONSTRAINT "settings_seos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_analytics" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "analyticsType" "AnalyticsType",
    "googleAnalyticsId" TEXT,
    "googleTagManagerId" TEXT,
    "googleSearchConsoleId" TEXT,
    "bingWebmasterToolsId" TEXT,
    "gaPropertyId" TEXT,
    "microsoftClarityId" TEXT,

    CONSTRAINT "settings_analytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_layouts" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "containerWidth" "LayoutWidth",
    "containerWidthCustom" INTEGER,
    "contentWidth" "LayoutWidth",
    "contentWidthCustom" INTEGER,
    "headerScrollBehavior" "HeaderScrollBehavior" NOT NULL DEFAULT 'always-visible',
    "headerBackgroundMode" "HeaderBackgroundMode" NOT NULL DEFAULT 'solid',
    "themeColor" TEXT NOT NULL DEFAULT '#fafafa',
    "footerTagline" TEXT,
    "footerNavigationLabel" TEXT NOT NULL DEFAULT 'Navigation',
    "footerContactLabel" TEXT NOT NULL DEFAULT 'Contact',
    "footerHoursLabel" TEXT NOT NULL DEFAULT 'Hours',
    "footerShowSocialLinks" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "settings_layouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_sidebars" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sidebarEnabled" BOOLEAN NOT NULL DEFAULT true,
    "sidebarWidgets" JSONB NOT NULL DEFAULT '[{"type":"search","enabled":true},{"type":"recent","enabled":true,"layout":"compact"},{"type":"popular","enabled":true,"layout":"compact","showRanking":true},{"type":"categories","enabled":true},{"type":"tags","enabled":true}]'::jsonb,
    "sidebarRecentCount" INTEGER NOT NULL DEFAULT 5,
    "sidebarPopularCount" INTEGER NOT NULL DEFAULT 5,
    "sidebarTocEnabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "settings_sidebars_pkey" PRIMARY KEY ("id")
);

-- Copy existing singleton row
INSERT INTO "settings_seos" (
    "id",
    "createdAt",
    "updatedAt",
    "siteName",
    "siteDescription",
    "faviconUrl",
    "defaultOgpImageUrl",
    "headerLogoUrl",
    "footerLogoUrl",
    "footerCopyright",
    "useHeaderLogo",
    "useFooterLogo",
    "defaultMetaDescription",
    "defaultMetaKeywords",
    "defaultOgpTitle",
    "defaultOgpDescription"
)
SELECT
    'singleton',
    s."createdAt",
    s."updatedAt",
    s."siteName",
    s."siteDescription",
    s."faviconUrl",
    s."defaultOgpImageUrl",
    s."headerLogoUrl",
    s."footerLogoUrl",
    s."footerCopyright",
    s."useHeaderLogo",
    s."useFooterLogo",
    s."defaultMetaDescription",
    s."defaultMetaKeywords",
    s."defaultOgpTitle",
    s."defaultOgpDescription"
FROM "settings" s
WHERE s."id" = 'singleton';

INSERT INTO "settings_analytics" (
    "id",
    "createdAt",
    "updatedAt",
    "analyticsType",
    "googleAnalyticsId",
    "googleTagManagerId",
    "googleSearchConsoleId",
    "bingWebmasterToolsId",
    "gaPropertyId",
    "microsoftClarityId"
)
SELECT
    'singleton',
    s."createdAt",
    s."updatedAt",
    s."analyticsType",
    s."googleAnalyticsId",
    s."googleTagManagerId",
    s."googleSearchConsoleId",
    s."bingWebmasterToolsId",
    s."gaPropertyId",
    s."microsoftClarityId"
FROM "settings" s
WHERE s."id" = 'singleton';

INSERT INTO "settings_layouts" (
    "id",
    "createdAt",
    "updatedAt",
    "containerWidth",
    "containerWidthCustom",
    "contentWidth",
    "contentWidthCustom",
    "headerScrollBehavior",
    "headerBackgroundMode",
    "themeColor",
    "footerTagline",
    "footerNavigationLabel",
    "footerContactLabel",
    "footerHoursLabel",
    "footerShowSocialLinks"
)
SELECT
    'singleton',
    s."createdAt",
    s."updatedAt",
    s."containerWidth",
    s."containerWidthCustom",
    s."contentWidth",
    s."contentWidthCustom",
    s."headerScrollBehavior",
    s."headerBackgroundMode",
    s."themeColor",
    s."footerTagline",
    s."footerNavigationLabel",
    s."footerContactLabel",
    s."footerHoursLabel",
    s."footerShowSocialLinks"
FROM "settings" s
WHERE s."id" = 'singleton';

INSERT INTO "settings_sidebars" (
    "id",
    "createdAt",
    "updatedAt",
    "sidebarEnabled",
    "sidebarWidgets",
    "sidebarRecentCount",
    "sidebarPopularCount",
    "sidebarTocEnabled"
)
SELECT
    'singleton',
    s."createdAt",
    s."updatedAt",
    s."sidebarEnabled",
    s."sidebarWidgets",
    s."sidebarRecentCount",
    s."sidebarPopularCount",
    s."sidebarTocEnabled"
FROM "settings" s
WHERE s."id" = 'singleton';

-- Default singleton rows when settings row is absent (empty DB / partial seed)
INSERT INTO "settings_seos" ("id", "createdAt", "updatedAt")
SELECT 'singleton', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (
    SELECT 1 FROM "settings_seos" WHERE "id" = 'singleton'
);

INSERT INTO "settings_analytics" ("id", "createdAt", "updatedAt")
SELECT 'singleton', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (
    SELECT 1 FROM "settings_analytics" WHERE "id" = 'singleton'
);

INSERT INTO "settings_layouts" ("id", "createdAt", "updatedAt")
SELECT 'singleton', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (
    SELECT 1 FROM "settings_layouts" WHERE "id" = 'singleton'
);

INSERT INTO "settings_sidebars" ("id", "createdAt", "updatedAt")
SELECT 'singleton', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (
    SELECT 1 FROM "settings_sidebars" WHERE "id" = 'singleton'
);

ALTER TABLE "settings_sidebars"
    ADD CONSTRAINT "SettingsSidebar_sidebarWidgets_array_check"
        CHECK (jsonb_typeof("sidebarWidgets") = 'array');

-- AlterTable (breaking clean-break)
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "siteName";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "siteDescription";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "faviconUrl";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "defaultOgpImageUrl";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "headerLogoUrl";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "footerLogoUrl";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "footerCopyright";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "useHeaderLogo";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "useFooterLogo";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "defaultMetaDescription";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "defaultMetaKeywords";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "defaultOgpTitle";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "defaultOgpDescription";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "analyticsType";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "googleAnalyticsId";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "googleTagManagerId";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "googleSearchConsoleId";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "bingWebmasterToolsId";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "gaPropertyId";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "microsoftClarityId";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "containerWidth";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "containerWidthCustom";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "contentWidth";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "contentWidthCustom";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "headerScrollBehavior";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "headerBackgroundMode";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "themeColor";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "footerTagline";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "footerNavigationLabel";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "footerContactLabel";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "footerHoursLabel";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "footerShowSocialLinks";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "sidebarEnabled";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "sidebarWidgets";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "sidebarRecentCount";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "sidebarPopularCount";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "sidebarTocEnabled";
