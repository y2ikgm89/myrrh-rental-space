-- AlterTable
ALTER TABLE "reservations" ADD COLUMN     "calendarSyncError" TEXT,
ADD COLUMN     "calendarSyncedAt" TIMESTAMP(3),
ADD COLUMN     "googleCalendarEventId" TEXT,
ADD COLUMN     "googleCalendarOAuthEventId" TEXT;

-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "addToCalendarLinksEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "announcementBarAnimation" TEXT NOT NULL DEFAULT 'fade',
ADD COLUMN     "announcementBarAutoPlay" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "announcementBarDesignStyle" TEXT NOT NULL DEFAULT 'solid',
ADD COLUMN     "announcementBarDuration" INTEGER NOT NULL DEFAULT 5000,
ADD COLUMN     "announcementBarPauseOnHover" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "announcementBarShowArrows" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "announcementBarShowIndicator" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "customApiKeys" JSONB DEFAULT '{}',
ADD COLUMN     "googleCalendarConnectionStatus" TEXT,
ADD COLUMN     "googleCalendarEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "googleCalendarId" TEXT,
ADD COLUMN     "googleCalendarLastSyncedAt" TIMESTAMP(3),
ADD COLUMN     "googleCalendarLastTestedAt" TIMESTAMP(3),
ADD COLUMN     "googleCalendarOAuthEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "googleCalendarPollingIntervalMin" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "googleCalendarServiceAccountJson" TEXT,
ADD COLUMN     "googleCalendarSyncMethod" TEXT NOT NULL DEFAULT 'polling',
ADD COLUMN     "googleCalendarSyncToken" TEXT,
ADD COLUMN     "googleCalendarTwoWaySyncEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "googleCalendarWebhookChannelId" TEXT,
ADD COLUMN     "googleCalendarWebhookExpiration" TIMESTAMP(3),
ADD COLUMN     "googleCalendarWebhookResourceId" TEXT,
ADD COLUMN     "googleMapsApiKey" TEXT,
ADD COLUMN     "googleMapsConnectionStatus" TEXT,
ADD COLUMN     "googleMapsLastTestedAt" TIMESTAMP(3),
ADD COLUMN     "icalAttachmentEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "icalFeedEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "icalFeedIncludeCustomerInfo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requirePrivacyAgreement" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "requireTermsAgreement" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "resendApiKey" TEXT,
ADD COLUMN     "resendConnectionStatus" TEXT,
ADD COLUMN     "resendLastTestedAt" TIMESTAMP(3),
ADD COLUMN     "stripeAccountId" TEXT,
ADD COLUMN     "stripeConnectionStatus" TEXT,
ADD COLUMN     "stripeCurrency" TEXT NOT NULL DEFAULT 'jpy',
ADD COLUMN     "stripeEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stripeLastTestedAt" TIMESTAMP(3),
ADD COLUMN     "stripePublishableKey" TEXT,
ADD COLUMN     "stripeSecretKey" TEXT,
ADD COLUMN     "stripeTestMode" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "stripeWebhookSecret" TEXT,
ADD COLUMN     "termsAgreementEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "termsAgreementText" TEXT,
ADD COLUMN     "turnstileConnectionStatus" TEXT,
ADD COLUMN     "turnstileLastTestedAt" TIMESTAMP(3),
ADD COLUMN     "turnstileSecretKey" TEXT,
ADD COLUMN     "turnstileSiteKey" TEXT;

-- CreateTable
CREATE TABLE "announcement_bars" (
    "id" TEXT NOT NULL,
    "message" VARCHAR(200) NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'info',
    "linkUrl" TEXT,
    "linkText" TEXT,
    "bgColor" TEXT,
    "textColor" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "announcement_bars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ical_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "spaceId" TEXT,
    "createdBy" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "ical_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "announcement_bars_isActive_priority_idx" ON "announcement_bars"("isActive", "priority");

-- CreateIndex
CREATE INDEX "announcement_bars_startAt_endAt_idx" ON "announcement_bars"("startAt", "endAt");

-- CreateIndex
CREATE UNIQUE INDEX "ical_tokens_token_key" ON "ical_tokens"("token");

-- CreateIndex
CREATE INDEX "ical_tokens_token_idx" ON "ical_tokens"("token");

-- CreateIndex
CREATE INDEX "ical_tokens_spaceId_idx" ON "ical_tokens"("spaceId");

-- CreateIndex
CREATE INDEX "ical_tokens_createdBy_idx" ON "ical_tokens"("createdBy");

-- AddForeignKey
ALTER TABLE "ical_tokens" ADD CONSTRAINT "ical_tokens_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ical_tokens" ADD CONSTRAINT "ical_tokens_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
