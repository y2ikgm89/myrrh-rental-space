-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InquiryStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('NEW', 'REGULAR', 'VIP', 'INACTIVE', 'BLACKLIST');

-- CreateEnum
CREATE TYPE "NavigationType" AS ENUM ('HEADER_DESKTOP', 'HEADER_MOBILE', 'FOOTER');

-- CreateEnum
CREATE TYPE "SocialPlatform" AS ENUM ('TWITTER', 'FACEBOOK', 'INSTAGRAM', 'YOUTUBE', 'LINE', 'TIKTOK', 'OTHER');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "name" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "login_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spaces" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "access" TEXT,
    "capacity" INTEGER NOT NULL,
    "area" DECIMAL(10,2),
    "hourlyPrice" DECIMAL(10,2) NOT NULL,
    "dailyPrice" DECIMAL(10,2),
    "mainImageUrl" TEXT NOT NULL,
    "imageUrls" JSONB NOT NULL DEFAULT '[]',
    "facilities" JSONB NOT NULL DEFAULT '[]',
    "businessHours" JSONB,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "userId" TEXT,
    "customerId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'PENDING',
    "totalPrice" DECIMAL(10,2),
    "notes" TEXT,
    "termsAgreedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "googleCalendarEventId" TEXT,
    "googleCalendarOAuthEventId" TEXT,
    "calendarSyncedAt" TIMESTAMP(3),
    "calendarSyncError" TEXT,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "address" TEXT,
    "status" "CustomerStatus" NOT NULL DEFAULT 'NEW',
    "notes" TEXT,
    "totalReservations" INTEGER NOT NULL DEFAULT 0,
    "totalSpent" DECIMAL(10,2),
    "lastReservationAt" TIMESTAMP(3),
    "firstReservationAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inquiries" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "InquiryStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inquiries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "news" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "news_pkey" PRIMARY KEY ("id")
);

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
CREATE TABLE "blog_posts" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "thumbnailUrl" TEXT NOT NULL,
    "ogpImageUrl" TEXT,
    "categoryId" TEXT NOT NULL,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "metaDescription" TEXT,
    "metaKeywords" TEXT,
    "ogpTitle" TEXT,
    "ogpDescription" TEXT,
    "publishedAt" TIMESTAMP(3),
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "isDraft" BOOLEAN NOT NULL DEFAULT true,
    "authorId" TEXT NOT NULL,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blog_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blog_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blog_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blog_tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blog_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blog_comments" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "parentCommentId" TEXT,
    "content" TEXT NOT NULL,
    "userId" TEXT,
    "guestName" TEXT,
    "guestEmail" TEXT,
    "ipAddress" TEXT,
    "contentHash" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blog_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pages" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "content" TEXT NOT NULL,
    "metaDescription" TEXT,
    "metaKeywords" TEXT,
    "ogpTitle" TEXT,
    "ogpDescription" TEXT,
    "ogpImageUrl" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "publishedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "homepage_hero" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "title" TEXT NOT NULL DEFAULT '理想のスペースを、あなたに。',
    "subtitle" TEXT,
    "ctaPrimaryText" TEXT NOT NULL DEFAULT 'スペースを探す',
    "ctaPrimaryUrl" TEXT NOT NULL DEFAULT '/spaces',
    "ctaSecondaryText" TEXT DEFAULT 'お問い合わせ',
    "ctaSecondaryUrl" TEXT DEFAULT '/contact',
    "backgroundImageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "homepage_hero_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "navigation_items" (
    "id" TEXT NOT NULL,
    "type" "NavigationType" NOT NULL,
    "parentId" TEXT,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "isExternal" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "navigation_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_links" (
    "id" TEXT NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "url" TEXT NOT NULL,
    "iconUrl" TEXT,
    "order" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "showOnDesktop" BOOLEAN NOT NULL DEFAULT true,
    "showOnMobile" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "social_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faq_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "faq_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faq_items" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "faq_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "siteName" TEXT,
    "siteDescription" TEXT,
    "faviconUrl" TEXT,
    "defaultOgpImageUrl" TEXT,
    "headerLogoUrl" TEXT,
    "footerCopyright" TEXT,
    "businessName" TEXT,
    "businessNameKana" TEXT,
    "representativeName" TEXT,
    "businessType" TEXT,
    "industryType" TEXT,
    "establishedDate" TIMESTAMP(3),
    "registrationNumber" TEXT,
    "invoiceNumber" TEXT,
    "businessDescription" TEXT,
    "phoneNumber" TEXT,
    "faxNumber" TEXT,
    "email" TEXT,
    "address" TEXT,
    "postalCode" TEXT,
    "prefecture" TEXT,
    "city" TEXT,
    "streetAddress" TEXT,
    "buildingName" TEXT,
    "businessHours" JSONB,
    "regularHolidays" JSONB,
    "specialHolidays" JSONB,
    "holidayNotice" TEXT,
    "defaultBusinessHours" JSONB,
    "senderEmail" TEXT,
    "senderName" TEXT,
    "replyToEmail" TEXT,
    "reservationConfirmationTemplateId" TEXT,
    "reservationCancelledTemplateId" TEXT,
    "reservationUpdatedTemplateId" TEXT,
    "adminNotificationTemplateId" TEXT,
    "defaultMetaDescription" TEXT,
    "defaultMetaKeywords" TEXT,
    "defaultOgpTitle" TEXT,
    "defaultOgpDescription" TEXT,
    "analyticsType" TEXT,
    "googleAnalyticsId" TEXT,
    "googleTagManagerId" TEXT,
    "googleSearchConsoleId" TEXT,
    "bingWebmasterToolsId" TEXT,
    "gaPropertyId" TEXT,
    "defaultTimeSlot" INTEGER DEFAULT 60,
    "minReservationDuration" INTEGER DEFAULT 60,
    "maxReservationDuration" INTEGER DEFAULT 480,
    "cancellationPolicy" TEXT,
    "sendReservationConfirmationEmail" BOOLEAN NOT NULL DEFAULT true,
    "sendAdminNotificationEmail" BOOLEAN NOT NULL DEFAULT true,
    "termsAgreementEnabled" BOOLEAN NOT NULL DEFAULT true,
    "termsAgreementText" TEXT,
    "requireTermsAgreement" BOOLEAN NOT NULL DEFAULT true,
    "requirePrivacyAgreement" BOOLEAN NOT NULL DEFAULT true,
    "notifyNewReservation" BOOLEAN NOT NULL DEFAULT true,
    "notifyReservationChange" BOOLEAN NOT NULL DEFAULT true,
    "notifyReservationCancel" BOOLEAN NOT NULL DEFAULT true,
    "notifyNewInquiry" BOOLEAN NOT NULL DEFAULT true,
    "notificationEmailAddresses" TEXT,
    "timezone" TEXT DEFAULT 'Asia/Tokyo',
    "language" TEXT DEFAULT 'ja',
    "maintenanceMode" BOOLEAN NOT NULL DEFAULT false,
    "maintenanceMessage" TEXT,
    "stripeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "stripeTestMode" BOOLEAN NOT NULL DEFAULT true,
    "stripePublishableKey" TEXT,
    "stripeSecretKey" TEXT,
    "stripeWebhookSecret" TEXT,
    "stripeAccountId" TEXT,
    "stripeCurrency" TEXT NOT NULL DEFAULT 'jpy',
    "stripeLastTestedAt" TIMESTAMP(3),
    "stripeConnectionStatus" TEXT,
    "cookieConsentEnabled" BOOLEAN NOT NULL DEFAULT false,
    "cookieConsentMessage" TEXT,
    "cookieConsentAcceptText" TEXT,
    "cookieConsentRejectText" TEXT,
    "cookieConsentPolicyUrl" TEXT,
    "announcementBarAnimation" TEXT NOT NULL DEFAULT 'fade',
    "announcementBarDuration" INTEGER NOT NULL DEFAULT 5000,
    "announcementBarAutoPlay" BOOLEAN NOT NULL DEFAULT true,
    "announcementBarPauseOnHover" BOOLEAN NOT NULL DEFAULT true,
    "announcementBarShowArrows" BOOLEAN NOT NULL DEFAULT true,
    "announcementBarShowIndicator" BOOLEAN NOT NULL DEFAULT true,
    "announcementBarDesignStyle" TEXT NOT NULL DEFAULT 'solid',
    "announcementBarBgColor" TEXT,
    "announcementBarTextColor" TEXT,
    "announcementBarStripeColor" TEXT,
    "announcementBarStripeAnimation" BOOLEAN NOT NULL DEFAULT false,
    "announcementBarGradientAnimation" BOOLEAN NOT NULL DEFAULT false,
    "announcementBarGlassAnimation" BOOLEAN NOT NULL DEFAULT false,
    "resendApiKey" TEXT,
    "resendLastTestedAt" TIMESTAMP(3),
    "resendConnectionStatus" TEXT,
    "turnstileSiteKey" TEXT,
    "turnstileSecretKey" TEXT,
    "turnstileLastTestedAt" TIMESTAMP(3),
    "turnstileConnectionStatus" TEXT,
    "googleMapsApiKey" TEXT,
    "googleMapsLastTestedAt" TIMESTAMP(3),
    "googleMapsConnectionStatus" TEXT,
    "customApiKeys" JSONB DEFAULT '{}',
    "googleCalendarEnabled" BOOLEAN NOT NULL DEFAULT false,
    "googleCalendarServiceAccountJson" TEXT,
    "googleCalendarId" TEXT,
    "googleCalendarLastTestedAt" TIMESTAMP(3),
    "googleCalendarConnectionStatus" TEXT,
    "googleCalendarOAuthEnabled" BOOLEAN NOT NULL DEFAULT false,
    "icalAttachmentEnabled" BOOLEAN NOT NULL DEFAULT true,
    "addToCalendarLinksEnabled" BOOLEAN NOT NULL DEFAULT true,
    "icalFeedEnabled" BOOLEAN NOT NULL DEFAULT false,
    "icalFeedIncludeCustomerInfo" BOOLEAN NOT NULL DEFAULT false,
    "googleCalendarTwoWaySyncEnabled" BOOLEAN NOT NULL DEFAULT false,
    "googleCalendarSyncMethod" TEXT NOT NULL DEFAULT 'polling',
    "googleCalendarPollingIntervalMin" INTEGER NOT NULL DEFAULT 5,
    "googleCalendarSyncToken" TEXT,
    "googleCalendarLastSyncedAt" TIMESTAMP(3),
    "googleCalendarWebhookChannelId" TEXT,
    "googleCalendarWebhookResourceId" TEXT,
    "googleCalendarWebhookExpiration" TIMESTAMP(3),

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
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
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_providerAccountId_key" ON "accounts"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_sessionToken_key" ON "sessions"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_token_key" ON "verification_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_identifier_token_key" ON "verification_tokens"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "login_tokens_token_key" ON "login_tokens"("token");

-- CreateIndex
CREATE INDEX "login_tokens_token_idx" ON "login_tokens"("token");

-- CreateIndex
CREATE INDEX "login_tokens_expiresAt_idx" ON "login_tokens"("expiresAt");

-- CreateIndex
CREATE INDEX "login_tokens_usedAt_idx" ON "login_tokens"("usedAt");

-- CreateIndex
CREATE INDEX "spaces_isPublished_isActive_idx" ON "spaces"("isPublished", "isActive");

-- CreateIndex
CREATE INDEX "reservations_spaceId_idx" ON "reservations"("spaceId");

-- CreateIndex
CREATE INDEX "reservations_customerId_idx" ON "reservations"("customerId");

-- CreateIndex
CREATE INDEX "reservations_startTime_idx" ON "reservations"("startTime");

-- CreateIndex
CREATE INDEX "reservations_endTime_idx" ON "reservations"("endTime");

-- CreateIndex
CREATE INDEX "reservations_status_idx" ON "reservations"("status");

-- CreateIndex
CREATE INDEX "reservations_spaceId_startTime_endTime_idx" ON "reservations"("spaceId", "startTime", "endTime");

-- CreateIndex
CREATE INDEX "reservations_customerId_startTime_idx" ON "reservations"("customerId", "startTime");

-- CreateIndex
CREATE UNIQUE INDEX "customers_email_key" ON "customers"("email");

-- CreateIndex
CREATE INDEX "customers_lastName_idx" ON "customers"("lastName");

-- CreateIndex
CREATE INDEX "customers_status_idx" ON "customers"("status");

-- CreateIndex
CREATE INDEX "customers_isActive_idx" ON "customers"("isActive");

-- CreateIndex
CREATE INDEX "customers_lastReservationAt_idx" ON "customers"("lastReservationAt");

-- CreateIndex
CREATE INDEX "customers_lastName_firstName_idx" ON "customers"("lastName", "firstName");

-- CreateIndex
CREATE INDEX "inquiries_status_idx" ON "inquiries"("status");

-- CreateIndex
CREATE INDEX "inquiries_createdAt_idx" ON "inquiries"("createdAt");

-- CreateIndex
CREATE INDEX "news_isPublished_publishedAt_idx" ON "news"("isPublished", "publishedAt");

-- CreateIndex
CREATE INDEX "announcement_bars_isActive_priority_idx" ON "announcement_bars"("isActive", "priority");

-- CreateIndex
CREATE INDEX "announcement_bars_startAt_endAt_idx" ON "announcement_bars"("startAt", "endAt");

-- CreateIndex
CREATE UNIQUE INDEX "blog_posts_slug_key" ON "blog_posts"("slug");

-- CreateIndex
CREATE INDEX "blog_posts_isPublished_publishedAt_idx" ON "blog_posts"("isPublished", "publishedAt");

-- CreateIndex
CREATE INDEX "blog_posts_categoryId_isPublished_publishedAt_idx" ON "blog_posts"("categoryId", "isPublished", "publishedAt");

-- CreateIndex
CREATE INDEX "blog_posts_viewCount_idx" ON "blog_posts"("viewCount");

-- CreateIndex
CREATE UNIQUE INDEX "blog_categories_name_key" ON "blog_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "blog_categories_slug_key" ON "blog_categories"("slug");

-- CreateIndex
CREATE INDEX "blog_categories_order_idx" ON "blog_categories"("order");

-- CreateIndex
CREATE UNIQUE INDEX "blog_tags_name_key" ON "blog_tags"("name");

-- CreateIndex
CREATE UNIQUE INDEX "blog_tags_slug_key" ON "blog_tags"("slug");

-- CreateIndex
CREATE INDEX "blog_comments_postId_createdAt_idx" ON "blog_comments"("postId", "createdAt");

-- CreateIndex
CREATE INDEX "blog_comments_parentCommentId_idx" ON "blog_comments"("parentCommentId");

-- CreateIndex
CREATE INDEX "blog_comments_userId_idx" ON "blog_comments"("userId");

-- CreateIndex
CREATE INDEX "blog_comments_ipAddress_createdAt_idx" ON "blog_comments"("ipAddress", "createdAt");

-- CreateIndex
CREATE INDEX "blog_comments_guestEmail_createdAt_idx" ON "blog_comments"("guestEmail", "createdAt");

-- CreateIndex
CREATE INDEX "blog_comments_contentHash_idx" ON "blog_comments"("contentHash");

-- CreateIndex
CREATE INDEX "blog_comments_isDeleted_idx" ON "blog_comments"("isDeleted");

-- CreateIndex
CREATE INDEX "blog_comments_isDeleted_createdAt_idx" ON "blog_comments"("isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "pages_slug_key" ON "pages"("slug");

-- CreateIndex
CREATE INDEX "pages_isPublished_isActive_idx" ON "pages"("isPublished", "isActive");

-- CreateIndex
CREATE INDEX "navigation_items_type_order_idx" ON "navigation_items"("type", "order");

-- CreateIndex
CREATE INDEX "social_links_order_idx" ON "social_links"("order");

-- CreateIndex
CREATE UNIQUE INDEX "faq_categories_slug_key" ON "faq_categories"("slug");

-- CreateIndex
CREATE INDEX "faq_categories_order_idx" ON "faq_categories"("order");

-- CreateIndex
CREATE INDEX "faq_categories_isActive_order_idx" ON "faq_categories"("isActive", "order");

-- CreateIndex
CREATE INDEX "faq_items_categoryId_order_idx" ON "faq_items"("categoryId", "order");

-- CreateIndex
CREATE INDEX "faq_items_isActive_idx" ON "faq_items"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ical_tokens_token_key" ON "ical_tokens"("token");

-- CreateIndex
CREATE INDEX "ical_tokens_token_idx" ON "ical_tokens"("token");

-- CreateIndex
CREATE INDEX "ical_tokens_spaceId_idx" ON "ical_tokens"("spaceId");

-- CreateIndex
CREATE INDEX "ical_tokens_createdBy_idx" ON "ical_tokens"("createdBy");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blog_posts" ADD CONSTRAINT "blog_posts_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "blog_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blog_posts" ADD CONSTRAINT "blog_posts_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blog_comments" ADD CONSTRAINT "blog_comments_postId_fkey" FOREIGN KEY ("postId") REFERENCES "blog_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blog_comments" ADD CONSTRAINT "blog_comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blog_comments" ADD CONSTRAINT "blog_comments_parentCommentId_fkey" FOREIGN KEY ("parentCommentId") REFERENCES "blog_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "navigation_items" ADD CONSTRAINT "navigation_items_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "navigation_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faq_items" ADD CONSTRAINT "faq_items_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "faq_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ical_tokens" ADD CONSTRAINT "ical_tokens_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ical_tokens" ADD CONSTRAINT "ical_tokens_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
