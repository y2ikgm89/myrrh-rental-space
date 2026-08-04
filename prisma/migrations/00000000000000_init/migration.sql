-- このファイルは scripts/build-baseline-migration.ts が生成する。手で編集しない。
-- 中身の出どころ: prisma/baseline/extensions.sql + prisma migrate diff + prisma/baseline/invariants.sql

-- ============================================================================
-- baseline prelude — extension
-- ============================================================================
--
-- **生成 DDL より前**に流す必要がある。schema.prisma の GIN index が
-- `gin_trgm_ops` を参照しており、pg_trgm が無いと
-- `operator class "gin_trgm_ops" does not exist` で CREATE INDEX が落ちる（実測）。
-- btree_gist は reservations の EXCLUDE 制約（invariants.sql）が使う。
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'EDITOR', 'VIEWER', 'USER', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "ReservationSeriesFreq" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "InquiryStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'FLAGGED', 'SPAM');

-- CreateEnum
CREATE TYPE "InquiryReplyAuthorType" AS ENUM ('STAFF', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('PERSONAL', 'CORPORATE');

-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('NEW', 'REGULAR', 'VIP', 'INACTIVE', 'BLACKLIST');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PENDING', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED', 'FAILED');

-- CreateEnum
CREATE TYPE "NavigationType" AS ENUM ('HEADER_DESKTOP', 'HEADER_MOBILE', 'FOOTER');

-- CreateEnum
CREATE TYPE "SocialPlatform" AS ENUM ('TWITTER', 'FACEBOOK', 'INSTAGRAM', 'YOUTUBE', 'LINE', 'TIKTOK', 'OTHER');

-- CreateEnum
CREATE TYPE "LayoutWidth" AS ENUM ('XS', 'SM', 'MD', 'LG', 'XL', 'FULL', 'CUSTOM');

-- CreateEnum
CREATE TYPE "PostStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CouponType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('none', 'percentage', 'fixed');

-- CreateEnum
CREATE TYPE "DurationDiscountOverride" AS ENUM ('inherit', 'enabled', 'disabled');

-- CreateEnum
CREATE TYPE "TaxRateType" AS ENUM ('standard', 'reduced');

-- CreateEnum
CREATE TYPE "HeaderScrollBehavior" AS ENUM ('auto-hide', 'always-visible', 'hide-on-scroll');

-- CreateEnum
CREATE TYPE "HeaderBackgroundMode" AS ENUM ('solid', 'transparent');

-- CreateEnum
CREATE TYPE "TaxDisplayMode" AS ENUM ('tax_excluded', 'tax_included', 'both');

-- CreateEnum
CREATE TYPE "CalendarSyncMethod" AS ENUM ('polling', 'webhook', 'both');

-- CreateEnum
CREATE TYPE "AnalyticsType" AS ENUM ('ga4', 'gtm');

-- CreateEnum
CREATE TYPE "DiscountCombinationMode" AS ENUM ('best', 'both');

-- CreateEnum
CREATE TYPE "AnnouncementBarAnimation" AS ENUM ('fade', 'slideX', 'slideY');

-- CreateEnum
CREATE TYPE "AnnouncementBarDesignStyle" AS ENUM ('solid', 'gradient', 'outlined', 'glass', 'minimal', 'striped');

-- CreateEnum
CREATE TYPE "InstagramMediaType" AS ENUM ('IMAGE', 'VIDEO', 'CAROUSEL_ALBUM');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "EventScheduleMode" AS ENUM ('SINGLE_OCCURRENCE', 'TIMED_ENTRY');

-- CreateEnum
CREATE TYPE "EventFormat" AS ENUM ('OFFLINE', 'ONLINE', 'HYBRID');

-- CreateEnum
CREATE TYPE "MeetingProvider" AS ENUM ('MANUAL', 'GOOGLE_MEET');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('CONFIRMED', 'CANCELLED', 'WAITLISTED', 'WAITLISTED_OFFERED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "EmailDeliveryStatus" AS ENUM ('OK', 'SOFT_BOUNCED', 'HARD_BOUNCED', 'COMPLAINED');

-- CreateEnum
CREATE TYPE "DayOfWeek" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- CreateEnum
CREATE TYPE "HolidayMode" AS ENUM ('any', 'only', 'exclude');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'READ', 'MANAGE', 'PUBLISH', 'EXPORT', 'LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT', 'PERMISSION_DENIED', 'PASSWORD_CHANGE', 'PASSWORD_RESET_REQUEST', 'PASSWORD_RESET_FAILED', 'ROLE_CHANGE', 'INTEGRITY_CHECK');

-- CreateEnum
CREATE TYPE "EditorCommentStatus" AS ENUM ('ACTIVE', 'RESOLVED', 'DELETED');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "MediaUsage" AS ENUM ('POST', 'NEWS', 'PAGE', 'SPACE', 'EVENT', 'SITE', 'GENERAL');

-- CreateEnum
CREATE TYPE "TermsScope" AS ENUM ('LOGIN_SIGNUP', 'RESERVATION', 'INQUIRY', 'EVENT_REGISTRATION', 'RESERVATION_SERIES');

-- CreateEnum
CREATE TYPE "SmartLockDeviceType" AS ENUM ('KEYPAD', 'KEYPAD_TOUCH', 'KEYPAD_VISION', 'KEYPAD_VISION_PRO', 'LOCK', 'LOCK_LITE', 'LOCK_PRO');

-- CreateEnum
CREATE TYPE "SmartLockPasscodeStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED', 'REVOKE_PENDING', 'REVOKED');

-- CreateTable
CREATE TABLE "user" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "dashboardEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_page_assignments" (
    "userId" UUID NOT NULL,
    "pageId" UUID NOT NULL,

    CONSTRAINT "user_page_assignments_pkey" PRIMARY KEY ("userId","pageId")
);

-- CreateTable
CREATE TABLE "account" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMPTZ(6),
    "refreshTokenExpiresAt" TIMESTAMPTZ(6),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" UUID NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(255) NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "address" TEXT NOT NULL,
    "postalCode" TEXT,
    "prefecture" TEXT,
    "city" TEXT,
    "streetAddress" TEXT,
    "buildingName" TEXT,
    "accessLines" JSONB NOT NULL DEFAULT '[]',
    "parkingInfo" TEXT,
    "amenities" JSONB NOT NULL DEFAULT '{}',
    "imageUrl" TEXT NOT NULL,
    "imageUrls" JSONB NOT NULL DEFAULT '[]',
    "businessHours" JSONB,
    "specialHolidays" JSONB,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "googleBusinessPlaceId" TEXT,
    "googleReviewUrl" TEXT,
    "priceRange" VARCHAR(100),
    "paymentAccepted" TEXT,
    "phoneNumber" TEXT,
    "email" TEXT,
    "gbpSyncEnabled" BOOLEAN NOT NULL DEFAULT true,
    "gbpSyncedAt" TIMESTAMPTZ(6),
    "gbpSyncError" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "defaultSmartLockDeviceId" UUID,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "space_categories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "space_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spaces" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "descriptionJson" JSONB NOT NULL,
    "descriptionHtml" TEXT NOT NULL,
    "descriptionPlainText" TEXT NOT NULL,
    "addressDetail" TEXT,
    "capacity" INTEGER NOT NULL,
    "area" INTEGER,
    "hourlyPrice" INTEGER NOT NULL,
    "mainImageUrl" TEXT NOT NULL,
    "gallery" JSONB NOT NULL DEFAULT '[]',
    "facilities" JSONB NOT NULL DEFAULT '[]',
    "businessHours" JSONB,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMPTZ(6),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "reviewsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "metaDescription" TEXT,
    "metaKeywords" TEXT,
    "ogpTitle" TEXT,
    "ogpDescription" TEXT,
    "ogpImageUrl" TEXT,
    "discountType" "DiscountType" NOT NULL DEFAULT 'none',
    "discountValue" INTEGER,
    "durationDiscountOverride" "DurationDiscountOverride" NOT NULL DEFAULT 'inherit',
    "taxRateType" "TaxRateType" NOT NULL DEFAULT 'standard',
    "locationId" UUID NOT NULL,
    "categoryId" UUID,
    "smartLockDeviceId" UUID,

    CONSTRAINT "spaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "space_rate_plans" (
    "id" UUID NOT NULL,
    "spaceId" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "hourlyPrice" INTEGER NOT NULL,
    "daysOfWeek" "DayOfWeek"[],
    "holidayMode" "HolidayMode" NOT NULL DEFAULT 'any',
    "startTime" VARCHAR(5),
    "endTime" VARCHAR(5),
    "effectiveFrom" DATE,
    "effectiveTo" DATE,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "space_rate_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blocked_dates" (
    "id" UUID NOT NULL,
    "scope" VARCHAR(16) NOT NULL,
    "spaceId" UUID,
    "locationId" UUID,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "reason" VARCHAR(200),
    "type" VARCHAR(32) NOT NULL,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "blocked_dates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservation_series" (
    "id" UUID NOT NULL,
    "spaceId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "couponId" UUID,
    "rrule" VARCHAR(500) NOT NULL,
    "dtstart" TIMESTAMPTZ(6) NOT NULL,
    "duration" INTEGER NOT NULL,
    "instanceCount" INTEGER NOT NULL,
    "templateData" JSONB NOT NULL,
    "agreementSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "cancelledAt" TIMESTAMPTZ(6),
    "cancelledByType" VARCHAR(20),
    "cancellationReason" TEXT,
    "deletedAt" TIMESTAMPTZ(6),
    "deletedById" UUID,
    "googleCalendarMasterEventId" VARCHAR(1024),

    CONSTRAINT "reservation_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" UUID NOT NULL,
    "spaceId" UUID NOT NULL,
    "userId" UUID,
    "customerId" UUID NOT NULL,
    "startTime" TIMESTAMPTZ(6) NOT NULL,
    "endTime" TIMESTAMPTZ(6) NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'PENDING',
    "totalPrice" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "couponId" UUID,
    "couponDiscountAmount" INTEGER,
    "durationDiscountAmount" INTEGER,
    "spaceDiscountAmount" INTEGER,
    "basePrice" INTEGER NOT NULL,
    "rateBreakdownJson" JSONB NOT NULL,
    "taxRateType" "TaxRateType" NOT NULL,
    "taxRate" INTEGER NOT NULL,
    "taxAmount" INTEGER NOT NULL,
    "totalPriceWithTax" INTEGER NOT NULL,
    "priceOverriddenBy" TEXT,
    "googleCalendarEventId" TEXT,
    "calendarSyncedAt" TIMESTAMPTZ(6),
    "calendarSyncError" TEXT,
    "guestLastName" TEXT,
    "guestFirstName" TEXT,
    "guestEmail" TEXT,
    "guestPhone" TEXT,
    "guestCompanyName" TEXT,
    "guestCustomerType" "CustomerType",
    "deletedAt" TIMESTAMPTZ(6),
    "deletedById" UUID,
    "numberOfGuests" INTEGER,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "stripeCheckoutSessionId" TEXT,
    "stripePaymentIntentId" TEXT,
    "paidAt" TIMESTAMPTZ(6),
    "paymentInitiatedAt" TIMESTAMPTZ(6),
    "cancellationReason" TEXT,
    "cancelledAt" TIMESTAMPTZ(6),
    "cancelledByType" VARCHAR(20),
    "icsSequence" INTEGER NOT NULL DEFAULT 0,
    "reminderSentAt" TIMESTAMPTZ(6),
    "smart_lock_reissue_pending_at" TIMESTAMPTZ(6),
    "seriesId" UUID,
    "recurrenceInstanceIndex" INTEGER,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "lastName" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastNameKana" TEXT,
    "firstNameKana" TEXT,
    "companyName" TEXT,
    "customerType" "CustomerType" NOT NULL DEFAULT 'PERSONAL',
    "email" TEXT NOT NULL,
    "emailCanonical" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "postalCode" VARCHAR(8),
    "prefecture" VARCHAR(10),
    "city" VARCHAR(100),
    "streetAddress" VARCHAR(200),
    "building" VARCHAR(200),
    "status" "CustomerStatus" NOT NULL DEFAULT 'NEW',
    "notes" TEXT,
    "totalReservations" INTEGER NOT NULL DEFAULT 0,
    "totalSpent" INTEGER,
    "lastReservationAt" TIMESTAMPTZ(6),
    "firstReservationAt" TIMESTAMPTZ(6),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "marketingOptIn" BOOLEAN NOT NULL DEFAULT false,
    "phoneContactOptIn" BOOLEAN NOT NULL DEFAULT true,
    "emailDeliveryStatus" "EmailDeliveryStatus" NOT NULL DEFAULT 'OK',
    "emailDeliveryUpdatedAt" TIMESTAMPTZ(6),
    "emailDeliveryReason" VARCHAR(500),
    "flaggedForReviewAt" TIMESTAMPTZ(6),
    "flagReasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "anonymizedAt" TIMESTAMPTZ(6),
    "anonymizedReason" VARCHAR(50),
    "suppressedEmailHash" VARCHAR(128),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "userId" UUID,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pending_customer_email_changes" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "newEmail" VARCHAR(320) NOT NULL,
    "newEmailCanonical" VARCHAR(320) NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "consumedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_customer_email_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pending_customer_merges" (
    "id" UUID NOT NULL,
    "targetCustomerId" UUID NOT NULL,
    "sourceCustomerId" UUID NOT NULL,
    "guestEmail" VARCHAR(320) NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "consumedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_customer_merges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupons" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "CouponType" NOT NULL,
    "discountValue" INTEGER NOT NULL,
    "minReservationAmount" INTEGER,
    "maxDiscountAmount" INTEGER,
    "validFrom" TIMESTAMPTZ(6) NOT NULL,
    "validUntil" TIMESTAMPTZ(6),
    "usageLimit" INTEGER,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "canCombineWithDurationDiscount" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inquiries" (
    "id" UUID NOT NULL,
    "receiptNumber" VARCHAR(20) NOT NULL,
    "name" TEXT NOT NULL,
    "companyName" TEXT,
    "customerType" "CustomerType",
    "email" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "InquiryStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "assigneeId" UUID,
    "slaExpiresAt" TIMESTAMPTZ(6),
    "deletedAt" TIMESTAMPTZ(6),
    "anonymizedAt" TIMESTAMPTZ(6),
    "anonymizedReason" VARCHAR(50),
    "customerId" UUID,

    CONSTRAINT "inquiries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inquiry_replies" (
    "id" UUID NOT NULL,
    "inquiryId" UUID NOT NULL,
    "authorType" "InquiryReplyAuthorType" NOT NULL,
    "authorId" UUID,
    "authorCustomerId" UUID,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "inquiry_replies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inquiry_status_history" (
    "id" UUID NOT NULL,
    "inquiryId" UUID NOT NULL,
    "fromStatus" "InquiryStatus",
    "toStatus" "InquiryStatus" NOT NULL,
    "changedById" UUID,
    "reason" VARCHAR(200),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inquiry_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inquiry_attachments" (
    "id" UUID NOT NULL,
    "inquiryId" UUID NOT NULL,
    "replyId" UUID,
    "r2Key" TEXT NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "uploadedById" UUID,
    "uploadedByCustomerId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inquiry_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inquiry_internal_notes" (
    "id" UUID NOT NULL,
    "inquiryId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "inquiry_internal_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inquiry_tags" (
    "id" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "color" VARCHAR(20),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "inquiry_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inquiry_tag_on_inquiries" (
    "inquiryId" UUID NOT NULL,
    "tagId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inquiry_tag_on_inquiries_pkey" PRIMARY KEY ("inquiryId","tagId")
);

-- CreateTable
CREATE TABLE "news" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "contentJson" JSONB,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMPTZ(6),
    "contentWidth" "LayoutWidth",
    "contentWidthCustom" INTEGER,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "metaDescription" TEXT,
    "metaKeywords" TEXT,
    "ogpTitle" TEXT,
    "ogpDescription" TEXT,
    "ogpImageUrl" TEXT,

    CONSTRAINT "news_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcement_bars" (
    "id" UUID NOT NULL,
    "message" JSONB NOT NULL DEFAULT '[]',
    "linkUrl" TEXT,
    "linkText" TEXT,
    "bgColor" TEXT,
    "textColor" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "startAt" TIMESTAMPTZ(6),
    "endAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "announcement_bars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posts" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "contentJson" JSONB,
    "thumbnailUrl" TEXT NOT NULL,
    "ogpImageUrl" TEXT,
    "categoryId" UUID NOT NULL,
    "metaDescription" TEXT,
    "metaKeywords" TEXT,
    "ogpTitle" TEXT,
    "ogpDescription" TEXT,
    "publishedAt" TIMESTAMPTZ(6),
    "status" "PostStatus" NOT NULL DEFAULT 'DRAFT',
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "authorId" UUID,
    "contentWidth" "LayoutWidth",
    "contentWidthCustom" INTEGER,
    "deletedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_tag_on_posts" (
    "postId" UUID NOT NULL,
    "tagId" UUID NOT NULL,

    CONSTRAINT "post_tag_on_posts_pkey" PRIMARY KEY ("postId","tagId")
);

-- CreateTable
CREATE TABLE "post_categories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "ogpImageUrl" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "post_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_tags" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "ogpImageUrl" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "post_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pages" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "metaDescription" TEXT,
    "metaKeywords" TEXT,
    "ogpTitle" TEXT,
    "ogpDescription" TEXT,
    "ogpImageUrl" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "publishedAt" TIMESTAMPTZ(6),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystemPage" BOOLEAN NOT NULL DEFAULT false,
    "template" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sections" (
    "id" UUID NOT NULL,
    "pageId" UUID NOT NULL,
    "type" VARCHAR(64) NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "navigation_items" (
    "id" UUID NOT NULL,
    "type" "NavigationType" NOT NULL,
    "parentId" UUID,
    "label" JSONB NOT NULL,
    "url" TEXT NOT NULL,
    "isExternal" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "navigation_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_links" (
    "id" UUID NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "url" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "showOnDesktop" BOOLEAN NOT NULL DEFAULT true,
    "showOnMobile" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "social_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faq_categories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "faq_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faq_items" (
    "id" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "publishedAt" TIMESTAMPTZ(6),
    "deletedAt" TIMESTAMPTZ(6),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "lastViewedAt" TIMESTAMPTZ(6),
    "helpfulCount" INTEGER NOT NULL DEFAULT 0,
    "notHelpfulCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "faq_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_announcement_carousels" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
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
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "maintenanceMode" BOOLEAN NOT NULL DEFAULT false,
    "maintenanceMessage" TEXT,
    "cookieConsentEnabled" BOOLEAN NOT NULL DEFAULT false,
    "cookieConsentMessage" TEXT,
    "cookieConsentAcceptText" TEXT,
    "cookieConsentRejectText" TEXT,
    "cookieConsentPolicyUrl" TEXT,

    CONSTRAINT "settings_systems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_seos" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
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
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
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
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
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
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "sidebarEnabled" BOOLEAN NOT NULL DEFAULT true,
    "sidebarWidgets" JSONB NOT NULL DEFAULT '[{"type":"search","enabled":true},{"type":"recent","enabled":true,"layout":"compact"},{"type":"popular","enabled":true,"layout":"compact","showRanking":true},{"type":"categories","enabled":true},{"type":"tags","enabled":true}]',
    "sidebarRecentCount" INTEGER NOT NULL DEFAULT 5,
    "sidebarPopularCount" INTEGER NOT NULL DEFAULT 5,
    "sidebarTocEnabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "settings_sidebars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_organizations" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "businessName" TEXT,
    "businessNameKana" TEXT,
    "representativeName" TEXT,
    "establishedDate" TIMESTAMPTZ(6),
    "registrationNumber" TEXT,
    "invoiceNumber" TEXT,
    "businessDescription" TEXT,
    "phoneNumber" TEXT,
    "faxNumber" TEXT,
    "email" TEXT,
    "postalCode" TEXT,
    "prefecture" TEXT,
    "city" TEXT,
    "streetAddress" TEXT,
    "buildingName" TEXT,
    "businessHours" JSONB,
    "holidayNotice" TEXT,
    "transferGuidance" TEXT,
    "senderEmail" TEXT,
    "senderName" TEXT,
    "replyToEmail" TEXT,

    CONSTRAINT "settings_organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_commerces" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "durationDiscountEnabled" BOOLEAN NOT NULL DEFAULT false,
    "durationDiscountRules" JSONB NOT NULL DEFAULT '[]',
    "discountCombinationMode" "DiscountCombinationMode" NOT NULL DEFAULT 'best',
    "showOriginalPrice" BOOLEAN NOT NULL DEFAULT true,
    "taxStandardRate" INTEGER NOT NULL DEFAULT 10,
    "taxReducedRate" INTEGER NOT NULL DEFAULT 8,
    "taxDisplayModePublic" "TaxDisplayMode" NOT NULL DEFAULT 'tax_included',
    "refundPolicy" JSONB,

    CONSTRAINT "settings_commerces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_notifications" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "notifyNewReservation" BOOLEAN NOT NULL DEFAULT true,
    "notifyReservationChange" BOOLEAN NOT NULL DEFAULT true,
    "notifyReservationCancel" BOOLEAN NOT NULL DEFAULT true,
    "notifyNewInquiry" BOOLEAN NOT NULL DEFAULT true,
    "notifyInquiryCustomerReply" BOOLEAN NOT NULL DEFAULT true,
    "notifyEventRegistration" BOOLEAN NOT NULL DEFAULT true,
    "notifyEventWaitlistRegistration" BOOLEAN NOT NULL DEFAULT true,
    "notifyEventCancellation" BOOLEAN NOT NULL DEFAULT true,
    "notifyEventReminder" BOOLEAN NOT NULL DEFAULT false,
    "notificationStaffIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notificationEmailAddresses" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "settings_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_reservations" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "defaultTimeSlot" INTEGER NOT NULL DEFAULT 60,
    "minReservationDuration" INTEGER NOT NULL DEFAULT 60,
    "maxReservationDuration" INTEGER NOT NULL DEFAULT 480,
    "sendReservationConfirmationEmail" BOOLEAN NOT NULL DEFAULT true,
    "maxRecurrenceInstances" INTEGER NOT NULL DEFAULT 26,
    "customerCanCancelSeriesInFull" BOOLEAN NOT NULL DEFAULT false,
    "cancellationDeadlineHours" INTEGER NOT NULL DEFAULT 24,
    "modificationDeadlineHours" INTEGER NOT NULL DEFAULT 24,

    CONSTRAINT "settings_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_stripes" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "stripePublishableKey" TEXT,
    "stripeSecretKey" TEXT,
    "stripeWebhookSecret" TEXT,
    "stripeAccountId" TEXT,
    "stripeCurrency" TEXT NOT NULL DEFAULT 'jpy',
    "stripePaymentMethodTypes" TEXT[] DEFAULT ARRAY['card']::TEXT[],
    "stripeLastTestedAt" TIMESTAMPTZ(6),
    "stripeConnectionStatus" TEXT,

    CONSTRAINT "settings_stripes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_resends" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "resendApiKey" TEXT,
    "resendWebhookSecret" TEXT,
    "resendLastTestedAt" TIMESTAMPTZ(6),
    "resendConnectionStatus" TEXT,

    CONSTRAINT "settings_resends_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_turnstiles" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "turnstileSiteKey" TEXT,
    "turnstileSecretKey" TEXT,
    "turnstileLastTestedAt" TIMESTAMPTZ(6),
    "turnstileConnectionStatus" TEXT,

    CONSTRAINT "settings_turnstiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_google_maps" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "googleMapsApiKey" TEXT,
    "googleMapsLastTestedAt" TIMESTAMPTZ(6),
    "googleMapsConnectionStatus" TEXT,

    CONSTRAINT "settings_google_maps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_google_calendars" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "googleCalendarEnabled" BOOLEAN NOT NULL DEFAULT false,
    "googleCalendarServiceAccountJson" TEXT,
    "googleCalendarId" TEXT,
    "googleCalendarLastTestedAt" TIMESTAMPTZ(6),
    "googleCalendarConnectionStatus" TEXT,
    "googleCalendarReminderMinutes" INTEGER,
    "icalAttachmentEnabled" BOOLEAN NOT NULL DEFAULT true,
    "addToCalendarLinksEnabled" BOOLEAN NOT NULL DEFAULT true,
    "googleCalendarTwoWaySyncEnabled" BOOLEAN NOT NULL DEFAULT false,
    "googleCalendarSyncMethod" "CalendarSyncMethod" NOT NULL DEFAULT 'polling',
    "googleCalendarSyncToken" TEXT,
    "googleCalendarLastSyncedAt" TIMESTAMPTZ(6),
    "eventImportEnabled" BOOLEAN NOT NULL DEFAULT false,
    "eventImportSyncToken" TEXT,
    "googleCalendarWebhookChannelId" TEXT,
    "googleCalendarWebhookResourceId" TEXT,
    "googleCalendarWebhookExpiration" TIMESTAMPTZ(6),
    "googleCalendarWebhookToken" TEXT,

    CONSTRAINT "settings_google_calendars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_google_business_profiles" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "googleBusinessProfileEnabled" BOOLEAN NOT NULL DEFAULT false,
    "googleBusinessProfileAuth" JSONB,

    CONSTRAINT "settings_google_business_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_instagrams" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "instagramAccessToken" TEXT,
    "instagramTokenExpiresAt" TIMESTAMPTZ(6),
    "instagramUserId" TEXT,
    "instagramUsername" TEXT,
    "instagramAccountType" TEXT,

    CONSTRAINT "settings_instagrams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_switchbots" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "switchbotEnabled" BOOLEAN NOT NULL DEFAULT false,
    "switchbotOpenToken" TEXT,
    "switchbotSecretKey" TEXT,
    "switchbotConnectionStatus" TEXT,
    "switchbotLastTestedAt" TIMESTAMPTZ(6),
    "switchbotPasscodeBufferMinutes" INTEGER NOT NULL DEFAULT 15,
    "switchbotWebhookPathToken" TEXT,

    CONSTRAINT "settings_switchbots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_features" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "featureModules" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "settings_features_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_data_retentions" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "dataRetention" JSONB NOT NULL DEFAULT '{"sessionMonths":6,"verificationMonths":6,"reservationGuestMonths":12,"inquiryMonths":36,"customerInactiveMonths":84}',

    CONSTRAINT "settings_data_retentions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instagram_posts" (
    "id" UUID NOT NULL,
    "postId" TEXT NOT NULL,
    "postUrl" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "thumbnailUrl" TEXT,
    "caption" TEXT,
    "mediaType" "InstagramMediaType" NOT NULL,
    "permalink" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "instagram_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "sequence" BIGINT NOT NULL,
    "previousHash" CHAR(64) NOT NULL,
    "entryHash" CHAR(64) NOT NULL,
    "hashAlgorithm" VARCHAR(32) NOT NULL DEFAULT 'HMAC-SHA256',
    "hashKeyId" VARCHAR(32) NOT NULL DEFAULT 'v1',
    "chainVersion" INTEGER NOT NULL DEFAULT 1,
    "userId" UUID,
    "action" "AuditAction" NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT,
    "oldValue" JSONB,
    "newValue" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media" (
    "id" UUID NOT NULL,
    "filename" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "type" "MediaType" NOT NULL,
    "usage" "MediaUsage" NOT NULL DEFAULT 'GENERAL',
    "alt" TEXT,
    "title" TEXT,
    "description" TEXT,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "uploadedBy" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terms_documents" (
    "id" UUID NOT NULL,
    "type" VARCHAR(64) NOT NULL,
    "slug" VARCHAR(50) NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "contentJson" JSONB NOT NULL,
    "contentHtml" TEXT NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMPTZ(6),
    "scopes" "TermsScope"[],
    "changelog" TEXT,
    "showInFooter" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "terms_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terms_agreements" (
    "id" UUID NOT NULL,
    "termsId" UUID NOT NULL,
    "customerId" UUID,
    "guestEmail" VARCHAR(255),
    "contentSnapshot" TEXT NOT NULL,
    "contentHash" VARCHAR(64) NOT NULL,
    "agreedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scope" "TermsScope" NOT NULL,
    "resourceId" TEXT,
    "ipAddress" VARCHAR(45),
    "userAgent" TEXT,

    CONSTRAINT "terms_agreements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "editor_comment_threads" (
    "id" UUID NOT NULL,
    "markId" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "contentId" UUID NOT NULL,
    "quotedText" TEXT NOT NULL,
    "status" "EditorCommentStatus" NOT NULL DEFAULT 'ACTIVE',
    "resolvedAt" TIMESTAMPTZ(6),
    "resolvedBy" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "createdBy" UUID,

    CONSTRAINT "editor_comment_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "editor_comments" (
    "id" UUID NOT NULL,
    "threadId" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMPTZ(6),
    "deletedBy" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "createdBy" UUID,

    CONSTRAINT "editor_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "block_templates" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "nodeJson" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "createdBy" UUID,

    CONSTRAINT "block_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "space_reviews" (
    "id" UUID NOT NULL,
    "spaceId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "reservationId" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "title" VARCHAR(100),
    "comment" VARCHAR(1000),
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "replyBody" VARCHAR(1000),
    "repliedAt" TIMESTAMPTZ(6),
    "repliedById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "space_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_time_slots" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "startAt" TIMESTAMPTZ(6) NOT NULL,
    "endAt" TIMESTAMPTZ(6) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "googleCalendarEventId" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "event_time_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_categories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "event_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "descriptionJson" JSONB NOT NULL,
    "descriptionHtml" TEXT NOT NULL,
    "descriptionPlainText" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "ogpImageUrl" TEXT,
    "ogpTitle" TEXT,
    "ogpDescription" TEXT,
    "metaDescription" TEXT,
    "metaKeywords" TEXT,
    "addressDetail" VARCHAR(200),
    "locationId" UUID,
    "spaceId" UUID,
    "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduleMode" "EventScheduleMode" NOT NULL,
    "registrationOpen" BOOLEAN NOT NULL DEFAULT true,
    "registrationDeadline" TIMESTAMPTZ(6),
    "publishedAt" TIMESTAMPTZ(6),
    "deletedAt" TIMESTAMPTZ(6),
    "deletedById" UUID,
    "gallery" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "firstSlotStartAt" TIMESTAMPTZ(6),
    "lastSlotEndAt" TIMESTAMPTZ(6),
    "format" "EventFormat" NOT NULL DEFAULT 'OFFLINE',
    "meetingUrl" VARCHAR(500),
    "meetingProvider" "MeetingProvider" NOT NULL DEFAULT 'MANUAL',
    "calendarSyncError" TEXT,
    "categoryId" UUID NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_tickets" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "price" INTEGER NOT NULL,
    "capacity" INTEGER,
    "unitSize" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "event_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_registrations" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "slotId" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(255),
    "phone" VARCHAR(20),
    "note" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'CONFIRMED',
    "customerId" UUID,
    "cancelledAt" TIMESTAMPTZ(6),
    "cancelledByType" VARCHAR(20),
    "attendedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "icsSequence" INTEGER NOT NULL DEFAULT 0,
    "waitlistedAt" TIMESTAMPTZ(6),
    "offeredAt" TIMESTAMPTZ(6),
    "expiresAt" TIMESTAMPTZ(6),
    "reminderSentAt" TIMESTAMPTZ(6),
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "stripeCheckoutSessionId" TEXT,
    "stripePaymentIntentId" TEXT,
    "paidAmount" INTEGER,
    "paidAt" TIMESTAMPTZ(6),

    CONSTRAINT "event_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" UUID NOT NULL,
    "reservationId" UUID,
    "eventRegistrationId" UUID,
    "amount" INTEGER NOT NULL,
    "reason" TEXT,
    "stripeRefundId" TEXT NOT NULL,
    "refundedByType" VARCHAR(20) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'succeeded',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipts" (
    "id" UUID NOT NULL,
    "serialNo" VARCHAR(20) NOT NULL,
    "issuedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reservationId" UUID,
    "eventRegistrationId" UUID,
    "recipientName" TEXT NOT NULL,
    "subject" TEXT NOT NULL DEFAULT 'スペース利用料として',
    "amount" INTEGER NOT NULL,
    "taxAmount" INTEGER NOT NULL DEFAULT 0,
    "taxRate" INTEGER NOT NULL,
    "issuerSnapshot" JSONB NOT NULL,
    "reissuedFromId" UUID,
    "reissuedReason" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "usedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt_sequences" (
    "id" VARCHAR(20) NOT NULL DEFAULT 'singleton',
    "year" INTEGER NOT NULL,
    "nextNo" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "receipt_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_notification" (
    "id" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "message" VARCHAR(500) NOT NULL,
    "resourceType" VARCHAR(50),
    "resourceId" VARCHAR(36),
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smart_lock_devices" (
    "id" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "deviceId" TEXT NOT NULL,
    "deviceName" TEXT NOT NULL,
    "deviceType" "SmartLockDeviceType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "pairedLockDeviceId" UUID,
    "lastLockState" TEXT,
    "lastDoorState" TEXT,
    "lastBattery" INTEGER,
    "lastStateAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "smart_lock_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smart_lock_passcodes" (
    "id" UUID NOT NULL,
    "reservationId" UUID NOT NULL,
    "deviceId" UUID NOT NULL,
    "status" "SmartLockPasscodeStatus" NOT NULL DEFAULT 'PENDING',
    "passcodeCiphertext" TEXT NOT NULL,
    "switchbotCommandId" TEXT,
    "switchbotDeleteCommandId" TEXT,
    "switchbotKeyId" TEXT,
    "startTime" TIMESTAMPTZ(6) NOT NULL,
    "endTime" TIMESTAMPTZ(6) NOT NULL,
    "failureReason" TEXT,
    "confirmedAt" TIMESTAMPTZ(6),
    "revokeRequestedAt" TIMESTAMPTZ(6),
    "revokedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "smart_lock_passcodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stripe_events" (
    "id" VARCHAR(80) NOT NULL,
    "type" VARCHAR(80) NOT NULL,
    "receivedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ(6),

    CONSTRAINT "stripe_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfer_accounts" (
    "id" UUID NOT NULL,
    "label" VARCHAR(50) NOT NULL,
    "bankName" VARCHAR(50) NOT NULL,
    "branchName" VARCHAR(50) NOT NULL,
    "accountType" VARCHAR(20) NOT NULL,
    "accountNumber" VARCHAR(20) NOT NULL,
    "accountHolderName" VARCHAR(100) NOT NULL,
    "note" VARCHAR(200),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "transfer_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "user_name_idx" ON "user"("name");

-- CreateIndex
CREATE INDEX "user_page_assignments_pageId_idx" ON "user_page_assignments"("pageId");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE INDEX "locations_isPublished_isActive_idx" ON "locations"("isPublished", "isActive");

-- CreateIndex
CREATE INDEX "locations_sortOrder_idx" ON "locations"("sortOrder");

-- CreateIndex
CREATE INDEX "locations_gbpSyncError_idx" ON "locations"("gbpSyncError");

-- CreateIndex
CREATE INDEX "locations_defaultSmartLockDeviceId_idx" ON "locations"("defaultSmartLockDeviceId");

-- CreateIndex
CREATE INDEX "locations_name_trgm_idx" ON "locations" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "locations_address_trgm_idx" ON "locations" USING GIN ("address" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "locations_active_sortOrder_key" ON "locations"("sortOrder") WHERE ("isActive" = true);

-- CreateIndex
CREATE UNIQUE INDEX "locations_slug_active_key" ON "locations"("slug") WHERE ("isActive" = true);

-- CreateIndex
CREATE UNIQUE INDEX "locations_name_active_key" ON "locations"("name") WHERE ("isActive" = true);

-- CreateIndex
CREATE UNIQUE INDEX "space_categories_name_active_key" ON "space_categories"("name") WHERE ("isActive" = true);

-- CreateIndex
CREATE UNIQUE INDEX "space_categories_sortOrder_key" ON "space_categories"("sortOrder");

-- CreateIndex
CREATE INDEX "spaces_name_idx" ON "spaces"("name");

-- CreateIndex
CREATE INDEX "spaces_addressDetail_idx" ON "spaces"("addressDetail");

-- CreateIndex
CREATE INDEX "spaces_isPublished_isActive_idx" ON "spaces"("isPublished", "isActive");

-- CreateIndex
CREATE INDEX "spaces_publishedAt_isActive_idx" ON "spaces"("publishedAt", "isActive");

-- CreateIndex
CREATE INDEX "spaces_locationId_idx" ON "spaces"("locationId");

-- CreateIndex
CREATE INDEX "spaces_categoryId_idx" ON "spaces"("categoryId");

-- CreateIndex
CREATE INDEX "spaces_smartLockDeviceId_idx" ON "spaces"("smartLockDeviceId");

-- CreateIndex
CREATE INDEX "spaces_name_trgm_idx" ON "spaces" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "spaces_slug_trgm_idx" ON "spaces" USING GIN ("slug" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "spaces_slug_active_key" ON "spaces"("slug") WHERE ("isActive" = true);

-- CreateIndex
CREATE INDEX "space_rate_plans_spaceId_updatedAt_idx" ON "space_rate_plans"("spaceId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "blocked_dates_scope_startDate_endDate_idx" ON "blocked_dates"("scope", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "blocked_dates_spaceId_startDate_endDate_idx" ON "blocked_dates"("spaceId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "blocked_dates_locationId_startDate_endDate_idx" ON "blocked_dates"("locationId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "blocked_dates_createdBy_idx" ON "blocked_dates"("createdBy");

-- CreateIndex
CREATE INDEX "reservation_series_spaceId_dtstart_idx" ON "reservation_series"("spaceId", "dtstart");

-- CreateIndex
CREATE INDEX "reservation_series_customerId_idx" ON "reservation_series"("customerId");

-- CreateIndex
CREATE INDEX "reservation_series_createdAt_idx" ON "reservation_series"("createdAt");

-- CreateIndex
CREATE INDEX "reservation_series_deletedAt_idx" ON "reservation_series"("deletedAt");

-- CreateIndex
CREATE INDEX "reservation_series_deletedById_idx" ON "reservation_series"("deletedById") WHERE ("deletedById" IS NOT NULL);

-- CreateIndex
CREATE INDEX "reservation_series_couponId_idx" ON "reservation_series"("couponId") WHERE ("couponId" IS NOT NULL);

-- CreateIndex
CREATE UNIQUE INDEX "reservation_series_space_dtstart_active_unique" ON "reservation_series"("spaceId", "dtstart") WHERE ("deletedAt" IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "reservations_stripeCheckoutSessionId_key" ON "reservations"("stripeCheckoutSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_stripePaymentIntentId_key" ON "reservations"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "reservations_userId_idx" ON "reservations"("userId");

-- CreateIndex
CREATE INDEX "reservations_startTime_idx" ON "reservations"("startTime");

-- CreateIndex
CREATE INDEX "reservations_endTime_idx" ON "reservations"("endTime");

-- CreateIndex
CREATE INDEX "reservations_status_idx" ON "reservations"("status");

-- CreateIndex
CREATE INDEX "reservations_createdAt_idx" ON "reservations"("createdAt");

-- CreateIndex
CREATE INDEX "reservations_spaceId_startTime_endTime_idx" ON "reservations"("spaceId", "startTime", "endTime");

-- CreateIndex
CREATE INDEX "reservations_customerId_startTime_idx" ON "reservations"("customerId", "startTime");

-- CreateIndex
CREATE INDEX "reservations_couponId_idx" ON "reservations"("couponId");

-- CreateIndex
CREATE INDEX "reservations_deletedAt_idx" ON "reservations"("deletedAt");

-- CreateIndex
CREATE INDEX "reservations_paymentStatus_idx" ON "reservations"("paymentStatus");

-- CreateIndex
CREATE INDEX "reservations_seriesId_recurrenceInstanceIndex_idx" ON "reservations"("seriesId", "recurrenceInstanceIndex");

-- CreateIndex
CREATE INDEX "reservations_deletedById_idx" ON "reservations"("deletedById") WHERE ("deletedById" IS NOT NULL);

-- CreateIndex
CREATE UNIQUE INDEX "customers_userId_key" ON "customers"("userId");

-- CreateIndex
CREATE INDEX "customers_firstName_idx" ON "customers"("firstName");

-- CreateIndex
CREATE INDEX "customers_phoneNumber_idx" ON "customers"("phoneNumber");

-- CreateIndex
CREATE INDEX "customers_status_idx" ON "customers"("status");

-- CreateIndex
CREATE INDEX "customers_customerType_idx" ON "customers"("customerType");

-- CreateIndex
CREATE INDEX "customers_emailCanonical_userId_idx" ON "customers"("emailCanonical", "userId");

-- CreateIndex
CREATE INDEX "customers_isActive_idx" ON "customers"("isActive");

-- CreateIndex
CREATE INDEX "customers_lastReservationAt_idx" ON "customers"("lastReservationAt");

-- CreateIndex
CREATE INDEX "customers_lastName_firstName_idx" ON "customers"("lastName", "firstName");

-- CreateIndex
CREATE INDEX "customers_emailDeliveryStatus_idx" ON "customers"("emailDeliveryStatus");

-- CreateIndex
CREATE INDEX "customers_flaggedForReviewAt_idx" ON "customers"("flaggedForReviewAt");

-- CreateIndex
CREATE INDEX "customers_last_name_trgm_idx" ON "customers" USING GIN ("lastName" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "customers_first_name_trgm_idx" ON "customers" USING GIN ("firstName" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "customers_email_trgm_idx" ON "customers" USING GIN ("email" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "customers_company_name_trgm_idx" ON "customers" USING GIN ("companyName" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "customers_suppressed_email_hash_idx" ON "customers"("suppressedEmailHash") WHERE ("suppressedEmailHash" IS NOT NULL);

-- CreateIndex
CREATE INDEX "customers_createdAt_idx" ON "customers"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "pending_customer_email_changes_tokenHash_key" ON "pending_customer_email_changes"("tokenHash");

-- CreateIndex
CREATE INDEX "pending_customer_email_changes_customerId_idx" ON "pending_customer_email_changes"("customerId");

-- CreateIndex
CREATE INDEX "pending_customer_email_changes_expiresAt_idx" ON "pending_customer_email_changes"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "pending_customer_merges_tokenHash_key" ON "pending_customer_merges"("tokenHash");

-- CreateIndex
CREATE INDEX "pending_customer_merges_targetCustomerId_idx" ON "pending_customer_merges"("targetCustomerId");

-- CreateIndex
CREATE INDEX "pending_customer_merges_expiresAt_idx" ON "pending_customer_merges"("expiresAt");

-- CreateIndex
CREATE INDEX "pending_customer_merges_sourceCustomerId_idx" ON "pending_customer_merges"("sourceCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "coupons_code_key" ON "coupons"("code");

-- CreateIndex
CREATE INDEX "coupons_validFrom_validUntil_idx" ON "coupons"("validFrom", "validUntil");

-- CreateIndex
CREATE INDEX "coupons_isActive_idx" ON "coupons"("isActive");

-- CreateIndex
CREATE INDEX "coupons_code_trgm_idx" ON "coupons" USING GIN ("code" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "coupons_name_trgm_idx" ON "coupons" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "inquiries_receiptNumber_key" ON "inquiries"("receiptNumber");

-- CreateIndex
CREATE INDEX "inquiries_email_idx" ON "inquiries"("email");

-- CreateIndex
CREATE INDEX "inquiries_status_idx" ON "inquiries"("status");

-- CreateIndex
CREATE INDEX "inquiries_createdAt_status_idx" ON "inquiries"("createdAt", "status");

-- CreateIndex
CREATE INDEX "inquiries_customerId_createdAt_idx" ON "inquiries"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "inquiries_customerId_status_idx" ON "inquiries"("customerId", "status");

-- CreateIndex
CREATE INDEX "inquiries_assigneeId_idx" ON "inquiries"("assigneeId");

-- CreateIndex
CREATE INDEX "inquiries_deletedAt_idx" ON "inquiries"("deletedAt");

-- CreateIndex
CREATE INDEX "inquiries_slaExpiresAt_idx" ON "inquiries"("slaExpiresAt");

-- CreateIndex
CREATE INDEX "inquiries_anonymizedAt_idx" ON "inquiries"("anonymizedAt");

-- CreateIndex
CREATE INDEX "inquiries_name_trgm_idx" ON "inquiries" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "inquiries_email_trgm_idx" ON "inquiries" USING GIN ("email" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "inquiries_subject_trgm_idx" ON "inquiries" USING GIN ("subject" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "inquiry_replies_inquiryId_createdAt_idx" ON "inquiry_replies"("inquiryId", "createdAt");

-- CreateIndex
CREATE INDEX "inquiry_replies_authorId_idx" ON "inquiry_replies"("authorId");

-- CreateIndex
CREATE INDEX "inquiry_replies_authorCustomerId_idx" ON "inquiry_replies"("authorCustomerId");

-- CreateIndex
CREATE INDEX "inquiry_status_history_inquiryId_createdAt_idx" ON "inquiry_status_history"("inquiryId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "inquiry_attachments_r2Key_key" ON "inquiry_attachments"("r2Key");

-- CreateIndex
CREATE INDEX "inquiry_attachments_inquiryId_createdAt_idx" ON "inquiry_attachments"("inquiryId", "createdAt");

-- CreateIndex
CREATE INDEX "inquiry_attachments_replyId_idx" ON "inquiry_attachments"("replyId");

-- CreateIndex
CREATE INDEX "inquiry_attachments_uploadedById_idx" ON "inquiry_attachments"("uploadedById") WHERE ("uploadedById" IS NOT NULL);

-- CreateIndex
CREATE INDEX "inquiry_attachments_uploadedByCustomerId_idx" ON "inquiry_attachments"("uploadedByCustomerId") WHERE ("uploadedByCustomerId" IS NOT NULL);

-- CreateIndex
CREATE INDEX "inquiry_internal_notes_inquiryId_createdAt_idx" ON "inquiry_internal_notes"("inquiryId", "createdAt");

-- CreateIndex
CREATE INDEX "inquiry_internal_notes_authorId_idx" ON "inquiry_internal_notes"("authorId");

-- CreateIndex
CREATE UNIQUE INDEX "inquiry_tags_name_key" ON "inquiry_tags"("name");

-- CreateIndex
CREATE INDEX "inquiry_tag_on_inquiries_tagId_idx" ON "inquiry_tag_on_inquiries"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "news_slug_key" ON "news"("slug");

-- CreateIndex
CREATE INDEX "news_title_idx" ON "news"("title");

-- CreateIndex
CREATE INDEX "news_isPublished_publishedAt_idx" ON "news"("isPublished", "publishedAt");

-- CreateIndex
CREATE INDEX "news_createdAt_idx" ON "news"("createdAt");

-- CreateIndex
CREATE INDEX "news_title_trgm_idx" ON "news" USING GIN ("title" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "news_slug_trgm_idx" ON "news" USING GIN ("slug" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "announcement_bars_isActive_displayOrder_idx" ON "announcement_bars"("isActive", "displayOrder");

-- CreateIndex
CREATE INDEX "announcement_bars_startAt_endAt_idx" ON "announcement_bars"("startAt", "endAt");

-- CreateIndex
CREATE UNIQUE INDEX "announcement_bars_displayOrder_key" ON "announcement_bars"("displayOrder");

-- CreateIndex
CREATE INDEX "posts_title_idx" ON "posts"("title");

-- CreateIndex
CREATE INDEX "posts_authorId_idx" ON "posts"("authorId");

-- CreateIndex
CREATE INDEX "posts_status_publishedAt_idx" ON "posts"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "posts_categoryId_status_publishedAt_idx" ON "posts"("categoryId", "status", "publishedAt");

-- CreateIndex
CREATE INDEX "posts_viewCount_idx" ON "posts"("viewCount");

-- CreateIndex
CREATE INDEX "posts_status_viewCount_idx" ON "posts"("status", "viewCount");

-- CreateIndex
CREATE INDEX "posts_deletedAt_idx" ON "posts"("deletedAt");

-- CreateIndex
CREATE INDEX "posts_title_trgm_idx" ON "posts" USING GIN ("title" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "posts_slug_trgm_idx" ON "posts" USING GIN ("slug" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "posts_createdAt_alive_idx" ON "posts"("createdAt") WHERE ("deletedAt" IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "posts_slug_active_key" ON "posts"("slug") WHERE ("deletedAt" IS NULL);

-- CreateIndex
CREATE INDEX "post_tag_on_posts_tagId_idx" ON "post_tag_on_posts"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "post_categories_name_key" ON "post_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "post_categories_slug_key" ON "post_categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "post_categories_order_key" ON "post_categories"("order");

-- CreateIndex
CREATE UNIQUE INDEX "post_tags_name_key" ON "post_tags"("name");

-- CreateIndex
CREATE UNIQUE INDEX "post_tags_slug_key" ON "post_tags"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "pages_slug_key" ON "pages"("slug");

-- CreateIndex
CREATE INDEX "pages_isPublished_isActive_idx" ON "pages"("isPublished", "isActive");

-- CreateIndex
CREATE INDEX "pages_isSystemPage_idx" ON "pages"("isSystemPage");

-- CreateIndex
CREATE INDEX "pages_title_trgm_idx" ON "pages" USING GIN ("title" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "pages_slug_trgm_idx" ON "pages" USING GIN ("slug" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "sections_pageId_order_isActive_idx" ON "sections"("pageId", "order", "isActive");

-- CreateIndex
CREATE INDEX "sections_type_idx" ON "sections"("type");

-- CreateIndex
CREATE UNIQUE INDEX "sections_pageId_order_key" ON "sections"("pageId", "order");

-- CreateIndex
CREATE INDEX "navigation_items_parentId_idx" ON "navigation_items"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "navigation_items_type_order_key" ON "navigation_items"("type", "order");

-- CreateIndex
CREATE UNIQUE INDEX "social_links_order_key" ON "social_links"("order");

-- CreateIndex
CREATE INDEX "faq_categories_order_idx" ON "faq_categories"("order");

-- CreateIndex
CREATE INDEX "faq_categories_isActive_order_idx" ON "faq_categories"("isActive", "order");

-- CreateIndex
CREATE INDEX "faq_categories_deletedAt_idx" ON "faq_categories"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "faq_categories_slug_active_key" ON "faq_categories"("slug") WHERE ("deletedAt" IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "faq_categories_order_active_key" ON "faq_categories"("order") WHERE ("deletedAt" IS NULL);

-- CreateIndex
CREATE INDEX "faq_items_categoryId_order_idx" ON "faq_items"("categoryId", "order");

-- CreateIndex
CREATE INDEX "faq_items_categoryId_isPublished_order_idx" ON "faq_items"("categoryId", "isPublished", "order");

-- CreateIndex
CREATE INDEX "faq_items_isPublished_idx" ON "faq_items"("isPublished");

-- CreateIndex
CREATE INDEX "faq_items_deletedAt_idx" ON "faq_items"("deletedAt");

-- CreateIndex
CREATE INDEX "faq_items_updatedAt_idx" ON "faq_items"("updatedAt");

-- CreateIndex
CREATE INDEX "faq_items_viewCount_idx" ON "faq_items"("viewCount");

-- CreateIndex
CREATE INDEX "faq_items_question_trgm_idx" ON "faq_items" USING GIN ("question" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "faq_items_answer_trgm_idx" ON "faq_items" USING GIN ("answer" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "faq_items_categoryId_order_active_key" ON "faq_items"("categoryId", "order") WHERE ("deletedAt" IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "instagram_posts_postId_key" ON "instagram_posts"("postId");

-- CreateIndex
CREATE UNIQUE INDEX "instagram_posts_sortOrder_key" ON "instagram_posts"("sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "audit_logs_sequence_key" ON "audit_logs"("sequence");

-- CreateIndex
CREATE INDEX "audit_logs_resource_resourceId_idx" ON "audit_logs"("resource", "resourceId");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_userId_createdAt_idx" ON "audit_logs"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_hashKeyId_sequence_idx" ON "audit_logs"("hashKeyId", "sequence");

-- CreateIndex
CREATE INDEX "media_type_usage_idx" ON "media"("type", "usage");

-- CreateIndex
CREATE INDEX "media_uploadedBy_idx" ON "media"("uploadedBy");

-- CreateIndex
CREATE INDEX "media_isActive_createdAt_idx" ON "media"("isActive", "createdAt");

-- CreateIndex
CREATE INDEX "media_mimeType_idx" ON "media"("mimeType");

-- CreateIndex
CREATE INDEX "terms_documents_type_idx" ON "terms_documents"("type");

-- CreateIndex
CREATE INDEX "terms_documents_deletedAt_isPublished_idx" ON "terms_documents"("deletedAt", "isPublished");

-- CreateIndex
CREATE INDEX "terms_documents_showInFooter_isPublished_displayOrder_idx" ON "terms_documents"("showInFooter", "isPublished", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "terms_documents_slug_active_key" ON "terms_documents"("slug") WHERE ("deletedAt" IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "terms_documents_displayOrder_active_key" ON "terms_documents"("displayOrder") WHERE ("deletedAt" IS NULL);

-- CreateIndex
CREATE INDEX "terms_agreements_termsId_idx" ON "terms_agreements"("termsId");

-- CreateIndex
CREATE INDEX "terms_agreements_customerId_idx" ON "terms_agreements"("customerId");

-- CreateIndex
CREATE INDEX "terms_agreements_resourceId_idx" ON "terms_agreements"("resourceId");

-- CreateIndex
CREATE INDEX "terms_agreements_agreedAt_idx" ON "terms_agreements"("agreedAt");

-- CreateIndex
CREATE INDEX "terms_agreements_scope_agreedAt_idx" ON "terms_agreements"("scope", "agreedAt");

-- CreateIndex
CREATE INDEX "terms_agreements_guest_email_trgm_idx" ON "terms_agreements" USING GIN ("guestEmail" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "editor_comment_threads_contentType_contentId_status_idx" ON "editor_comment_threads"("contentType", "contentId", "status");

-- CreateIndex
CREATE INDEX "editor_comment_threads_createdBy_idx" ON "editor_comment_threads"("createdBy");

-- CreateIndex
CREATE INDEX "editor_comment_threads_status_createdAt_idx" ON "editor_comment_threads"("status", "createdAt");

-- CreateIndex
CREATE INDEX "editor_comment_threads_resolvedBy_idx" ON "editor_comment_threads"("resolvedBy") WHERE ("resolvedBy" IS NOT NULL);

-- CreateIndex
CREATE UNIQUE INDEX "editor_comment_threads_markId_contentType_contentId_key" ON "editor_comment_threads"("markId", "contentType", "contentId");

-- CreateIndex
CREATE INDEX "editor_comments_threadId_createdAt_idx" ON "editor_comments"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "editor_comments_createdBy_idx" ON "editor_comments"("createdBy");

-- CreateIndex
CREATE INDEX "editor_comments_isDeleted_idx" ON "editor_comments"("isDeleted");

-- CreateIndex
CREATE INDEX "editor_comments_deletedBy_idx" ON "editor_comments"("deletedBy") WHERE ("deletedBy" IS NOT NULL);

-- CreateIndex
CREATE INDEX "block_templates_createdBy_idx" ON "block_templates"("createdBy");

-- CreateIndex
CREATE INDEX "block_templates_createdAt_idx" ON "block_templates"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "space_reviews_reservationId_key" ON "space_reviews"("reservationId");

-- CreateIndex
CREATE INDEX "space_reviews_spaceId_isPublished_createdAt_idx" ON "space_reviews"("spaceId", "isPublished", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "space_reviews_customerId_idx" ON "space_reviews"("customerId");

-- CreateIndex
CREATE INDEX "space_reviews_repliedById_idx" ON "space_reviews"("repliedById");

-- CreateIndex
CREATE INDEX "event_time_slots_time_range_idx" ON "event_time_slots"("startAt", "endAt");

-- CreateIndex
CREATE UNIQUE INDEX "event_time_slots_eventId_startAt_key" ON "event_time_slots"("eventId", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "event_categories_name_active_key" ON "event_categories"("name") WHERE ("isActive" = true);

-- CreateIndex
CREATE UNIQUE INDEX "event_categories_sortOrder_key" ON "event_categories"("sortOrder");

-- CreateIndex
CREATE INDEX "events_status_idx" ON "events"("status");

-- CreateIndex
CREATE INDEX "events_categoryId_idx" ON "events"("categoryId");

-- CreateIndex
CREATE INDEX "events_locationId_idx" ON "events"("locationId");

-- CreateIndex
CREATE INDEX "events_spaceId_idx" ON "events"("spaceId");

-- CreateIndex
CREATE INDEX "events_deletedAt_idx" ON "events"("deletedAt");

-- CreateIndex
CREATE INDEX "events_firstSlotStartAt_idx" ON "events"("firstSlotStartAt");

-- CreateIndex
CREATE INDEX "events_lastSlotEndAt_idx" ON "events"("lastSlotEndAt");

-- CreateIndex
CREATE INDEX "events_title_trgm_idx" ON "events" USING GIN ("title" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "events_slug_trgm_idx" ON "events" USING GIN ("slug" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "events_spaceId_alive_idx" ON "events"("spaceId") WHERE ("deletedAt" IS NULL AND "spaceId" IS NOT NULL);

-- CreateIndex
CREATE INDEX "events_deletedById_idx" ON "events"("deletedById") WHERE ("deletedById" IS NOT NULL);

-- CreateIndex
CREATE UNIQUE INDEX "events_slug_active_key" ON "events"("slug") WHERE ("deletedAt" IS NULL);

-- CreateIndex
CREATE INDEX "event_tickets_eventId_isAvailable_idx" ON "event_tickets"("eventId", "isAvailable");

-- CreateIndex
CREATE UNIQUE INDEX "event_tickets_eventId_sortOrder_key" ON "event_tickets"("eventId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "event_registrations_stripeCheckoutSessionId_key" ON "event_registrations"("stripeCheckoutSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "event_registrations_stripePaymentIntentId_key" ON "event_registrations"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "event_registrations_slotId_status_idx" ON "event_registrations"("slotId", "status");

-- CreateIndex
CREATE INDEX "event_registrations_ticketId_idx" ON "event_registrations"("ticketId");

-- CreateIndex
CREATE INDEX "event_registrations_customerId_idx" ON "event_registrations"("customerId");

-- CreateIndex
CREATE INDEX "event_registrations_eventId_status_createdAt_idx" ON "event_registrations"("eventId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "event_registrations_eventId_attendedAt_idx" ON "event_registrations"("eventId", "attendedAt");

-- CreateIndex
CREATE INDEX "event_registrations_paymentStatus_idx" ON "event_registrations"("paymentStatus");

-- CreateIndex
CREATE INDEX "event_registrations_slotId_ticketId_status_waitlistedAt_idx" ON "event_registrations"("slotId", "ticketId", "status", "waitlistedAt");

-- CreateIndex
CREATE INDEX "event_registrations_status_expiresAt_idx" ON "event_registrations"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_stripeRefundId_key" ON "refunds"("stripeRefundId");

-- CreateIndex
CREATE INDEX "refunds_reservationId_idx" ON "refunds"("reservationId");

-- CreateIndex
CREATE INDEX "refunds_eventRegistrationId_idx" ON "refunds"("eventRegistrationId");

-- CreateIndex
CREATE INDEX "refunds_createdAt_idx" ON "refunds"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_serialNo_key" ON "receipts"("serialNo");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_reservationId_key" ON "receipts"("reservationId");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_eventRegistrationId_key" ON "receipts"("eventRegistrationId");

-- CreateIndex
CREATE INDEX "receipts_issuedAt_idx" ON "receipts"("issuedAt");

-- CreateIndex
CREATE INDEX "receipts_reissuedFromId_idx" ON "receipts"("reissuedFromId") WHERE ("reissuedFromId" IS NOT NULL);

-- CreateIndex
CREATE INDEX "admin_notification_isRead_createdAt_idx" ON "admin_notification"("isRead", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "admin_notification_type_idx" ON "admin_notification"("type");

-- CreateIndex
CREATE INDEX "admin_notification_createdAt_idx" ON "admin_notification"("createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "smart_lock_devices_deviceId_key" ON "smart_lock_devices"("deviceId");

-- CreateIndex
CREATE INDEX "smart_lock_devices_locationId_idx" ON "smart_lock_devices"("locationId");

-- CreateIndex
CREATE INDEX "smart_lock_devices_pairedLockDeviceId_idx" ON "smart_lock_devices"("pairedLockDeviceId") WHERE ("pairedLockDeviceId" IS NOT NULL);

-- CreateIndex
CREATE INDEX "smart_lock_passcodes_status_endTime_idx" ON "smart_lock_passcodes"("status", "endTime");

-- CreateIndex
CREATE INDEX "smart_lock_passcodes_status_revokeRequestedAt_idx" ON "smart_lock_passcodes"("status", "revokeRequestedAt");

-- CreateIndex
CREATE INDEX "smart_lock_passcodes_deviceId_idx" ON "smart_lock_passcodes"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "smart_lock_passcodes_reservationId_deviceId_key" ON "smart_lock_passcodes"("reservationId", "deviceId");

-- CreateIndex
CREATE INDEX "stripe_events_receivedAt_idx" ON "stripe_events"("receivedAt");

-- CreateIndex
CREATE INDEX "transfer_accounts_isActive_sortOrder_idx" ON "transfer_accounts"("isActive", "sortOrder");

-- AddForeignKey
ALTER TABLE "user_page_assignments" ADD CONSTRAINT "user_page_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_page_assignments" ADD CONSTRAINT "user_page_assignments_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_defaultSmartLockDeviceId_fkey" FOREIGN KEY ("defaultSmartLockDeviceId") REFERENCES "smart_lock_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "space_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_smartLockDeviceId_fkey" FOREIGN KEY ("smartLockDeviceId") REFERENCES "smart_lock_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "space_rate_plans" ADD CONSTRAINT "space_rate_plans_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocked_dates" ADD CONSTRAINT "blocked_dates_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocked_dates" ADD CONSTRAINT "blocked_dates_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocked_dates" ADD CONSTRAINT "blocked_dates_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_series" ADD CONSTRAINT "reservation_series_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_series" ADD CONSTRAINT "reservation_series_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_series" ADD CONSTRAINT "reservation_series_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_series" ADD CONSTRAINT "reservation_series_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "reservation_series"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_customer_email_changes" ADD CONSTRAINT "pending_customer_email_changes_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_customer_merges" ADD CONSTRAINT "pending_customer_merges_targetCustomerId_fkey" FOREIGN KEY ("targetCustomerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_customer_merges" ADD CONSTRAINT "pending_customer_merges_sourceCustomerId_fkey" FOREIGN KEY ("sourceCustomerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiry_replies" ADD CONSTRAINT "inquiry_replies_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "inquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiry_replies" ADD CONSTRAINT "inquiry_replies_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiry_replies" ADD CONSTRAINT "inquiry_replies_authorCustomerId_fkey" FOREIGN KEY ("authorCustomerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiry_status_history" ADD CONSTRAINT "inquiry_status_history_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "inquiries"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "inquiry_attachments" ADD CONSTRAINT "inquiry_attachments_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "inquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiry_attachments" ADD CONSTRAINT "inquiry_attachments_replyId_fkey" FOREIGN KEY ("replyId") REFERENCES "inquiry_replies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiry_attachments" ADD CONSTRAINT "inquiry_attachments_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiry_attachments" ADD CONSTRAINT "inquiry_attachments_uploadedByCustomerId_fkey" FOREIGN KEY ("uploadedByCustomerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiry_internal_notes" ADD CONSTRAINT "inquiry_internal_notes_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "inquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiry_internal_notes" ADD CONSTRAINT "inquiry_internal_notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiry_tag_on_inquiries" ADD CONSTRAINT "inquiry_tag_on_inquiries_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "inquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiry_tag_on_inquiries" ADD CONSTRAINT "inquiry_tag_on_inquiries_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "inquiry_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "post_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_tag_on_posts" ADD CONSTRAINT "post_tag_on_posts_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_tag_on_posts" ADD CONSTRAINT "post_tag_on_posts_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "post_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "navigation_items" ADD CONSTRAINT "navigation_items_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "navigation_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faq_items" ADD CONSTRAINT "faq_items_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "faq_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terms_agreements" ADD CONSTRAINT "terms_agreements_termsId_fkey" FOREIGN KEY ("termsId") REFERENCES "terms_documents"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "editor_comment_threads" ADD CONSTRAINT "editor_comment_threads_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "editor_comment_threads" ADD CONSTRAINT "editor_comment_threads_resolvedBy_fkey" FOREIGN KEY ("resolvedBy") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "editor_comments" ADD CONSTRAINT "editor_comments_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "editor_comment_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "editor_comments" ADD CONSTRAINT "editor_comments_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "editor_comments" ADD CONSTRAINT "editor_comments_deletedBy_fkey" FOREIGN KEY ("deletedBy") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "block_templates" ADD CONSTRAINT "block_templates_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "space_reviews" ADD CONSTRAINT "space_reviews_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "space_reviews" ADD CONSTRAINT "space_reviews_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "space_reviews" ADD CONSTRAINT "space_reviews_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "space_reviews" ADD CONSTRAINT "space_reviews_repliedById_fkey" FOREIGN KEY ("repliedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_time_slots" ADD CONSTRAINT "event_time_slots_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "event_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_tickets" ADD CONSTRAINT "event_tickets_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "event_time_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "event_tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_eventRegistrationId_fkey" FOREIGN KEY ("eventRegistrationId") REFERENCES "event_registrations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_eventRegistrationId_fkey" FOREIGN KEY ("eventRegistrationId") REFERENCES "event_registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_reissuedFromId_fkey" FOREIGN KEY ("reissuedFromId") REFERENCES "receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smart_lock_devices" ADD CONSTRAINT "smart_lock_devices_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smart_lock_devices" ADD CONSTRAINT "smart_lock_devices_pairedLockDeviceId_fkey" FOREIGN KEY ("pairedLockDeviceId") REFERENCES "smart_lock_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smart_lock_passcodes" ADD CONSTRAINT "smart_lock_passcodes_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smart_lock_passcodes" ADD CONSTRAINT "smart_lock_passcodes_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "smart_lock_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- baseline invariants — Prisma DSL で表現できない不変条件
-- ============================================================================
--
-- `prisma migrate diff --from-empty --to-schema` が出す DDL には
-- **CHECK 制約・EXCLUDE 制約・plpgsql 関数・trigger が一切含まれない**。
-- Prisma のスキーマ言語がそれらを表現できないため。migration 履歴を 1 本の
-- baseline へ畳むと、この 100 件が黙って消える。
--
-- このファイルは `scripts/build-baseline-migration.ts` が生成 DDL の**後ろ**に
-- 連結する。extension だけは GIN index より前に要るので別ファイル
-- （`extensions.sql`）で prelude として先に流す。
--
-- 中身は手で列挙していない。migration 履歴を適用した DB と、生成 DDL だけを
-- 適用した DB の **pg_catalog センサス差分**から機械的に起こしてある
-- （`scripts/db-census.ts`）。手で書くと必ず取りこぼす。
--
-- ## 意図的に含めないもの
--
-- - `audit_logs_sequence_key` — 履歴では `ADD CONSTRAINT ... UNIQUE`、Prisma は
--   `CREATE UNIQUE INDEX` で出す。強制力は同一でカタログ上の表現だけが違う。
--   ここで constraint として作り直すと Prisma が作った同名 index と衝突する。
--
-- ## 順序
--
-- NOT NULL → CHECK → 関数 → EXCLUDE → trigger。trigger は関数が先に無いと作れない。
-- ============================================================================


-- ===== スカラー配列列の NOT NULL (3) =====
--
-- Prisma は `String[]` に NOT NULL を出さない（Prisma 側の型は非 null なので
-- クライアントが null を書かない前提）。履歴では手書き migration が付けていた。
-- 落とすと「Prisma 経由以外の書込で null が入る」余地が開くので復元する。

ALTER TABLE "settings_notifications" ALTER COLUMN "notificationEmailAddresses" SET NOT NULL;

ALTER TABLE "settings_notifications" ALTER COLUMN "notificationStaffIds" SET NOT NULL;

ALTER TABLE "settings_stripes" ALTER COLUMN "stripePaymentMethodTypes" SET NOT NULL;

-- ===== CHECK constraints (76) =====
ALTER TABLE "announcement_bars" ADD CONSTRAINT "announcement_bars_message_array_check" CHECK (((message IS NULL) OR (jsonb_typeof(message) = 'array'::text)));

ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_chain_version_check" CHECK (("chainVersion" = 1));

ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_entry_hash_hex_check" CHECK (("entryHash" ~ '^[0-9a-f]{64}$'::text));

ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_hash_algorithm_check" CHECK ((("hashAlgorithm")::text = 'HMAC-SHA256'::text));

ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_hash_key_id_check" CHECK ((("hashKeyId")::text ~ '^[A-Za-z0-9_-]{1,32}$'::text));

ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_previous_hash_hex_check" CHECK (("previousHash" ~ '^[0-9a-f]{64}$'::text));

ALTER TABLE "blocked_dates" ADD CONSTRAINT "blocked_dates_scope_target_check" CHECK (((((scope)::text = 'SPACE'::text) AND ("spaceId" IS NOT NULL) AND ("locationId" IS NULL)) OR (((scope)::text = 'LOCATION'::text) AND ("locationId" IS NOT NULL) AND ("spaceId" IS NULL)) OR (((scope)::text = 'GLOBAL'::text) AND ("spaceId" IS NULL) AND ("locationId" IS NULL))));

ALTER TABLE "coupons" ADD CONSTRAINT "coupons_amount_bounds_check" CHECK (((("maxDiscountAmount" IS NULL) OR ("maxDiscountAmount" > 0)) AND (("minReservationAmount" IS NULL) OR ("minReservationAmount" >= 0))));

ALTER TABLE "coupons" ADD CONSTRAINT "coupons_discount_value_range_check" CHECK ((("discountValue" > 0) AND ((type <> 'PERCENTAGE'::"CouponType") OR ("discountValue" <= 100))));

ALTER TABLE "coupons" ADD CONSTRAINT "coupons_usage_range_check" CHECK ((("usageCount" >= 0) AND (("usageLimit" IS NULL) OR ("usageLimit" >= 1))));

ALTER TABLE "customers" ADD CONSTRAINT "customers_emailCanonical_not_empty_check" CHECK ((btrim("emailCanonical") <> ''::text));

ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_quantity_positive" CHECK ((quantity >= 1));

ALTER TABLE "event_tickets" ADD CONSTRAINT "event_tickets_capacity_positive_or_null" CHECK (((capacity IS NULL) OR (capacity >= 1)));

ALTER TABLE "event_tickets" ADD CONSTRAINT "event_tickets_price_non_negative" CHECK ((price >= 0));

ALTER TABLE "event_tickets" ADD CONSTRAINT "event_tickets_unit_size_positive" CHECK (("unitSize" >= 1));

ALTER TABLE "event_time_slots" ADD CONSTRAINT "event_time_slots_capacity_positive" CHECK ((capacity >= 1));

ALTER TABLE "event_time_slots" ADD CONSTRAINT "event_time_slots_time_order" CHECK (("startAt" < "endAt"));

ALTER TABLE "events" ADD CONSTRAINT "event_online_meeting_url_required" CHECK (((format = 'OFFLINE'::"EventFormat") OR ("meetingProvider" = 'GOOGLE_MEET'::"MeetingProvider") OR ("meetingUrl" IS NOT NULL)));

ALTER TABLE "events" ADD CONSTRAINT "events_gallery_array_check" CHECK (((gallery IS NULL) OR (jsonb_typeof(gallery) = 'array'::text)));

ALTER TABLE "inquiry_attachments" ADD CONSTRAINT "inquiry_attachments_uploader_side_check" CHECK (((("uploadedById" IS NOT NULL) AND ("uploadedByCustomerId" IS NULL)) OR (("uploadedByCustomerId" IS NOT NULL) AND ("uploadedById" IS NULL))));

ALTER TABLE "inquiry_replies" ADD CONSTRAINT "inquiry_replies_author_side_check" CHECK (((("authorType" = 'STAFF'::"InquiryReplyAuthorType") AND ("authorId" IS NOT NULL) AND ("authorCustomerId" IS NULL)) OR (("authorType" = 'CUSTOMER'::"InquiryReplyAuthorType") AND ("authorCustomerId" IS NOT NULL) AND ("authorId" IS NULL))));

ALTER TABLE "locations" ADD CONSTRAINT "locations_accessLines_array_check" CHECK ((("accessLines" IS NULL) OR (jsonb_typeof("accessLines") = 'array'::text)));

ALTER TABLE "locations" ADD CONSTRAINT "locations_imageUrls_array_check" CHECK ((("imageUrls" IS NULL) OR (jsonb_typeof("imageUrls") = 'array'::text)));

ALTER TABLE "media" ADD CONSTRAINT "media_tags_array_check" CHECK (((tags IS NULL) OR (jsonb_typeof(tags) = 'array'::text)));

ALTER TABLE "receipt_sequences" ADD CONSTRAINT "receipt_sequences_singleton_check" CHECK (((id)::text = 'singleton'::text));

ALTER TABLE "receipts" ADD CONSTRAINT "receipts_money_non_negative_check" CHECK (((amount >= 0) AND ("taxAmount" >= 0)));

ALTER TABLE "receipts" ADD CONSTRAINT "receipts_target_exclusive_check" CHECK ((NOT (("reservationId" IS NOT NULL) AND ("eventRegistrationId" IS NOT NULL))));

ALTER TABLE "receipts" ADD CONSTRAINT "receipts_tax_rate_range_check" CHECK ((("taxRate" >= 0) AND ("taxRate" <= 100)));

ALTER TABLE "refunds" ADD CONSTRAINT "refunds_amount_positive_check" CHECK ((amount >= 1));

ALTER TABLE "refunds" ADD CONSTRAINT "refunds_refundedByType_check" CHECK ((("refundedByType")::text = ANY ((ARRAY['ADMIN'::character varying, 'AUTO_ON_CANCEL'::character varying, 'AUTO_CAPACITY_RACE'::character varying, 'AUTO_AMOUNT_MISMATCH'::character varying, 'STRIPE_DASHBOARD'::character varying])::text[])));

ALTER TABLE "refunds" ADD CONSTRAINT "refunds_status_check" CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'requires_action'::character varying, 'succeeded'::character varying, 'failed'::character varying, 'canceled'::character varying])::text[])));

ALTER TABLE "refunds" ADD CONSTRAINT "refunds_target_check" CHECK (((("reservationId" IS NOT NULL) AND ("eventRegistrationId" IS NULL)) OR (("reservationId" IS NULL) AND ("eventRegistrationId" IS NOT NULL))));

ALTER TABLE "reservations" ADD CONSTRAINT "reservations_money_non_negative_check" CHECK ((("basePrice" >= 0) AND ("totalPrice" >= 0) AND ("taxAmount" >= 0) AND ("totalPriceWithTax" >= 0) AND (("couponDiscountAmount" IS NULL) OR ("couponDiscountAmount" >= 0)) AND (("durationDiscountAmount" IS NULL) OR ("durationDiscountAmount" >= 0)) AND (("spaceDiscountAmount" IS NULL) OR ("spaceDiscountAmount" >= 0))));

ALTER TABLE "reservations" ADD CONSTRAINT "reservations_number_of_guests_positive_check" CHECK ((("numberOfGuests" IS NULL) OR ("numberOfGuests" >= 1)));

ALTER TABLE "reservations" ADD CONSTRAINT "reservations_tax_rate_range_check" CHECK ((("taxRate" >= 0) AND ("taxRate" <= 100)));

ALTER TABLE "reservations" ADD CONSTRAINT "reservations_time_order_check" CHECK (("startTime" < "endTime"));

ALTER TABLE "settings_analytics" ADD CONSTRAINT "settings_analytics_singleton_check" CHECK ((id = 'singleton'::text));

ALTER TABLE "settings_announcement_carousels" ADD CONSTRAINT "settings_announcement_carousels_singleton_check" CHECK ((id = 'singleton'::text));

ALTER TABLE "settings_commerces" ADD CONSTRAINT "SettingsCommerce_durationDiscountRules_array_check" CHECK ((jsonb_typeof("durationDiscountRules") = 'array'::text));

ALTER TABLE "settings_commerces" ADD CONSTRAINT "settings_commerces_singleton_check" CHECK ((id = 'singleton'::text));

ALTER TABLE "settings_data_retentions" ADD CONSTRAINT "settings_data_retentions_singleton_check" CHECK ((id = 'singleton'::text));

ALTER TABLE "settings_features" ADD CONSTRAINT "settings_features_singleton_check" CHECK ((id = 'singleton'::text));

ALTER TABLE "settings_google_business_profiles" ADD CONSTRAINT "settings_google_business_profiles_singleton_check" CHECK ((id = 'singleton'::text));

ALTER TABLE "settings_google_calendars" ADD CONSTRAINT "settings_google_calendars_connection_status_check" CHECK ((("googleCalendarConnectionStatus" IS NULL) OR ("googleCalendarConnectionStatus" = ANY (ARRAY['connected'::text, 'error'::text]))));

ALTER TABLE "settings_google_calendars" ADD CONSTRAINT "settings_google_calendars_singleton_check" CHECK ((id = 'singleton'::text));

ALTER TABLE "settings_google_maps" ADD CONSTRAINT "settings_google_maps_connection_status_check" CHECK ((("googleMapsConnectionStatus" IS NULL) OR ("googleMapsConnectionStatus" = ANY (ARRAY['connected'::text, 'error'::text]))));

ALTER TABLE "settings_google_maps" ADD CONSTRAINT "settings_google_maps_singleton_check" CHECK ((id = 'singleton'::text));

ALTER TABLE "settings_instagrams" ADD CONSTRAINT "settings_instagrams_singleton_check" CHECK ((id = 'singleton'::text));

ALTER TABLE "settings_layouts" ADD CONSTRAINT "settings_layouts_singleton_check" CHECK ((id = 'singleton'::text));

ALTER TABLE "settings_notifications" ADD CONSTRAINT "SettingsNotification_notificationEmailAddresses_text_array_chec" CHECK (((array_position("notificationEmailAddresses", NULL::text) IS NULL) AND (array_position("notificationEmailAddresses", ''::text) IS NULL)));

ALTER TABLE "settings_notifications" ADD CONSTRAINT "SettingsNotification_notificationStaffIds_text_array_check" CHECK (((array_position("notificationStaffIds", NULL::text) IS NULL) AND (array_position("notificationStaffIds", ''::text) IS NULL)));

ALTER TABLE "settings_notifications" ADD CONSTRAINT "settings_notifications_singleton_check" CHECK ((id = 'singleton'::text));

ALTER TABLE "settings_organizations" ADD CONSTRAINT "settings_organizations_singleton_check" CHECK ((id = 'singleton'::text));

ALTER TABLE "settings_resends" ADD CONSTRAINT "settings_resends_connection_status_check" CHECK ((("resendConnectionStatus" IS NULL) OR ("resendConnectionStatus" = ANY (ARRAY['connected'::text, 'error'::text]))));

ALTER TABLE "settings_resends" ADD CONSTRAINT "settings_resends_singleton_check" CHECK ((id = 'singleton'::text));

ALTER TABLE "settings_reservations" ADD CONSTRAINT "settings_reservations_singleton_check" CHECK ((id = 'singleton'::text));

ALTER TABLE "settings_seos" ADD CONSTRAINT "settings_seos_singleton_check" CHECK ((id = 'singleton'::text));

ALTER TABLE "settings_sidebars" ADD CONSTRAINT "SettingsSidebar_sidebarWidgets_array_check" CHECK ((jsonb_typeof("sidebarWidgets") = 'array'::text));

ALTER TABLE "settings_sidebars" ADD CONSTRAINT "settings_sidebars_singleton_check" CHECK ((id = 'singleton'::text));

ALTER TABLE "settings_stripes" ADD CONSTRAINT "settings_stripes_connection_status_check" CHECK ((("stripeConnectionStatus" IS NULL) OR ("stripeConnectionStatus" = ANY (ARRAY['connected'::text, 'error'::text]))));

ALTER TABLE "settings_stripes" ADD CONSTRAINT "settings_stripes_singleton_check" CHECK ((id = 'singleton'::text));

ALTER TABLE "settings_switchbots" ADD CONSTRAINT "settings_switchbots_connection_status_check" CHECK ((("switchbotConnectionStatus" IS NULL) OR ("switchbotConnectionStatus" = ANY (ARRAY['connected'::text, 'error'::text]))));

ALTER TABLE "settings_switchbots" ADD CONSTRAINT "settings_switchbots_singleton_check" CHECK ((id = 'singleton'::text));

ALTER TABLE "settings_systems" ADD CONSTRAINT "settings_systems_singleton_check" CHECK ((id = 'singleton'::text));

ALTER TABLE "settings_turnstiles" ADD CONSTRAINT "settings_turnstiles_connection_status_check" CHECK ((("turnstileConnectionStatus" IS NULL) OR ("turnstileConnectionStatus" = ANY (ARRAY['connected'::text, 'error'::text]))));

ALTER TABLE "settings_turnstiles" ADD CONSTRAINT "settings_turnstiles_singleton_check" CHECK ((id = 'singleton'::text));

ALTER TABLE "space_rate_plans" ADD CONSTRAINT "space_rate_plans_effective_range_check" CHECK ((("effectiveFrom" IS NULL) OR ("effectiveTo" IS NULL) OR ("effectiveFrom" <= "effectiveTo")));

ALTER TABLE "space_rate_plans" ADD CONSTRAINT "space_rate_plans_endTime_format_check" CHECK ((("endTime" IS NULL) OR (("endTime")::text ~ '^([01][0-9]|2[0-3]|24):[0-5][0-9]$'::text)));

ALTER TABLE "space_rate_plans" ADD CONSTRAINT "space_rate_plans_hourlyPrice_non_negative_check" CHECK ((("hourlyPrice")::numeric >= (0)::numeric));

ALTER TABLE "space_rate_plans" ADD CONSTRAINT "space_rate_plans_startTime_format_check" CHECK ((("startTime" IS NULL) OR (("startTime")::text ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'::text)));

ALTER TABLE "spaces" ADD CONSTRAINT "spaces_area_positive_check" CHECK (((area IS NULL) OR (area > 0)));

ALTER TABLE "spaces" ADD CONSTRAINT "spaces_capacity_positive_check" CHECK ((capacity >= 1));

ALTER TABLE "spaces" ADD CONSTRAINT "spaces_discount_value_range_check" CHECK ((("discountValue" IS NULL) OR (("discountValue" >= 0) AND (("discountType" <> 'percentage'::"DiscountType") OR ("discountValue" <= 100)))));

ALTER TABLE "spaces" ADD CONSTRAINT "spaces_facilities_array_check" CHECK (((facilities IS NULL) OR (jsonb_typeof(facilities) = 'array'::text)));

ALTER TABLE "spaces" ADD CONSTRAINT "spaces_gallery_array_check" CHECK (((gallery IS NULL) OR (jsonb_typeof(gallery) = 'array'::text)));

ALTER TABLE "spaces" ADD CONSTRAINT "spaces_hourly_price_non_negative_check" CHECK (("hourlyPrice" >= 0));


-- ===== plpgsql functions (10) =====
CREATE OR REPLACE FUNCTION public.check_event_no_reservation_overlap()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  conflicting_reservation_id VARCHAR;
  conflicting_slot_id VARCHAR;
BEGIN
  -- spaceId null (外部会場) / soft-deleted / 非 active status は検査対象外
  IF NEW."spaceId" IS NULL
     OR NEW."deletedAt" IS NOT NULL
     OR NEW.status NOT IN ('DRAFT', 'PUBLISHED') THEN
    RETURN NEW;
  END IF;

  SELECT r.id, ets.id
    INTO conflicting_reservation_id, conflicting_slot_id
  FROM event_time_slots ets
  JOIN reservations r
    ON r."spaceId" = NEW."spaceId"
   AND r."deletedAt" IS NULL
   AND r.status IN ('PENDING', 'CONFIRMED')
   AND ets."startAt" < r."endTime"
   AND ets."endAt" > r."startTime"
  WHERE ets."eventId" = NEW.id
  LIMIT 1;

  IF conflicting_reservation_id IS NOT NULL THEN
    RAISE EXCEPTION 'Event slot % overlaps with reservation % on space %',
      conflicting_slot_id, conflicting_reservation_id, NEW."spaceId"
      USING ERRCODE = 'exclusion_violation';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_event_schedule_integrity("targetEventId" uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  current_mode "EventScheduleMode";
  current_deadline timestamp with time zone;
  slot_count integer;
  first_slot_start timestamp with time zone;
BEGIN
  SELECT "scheduleMode", "registrationDeadline"
  INTO current_mode, current_deadline
  FROM "events"
  WHERE "id" = "targetEventId"
    AND "deletedAt" IS NULL;

  IF current_mode IS NULL THEN
    RETURN;
  END IF;

  SELECT COUNT(*), MIN("startAt")
  INTO slot_count, first_slot_start
  FROM "event_time_slots"
  WHERE "eventId" = "targetEventId";

  IF current_mode = 'SINGLE_OCCURRENCE' AND slot_count <> 1 THEN
    RAISE EXCEPTION
      'SINGLE_OCCURRENCE events must have exactly one EventTimeSlot; eventId=%, slot_count=%',
      "targetEventId",
      slot_count
      USING ERRCODE = '23514';
  END IF;

  IF current_mode = 'TIMED_ENTRY' AND slot_count < 2 THEN
    RAISE EXCEPTION
      'TIMED_ENTRY events must have at least two EventTimeSlot rows; eventId=%, slot_count=%',
      "targetEventId",
      slot_count
      USING ERRCODE = '23514';
  END IF;

  IF current_deadline IS NOT NULL
    AND first_slot_start IS NOT NULL
    AND current_deadline > first_slot_start THEN
    RAISE EXCEPTION
      'Event registrationDeadline must be on or before the first slot start; eventId=%',
      "targetEventId"
      USING ERRCODE = '23514';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_event_schedule_integrity_from_event()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM "check_event_schedule_integrity"(NEW."id");
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_event_schedule_integrity_from_slot()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  target_event_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_event_id := OLD."eventId";
    PERFORM "check_event_schedule_integrity"(target_event_id);
    RETURN OLD;
  END IF;

  target_event_id := NEW."eventId";
  PERFORM "check_event_schedule_integrity"(target_event_id);

  IF TG_OP = 'UPDATE' AND OLD."eventId" <> NEW."eventId" THEN
    PERFORM "check_event_schedule_integrity"(OLD."eventId");
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_event_slot_no_reservation_overlap()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  event_space_id UUID;
  event_status TEXT;
  event_deleted_at TIMESTAMP;
  conflicting_reservation_id VARCHAR;
BEGIN
  SELECT "spaceId", status::text, "deletedAt"
    INTO event_space_id, event_status, event_deleted_at
  FROM events
  WHERE id = NEW."eventId";

  -- spaceId null (外部会場) / soft-deleted event / 非 active status は検査対象外
  IF event_space_id IS NULL
     OR event_deleted_at IS NOT NULL
     OR event_status NOT IN ('DRAFT', 'PUBLISHED') THEN
    RETURN NEW;
  END IF;

  SELECT r.id INTO conflicting_reservation_id
  FROM reservations r
  WHERE r."spaceId" = event_space_id
    AND r."deletedAt" IS NULL
    AND r.status IN ('PENDING', 'CONFIRMED')
    AND r."startTime" < NEW."endAt"
    AND r."endTime" > NEW."startAt"
  LIMIT 1;

  IF conflicting_reservation_id IS NOT NULL THEN
    RAISE EXCEPTION 'EventTimeSlot time overlaps with reservation % on space %',
      conflicting_reservation_id, event_space_id
      USING ERRCODE = 'exclusion_violation';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_reservation_no_event_slot_overlap()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  conflicting_slot_id VARCHAR;
BEGIN
  -- soft-deleted or 非 active status は検査対象外
  IF NEW."deletedAt" IS NOT NULL
     OR NEW.status NOT IN ('PENDING', 'CONFIRMED') THEN
    RETURN NEW;
  END IF;

  SELECT ets.id INTO conflicting_slot_id
  FROM event_time_slots ets
  JOIN events e ON e.id = ets."eventId"
  WHERE e."spaceId" = NEW."spaceId"
    AND e."deletedAt" IS NULL
    AND e.status IN ('DRAFT', 'PUBLISHED')
    AND ets."startAt" < NEW."endTime"
    AND ets."endAt" > NEW."startTime"
  LIMIT 1;

  IF conflicting_slot_id IS NOT NULL THEN
    RAISE EXCEPTION 'Reservation time overlaps with EventTimeSlot % on space %',
      conflicting_slot_id, NEW."spaceId"
      USING ERRCODE = 'exclusion_violation';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_audit_logs_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF current_setting('myrrh.audit_log_mutation_bypass', true) = 'seed' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;

    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'audit_logs is append-only; % is not allowed', TG_OP
    USING ERRCODE = 'integrity_constraint_violation';
END;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_inquiry_status_history_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF current_setting('myrrh.inquiry_status_history_mutation_bypass', true) IN ('seed', 'purge') THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;

    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'inquiry_status_history is append-only; % is not allowed', TG_OP
    USING ERRCODE = 'integrity_constraint_violation';
END;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_refunds_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF current_setting('myrrh.refund_mutation_bypass', true) = 'seed' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.id = OLD.id
     AND NEW."reservationId" IS NOT DISTINCT FROM OLD."reservationId"
     AND NEW."eventRegistrationId" IS NOT DISTINCT FROM OLD."eventRegistrationId"
     AND NEW.amount = OLD.amount
     AND NEW.reason IS NOT DISTINCT FROM OLD.reason
     AND NEW."stripeRefundId" = OLD."stripeRefundId"
     AND NEW."refundedByType" = OLD."refundedByType"
     AND NEW."createdAt" = OLD."createdAt"
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'refunds is append-only (status is the only mutable column); % is not allowed', TG_OP
    USING ERRCODE = 'integrity_constraint_violation';
END;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_terms_agreements_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF current_setting('myrrh.terms_agreement_mutation_bypass', true) = 'seed' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;

    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'terms_agreements is append-only; % is not allowed', TG_OP
    USING ERRCODE = 'integrity_constraint_violation';
END;
$function$;


-- ===== EXCLUDE constraints (1) =====
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_no_active_time_overlap_excl" EXCLUDE USING gist ("spaceId" WITH =, tstzrange("startTime", "endTime", '[)'::text) WITH &&) WHERE ((("deletedAt" IS NULL) AND (status = ANY (ARRAY['PENDING'::"ReservationStatus", 'CONFIRMED'::"ReservationStatus"]))));


-- ===== triggers (13) =====
CREATE CONSTRAINT TRIGGER event_time_slots_no_reservation_overlap_check AFTER INSERT OR UPDATE OF "eventId", "startAt", "endAt" ON public.event_time_slots DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_event_slot_no_reservation_overlap();

CREATE CONSTRAINT TRIGGER event_time_slots_schedule_integrity_check AFTER INSERT OR DELETE OR UPDATE OF "eventId", "startAt" ON public.event_time_slots DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_event_schedule_integrity_from_slot();

CREATE CONSTRAINT TRIGGER events_no_reservation_overlap_check AFTER INSERT OR UPDATE OF "spaceId", status, "deletedAt" ON public.events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_event_no_reservation_overlap();

CREATE CONSTRAINT TRIGGER events_schedule_integrity_check AFTER INSERT OR UPDATE OF "scheduleMode", "deletedAt", "registrationDeadline" ON public.events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_event_schedule_integrity_from_event();

CREATE CONSTRAINT TRIGGER reservations_no_event_slot_overlap_check AFTER INSERT OR UPDATE OF "spaceId", "startTime", "endTime", status, "deletedAt" ON public.reservations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_reservation_no_event_slot_overlap();

CREATE TRIGGER audit_logs_no_delete BEFORE DELETE ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION prevent_audit_logs_mutation();

CREATE TRIGGER audit_logs_no_update BEFORE UPDATE ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION prevent_audit_logs_mutation();

CREATE TRIGGER inquiry_status_history_no_delete BEFORE DELETE ON public.inquiry_status_history FOR EACH ROW EXECUTE FUNCTION prevent_inquiry_status_history_mutation();

CREATE TRIGGER inquiry_status_history_no_update BEFORE UPDATE ON public.inquiry_status_history FOR EACH ROW EXECUTE FUNCTION prevent_inquiry_status_history_mutation();

CREATE TRIGGER refunds_no_delete BEFORE DELETE ON public.refunds FOR EACH ROW EXECUTE FUNCTION prevent_refunds_mutation();

CREATE TRIGGER refunds_no_update BEFORE UPDATE ON public.refunds FOR EACH ROW EXECUTE FUNCTION prevent_refunds_mutation();

CREATE TRIGGER terms_agreements_no_delete BEFORE DELETE ON public.terms_agreements FOR EACH ROW EXECUTE FUNCTION prevent_terms_agreements_mutation();

CREATE TRIGGER terms_agreements_no_update BEFORE UPDATE ON public.terms_agreements FOR EACH ROW EXECUTE FUNCTION prevent_terms_agreements_mutation();
