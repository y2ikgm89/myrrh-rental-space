-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'EDITOR', 'VIEWER', 'USER', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "InquiryStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('PERSONAL', 'CORPORATE');

-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('NEW', 'REGULAR', 'VIP', 'INACTIVE', 'BLACKLIST');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PENDING', 'PAID', 'REFUNDED', 'FAILED');

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
CREATE TYPE "TaxInputMode" AS ENUM ('tax_excluded', 'tax_included');

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
CREATE TYPE "RegistrationStatus" AS ENUM ('CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EmailDeliveryStatus" AS ENUM ('OK', 'SOFT_BOUNCED', 'HARD_BOUNCED', 'COMPLAINED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'PUBLISH', 'LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT', 'PERMISSION_DENIED', 'PASSWORD_CHANGE', 'PASSWORD_RESET_REQUEST', 'PASSWORD_RESET_FAILED', 'ROLE_CHANGE');

-- CreateEnum
CREATE TYPE "EditorCommentStatus" AS ENUM ('ACTIVE', 'RESOLVED', 'DELETED');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "MediaUsage" AS ENUM ('POST', 'NEWS', 'PAGE', 'SPACE', 'EVENT', 'SITE', 'GENERAL');

-- CreateEnum
CREATE TYPE "TermsScope" AS ENUM ('LOGIN_SIGNUP', 'RESERVATION', 'INQUIRY', 'EVENT_REGISTRATION');

-- CreateTable
CREATE TABLE "user" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

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
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" UUID NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

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
    "gbpSyncedAt" TIMESTAMP(3),
    "gbpSyncError" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

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
    "area" DECIMAL(10,2),
    "hourlyPrice" DECIMAL(10,2) NOT NULL,
    "dailyPrice" DECIMAL(10,2),
    "mainImageUrl" TEXT NOT NULL,
    "gallery" JSONB NOT NULL DEFAULT '[]',
    "facilities" JSONB NOT NULL DEFAULT '[]',
    "businessHours" JSONB,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "reviewsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "metaDescription" TEXT,
    "metaKeywords" TEXT,
    "ogpTitle" TEXT,
    "ogpDescription" TEXT,
    "ogpImageUrl" TEXT,
    "discountType" "DiscountType" NOT NULL DEFAULT 'none',
    "discountValue" DECIMAL(10,2),
    "durationDiscountOverride" "DurationDiscountOverride" NOT NULL DEFAULT 'inherit',
    "taxRateType" "TaxRateType" NOT NULL DEFAULT 'standard',
    "locationId" UUID NOT NULL,
    "categoryId" UUID,

    CONSTRAINT "spaces_pkey" PRIMARY KEY ("id")
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blocked_dates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" UUID NOT NULL,
    "spaceId" UUID NOT NULL,
    "userId" UUID,
    "customerId" UUID NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'PENDING',
    "totalPrice" DECIMAL(10,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "couponId" UUID,
    "couponDiscountAmount" DECIMAL(10,2),
    "durationDiscountAmount" DECIMAL(10,2),
    "spaceDiscountAmount" DECIMAL(10,2),
    "basePrice" DECIMAL(10,2),
    "taxRateType" "TaxRateType",
    "taxRate" DECIMAL(5,2),
    "taxAmount" DECIMAL(10,2),
    "totalPriceWithTax" DECIMAL(10,2),
    "googleCalendarEventId" TEXT,
    "calendarSyncedAt" TIMESTAMP(3),
    "calendarSyncError" TEXT,
    "guestLastName" TEXT,
    "guestFirstName" TEXT,
    "guestEmail" TEXT,
    "guestPhone" TEXT,
    "guestCompanyName" TEXT,
    "guestCustomerType" "CustomerType",
    "deletedAt" TIMESTAMP(3),
    "deletedById" UUID,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "stripeCheckoutSessionId" TEXT,
    "stripePaymentIntentId" TEXT,
    "paidAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledByType" VARCHAR(20),
    "icsSequence" INTEGER NOT NULL DEFAULT 0,
    "reminderSentAt" TIMESTAMP(3),

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
    "emailCanonical" TEXT,
    "phoneNumber" TEXT,
    "postalCode" VARCHAR(8),
    "prefecture" VARCHAR(10),
    "city" VARCHAR(100),
    "streetAddress" VARCHAR(200),
    "building" VARCHAR(200),
    "status" "CustomerStatus" NOT NULL DEFAULT 'NEW',
    "notes" TEXT,
    "totalReservations" INTEGER NOT NULL DEFAULT 0,
    "totalSpent" DECIMAL(10,2),
    "lastReservationAt" TIMESTAMP(3),
    "firstReservationAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "marketingOptIn" BOOLEAN NOT NULL DEFAULT false,
    "phoneContactOptIn" BOOLEAN NOT NULL DEFAULT true,
    "emailDeliveryStatus" "EmailDeliveryStatus" NOT NULL DEFAULT 'OK',
    "emailDeliveryUpdatedAt" TIMESTAMP(3),
    "emailDeliveryReason" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" UUID,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupons" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "CouponType" NOT NULL,
    "discountValue" DECIMAL(10,2) NOT NULL,
    "minReservationAmount" DECIMAL(10,2),
    "maxDiscountAmount" DECIMAL(10,2),
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3),
    "usageLimit" INTEGER,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "canCombineWithDurationDiscount" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inquiries" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "companyName" TEXT,
    "customerType" "CustomerType",
    "email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "InquiryStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "replyMessage" TEXT,
    "repliedAt" TIMESTAMP(3),
    "repliedById" UUID,
    "customerId" UUID,

    CONSTRAINT "inquiries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "news" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "contentJson" JSONB,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "contentWidth" "LayoutWidth",
    "contentWidthCustom" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
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
    "priority" INTEGER NOT NULL DEFAULT 0,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

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
    "publishedAt" TIMESTAMP(3),
    "status" "PostStatus" NOT NULL DEFAULT 'DRAFT',
    "authorId" UUID,
    "contentWidth" "LayoutWidth",
    "contentWidthCustom" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

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
    "publishedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystemPage" BOOLEAN NOT NULL DEFAULT false,
    "template" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

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
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

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
    "publishedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "lastViewedAt" TIMESTAMP(3),
    "helpfulCount" INTEGER NOT NULL DEFAULT 0,
    "notHelpfulCount" INTEGER NOT NULL DEFAULT 0,
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
    "faviconUrl" TEXT NOT NULL DEFAULT '',
    "defaultOgpImageUrl" TEXT,
    "headerLogoUrl" TEXT,
    "footerLogoUrl" TEXT,
    "footerCopyright" TEXT,
    "useHeaderLogo" BOOLEAN NOT NULL DEFAULT true,
    "useFooterLogo" BOOLEAN NOT NULL DEFAULT true,
    "businessName" TEXT,
    "businessNameKana" TEXT,
    "representativeName" TEXT,
    "establishedDate" TIMESTAMP(3),
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
    "regularHolidays" JSONB,
    "holidayNotice" TEXT,
    "senderEmail" TEXT,
    "senderName" TEXT,
    "replyToEmail" TEXT,
    "defaultMetaDescription" TEXT,
    "defaultMetaKeywords" TEXT,
    "defaultOgpTitle" TEXT,
    "defaultOgpDescription" TEXT,
    "containerWidth" "LayoutWidth",
    "containerWidthCustom" INTEGER,
    "contentWidth" "LayoutWidth",
    "contentWidthCustom" INTEGER,
    "headerScrollBehavior" "HeaderScrollBehavior" NOT NULL DEFAULT 'always-visible',
    "headerBackgroundMode" "HeaderBackgroundMode" NOT NULL DEFAULT 'solid',
    "footerTagline" TEXT,
    "footerNavigationLabel" TEXT NOT NULL DEFAULT 'Navigation',
    "footerContactLabel" TEXT NOT NULL DEFAULT 'Contact',
    "footerHoursLabel" TEXT NOT NULL DEFAULT 'Hours',
    "footerShowSocialLinks" BOOLEAN NOT NULL DEFAULT true,
    "themeColor" TEXT NOT NULL DEFAULT '#fafafa',
    "sidebarEnabled" BOOLEAN NOT NULL DEFAULT true,
    "sidebarWidgets" JSONB NOT NULL DEFAULT '{"search":true,"recent":true,"popular":true,"categories":true,"tags":true}',
    "sidebarRecentCount" INTEGER NOT NULL DEFAULT 5,
    "sidebarPopularCount" INTEGER NOT NULL DEFAULT 5,
    "sidebarTocEnabled" BOOLEAN NOT NULL DEFAULT true,
    "analyticsType" "AnalyticsType",
    "googleAnalyticsId" TEXT,
    "googleTagManagerId" TEXT,
    "googleSearchConsoleId" TEXT,
    "bingWebmasterToolsId" TEXT,
    "gaPropertyId" TEXT,
    "microsoftClarityId" TEXT,
    "defaultTimeSlot" INTEGER NOT NULL DEFAULT 60,
    "minReservationDuration" INTEGER NOT NULL DEFAULT 60,
    "maxReservationDuration" INTEGER NOT NULL DEFAULT 480,
    "sendReservationConfirmationEmail" BOOLEAN NOT NULL DEFAULT true,
    "durationDiscountEnabled" BOOLEAN NOT NULL DEFAULT false,
    "durationDiscountRules" JSONB NOT NULL DEFAULT '[]',
    "discountCombinationMode" "DiscountCombinationMode" NOT NULL DEFAULT 'best',
    "showOriginalPrice" BOOLEAN NOT NULL DEFAULT true,
    "taxStandardRate" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "taxReducedRate" DECIMAL(5,2) NOT NULL DEFAULT 8,
    "taxDisplayModePublic" "TaxDisplayMode" NOT NULL DEFAULT 'tax_included',
    "notifyNewReservation" BOOLEAN NOT NULL DEFAULT true,
    "notifyReservationChange" BOOLEAN NOT NULL DEFAULT true,
    "notifyReservationCancel" BOOLEAN NOT NULL DEFAULT true,
    "notifyNewInquiry" BOOLEAN NOT NULL DEFAULT true,
    "notifyEventRegistration" BOOLEAN NOT NULL DEFAULT true,
    "notifyEventCancellation" BOOLEAN NOT NULL DEFAULT true,
    "notificationStaffIds" JSONB,
    "notificationEmailAddresses" TEXT,
    "maintenanceMode" BOOLEAN NOT NULL DEFAULT false,
    "maintenanceMessage" TEXT,
    "stripeEnabled" BOOLEAN NOT NULL DEFAULT false,
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
    "announcementBarAnimation" "AnnouncementBarAnimation" NOT NULL DEFAULT 'fade',
    "announcementBarDuration" INTEGER NOT NULL DEFAULT 5000,
    "announcementBarAutoPlay" BOOLEAN NOT NULL DEFAULT true,
    "announcementBarPauseOnHover" BOOLEAN NOT NULL DEFAULT true,
    "announcementBarShowArrows" BOOLEAN NOT NULL DEFAULT true,
    "announcementBarShowIndicator" BOOLEAN NOT NULL DEFAULT true,
    "announcementBarDesignStyle" "AnnouncementBarDesignStyle" NOT NULL DEFAULT 'solid',
    "announcementBarBgColor" TEXT,
    "announcementBarTextColor" TEXT,
    "announcementBarStripeColor" TEXT,
    "announcementBarStripeAnimation" BOOLEAN NOT NULL DEFAULT false,
    "announcementBarGradientAnimation" BOOLEAN NOT NULL DEFAULT false,
    "announcementBarGlassAnimation" BOOLEAN NOT NULL DEFAULT false,
    "announcementBarSticky" BOOLEAN NOT NULL DEFAULT false,
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
    "googleBusinessProfileEnabled" BOOLEAN NOT NULL DEFAULT false,
    "googleBusinessProfileAuth" JSONB,
    "googleCalendarMeetEnabled" BOOLEAN NOT NULL DEFAULT false,
    "googleCalendarReminderMinutes" INTEGER,
    "icalAttachmentEnabled" BOOLEAN NOT NULL DEFAULT true,
    "addToCalendarLinksEnabled" BOOLEAN NOT NULL DEFAULT true,
    "googleCalendarTwoWaySyncEnabled" BOOLEAN NOT NULL DEFAULT false,
    "googleCalendarSyncMethod" "CalendarSyncMethod" NOT NULL DEFAULT 'polling',
    "googleCalendarSyncToken" TEXT,
    "googleCalendarLastSyncedAt" TIMESTAMP(3),
    "eventImportEnabled" BOOLEAN NOT NULL DEFAULT false,
    "eventImportSyncToken" TEXT,
    "featureModules" JSONB NOT NULL DEFAULT '{}',
    "googleCalendarWebhookChannelId" TEXT,
    "googleCalendarWebhookResourceId" TEXT,
    "googleCalendarWebhookExpiration" TIMESTAMP(3),
    "googleCalendarWebhookToken" TEXT,
    "instagramAccessToken" TEXT,
    "instagramTokenExpiresAt" TIMESTAMP(3),
    "instagramUserId" TEXT,
    "instagramUsername" TEXT,
    "instagramAccountType" TEXT,
    "cancellationDeadlineHours" INTEGER NOT NULL DEFAULT 24,
    "modificationDeadlineHours" INTEGER NOT NULL DEFAULT 24,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "instagram_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "action" "AuditAction" NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT,
    "oldValue" JSONB,
    "newValue" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_attempts" (
    "id" UUID NOT NULL,
    "identifier" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
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
    "publishedAt" TIMESTAMP(3),
    "scopes" "TermsScope"[],
    "changelog" TEXT,
    "showInFooter" BOOLEAN NOT NULL DEFAULT true,
    "footerOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

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
    "agreedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scope" "TermsScope" NOT NULL,
    "resourceId" UUID,
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
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID,

    CONSTRAINT "editor_comment_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "editor_comments" (
    "id" UUID NOT NULL,
    "threadId" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID,

    CONSTRAINT "editor_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "block_templates" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "nodeJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
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
    "repliedAt" TIMESTAMP(3),
    "repliedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "space_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_time_slots" (
    "id" VARCHAR(30) NOT NULL,
    "eventId" VARCHAR(30) NOT NULL,
    "startAt" TIMESTAMPTZ(6) NOT NULL,
    "endAt" TIMESTAMPTZ(6) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "googleCalendarEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_time_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" VARCHAR(30) NOT NULL,
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
    "publishedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "deletedById" UUID,
    "gallery" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "firstSlotStartAt" TIMESTAMPTZ(6),
    "lastSlotEndAt" TIMESTAMPTZ(6),

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_tickets" (
    "id" VARCHAR(30) NOT NULL,
    "eventId" VARCHAR(30) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "price" INTEGER NOT NULL,
    "capacity" INTEGER,
    "unitSize" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_registrations" (
    "id" VARCHAR(30) NOT NULL,
    "eventId" VARCHAR(30) NOT NULL,
    "slotId" VARCHAR(30) NOT NULL,
    "ticketId" VARCHAR(30) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(255),
    "phone" VARCHAR(20),
    "note" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'CONFIRMED',
    "customerId" UUID,
    "cancelledAt" TIMESTAMP(3),
    "attendedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "icsSequence" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "event_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_notification" (
    "id" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "message" VARCHAR(500) NOT NULL,
    "resourceType" VARCHAR(50),
    "resourceId" UUID,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_notification_pkey" PRIMARY KEY ("id")
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
CREATE UNIQUE INDEX "locations_slug_key" ON "locations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "locations_name_key" ON "locations"("name");

-- CreateIndex
CREATE INDEX "locations_isPublished_isActive_idx" ON "locations"("isPublished", "isActive");

-- CreateIndex
CREATE INDEX "locations_sortOrder_idx" ON "locations"("sortOrder");

-- CreateIndex
CREATE INDEX "locations_gbpSyncError_idx" ON "locations"("gbpSyncError");

-- CreateIndex
CREATE UNIQUE INDEX "space_categories_name_key" ON "space_categories"("name");

-- CreateIndex
CREATE INDEX "space_categories_sortOrder_idx" ON "space_categories"("sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "spaces_slug_key" ON "spaces"("slug");

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
CREATE INDEX "blocked_dates_scope_startDate_endDate_idx" ON "blocked_dates"("scope", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "blocked_dates_spaceId_startDate_endDate_idx" ON "blocked_dates"("spaceId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "blocked_dates_locationId_startDate_endDate_idx" ON "blocked_dates"("locationId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "reservations_spaceId_idx" ON "reservations"("spaceId");

-- CreateIndex
CREATE INDEX "reservations_customerId_idx" ON "reservations"("customerId");

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
CREATE INDEX "reservations_stripePaymentIntentId_idx" ON "reservations"("stripePaymentIntentId");

-- CreateIndex
CREATE UNIQUE INDEX "customers_userId_key" ON "customers"("userId");

-- CreateIndex
CREATE INDEX "customers_lastName_idx" ON "customers"("lastName");

-- CreateIndex
CREATE INDEX "customers_firstName_idx" ON "customers"("firstName");

-- CreateIndex
CREATE INDEX "customers_phoneNumber_idx" ON "customers"("phoneNumber");

-- CreateIndex
CREATE INDEX "customers_status_idx" ON "customers"("status");

-- CreateIndex
CREATE INDEX "customers_customerType_idx" ON "customers"("customerType");

-- CreateIndex
CREATE INDEX "customers_emailCanonical_idx" ON "customers"("emailCanonical");

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
CREATE UNIQUE INDEX "coupons_code_key" ON "coupons"("code");

-- CreateIndex
CREATE INDEX "coupons_validFrom_validUntil_idx" ON "coupons"("validFrom", "validUntil");

-- CreateIndex
CREATE INDEX "coupons_isActive_idx" ON "coupons"("isActive");

-- CreateIndex
CREATE INDEX "inquiries_email_idx" ON "inquiries"("email");

-- CreateIndex
CREATE INDEX "inquiries_status_idx" ON "inquiries"("status");

-- CreateIndex
CREATE INDEX "inquiries_createdAt_idx" ON "inquiries"("createdAt");

-- CreateIndex
CREATE INDEX "inquiries_createdAt_status_idx" ON "inquiries"("createdAt", "status");

-- CreateIndex
CREATE INDEX "inquiries_customerId_idx" ON "inquiries"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "news_slug_key" ON "news"("slug");

-- CreateIndex
CREATE INDEX "news_title_idx" ON "news"("title");

-- CreateIndex
CREATE INDEX "news_isPublished_publishedAt_idx" ON "news"("isPublished", "publishedAt");

-- CreateIndex
CREATE INDEX "news_createdAt_idx" ON "news"("createdAt");

-- CreateIndex
CREATE INDEX "announcement_bars_isActive_priority_idx" ON "announcement_bars"("isActive", "priority");

-- CreateIndex
CREATE INDEX "announcement_bars_startAt_endAt_idx" ON "announcement_bars"("startAt", "endAt");

-- CreateIndex
CREATE UNIQUE INDEX "posts_slug_key" ON "posts"("slug");

-- CreateIndex
CREATE INDEX "posts_title_idx" ON "posts"("title");

-- CreateIndex
CREATE INDEX "posts_authorId_idx" ON "posts"("authorId");

-- CreateIndex
CREATE INDEX "posts_status_publishedAt_idx" ON "posts"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "posts_categoryId_status_publishedAt_idx" ON "posts"("categoryId", "status", "publishedAt");

-- CreateIndex
CREATE INDEX "post_tag_on_posts_tagId_idx" ON "post_tag_on_posts"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "post_categories_name_key" ON "post_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "post_categories_slug_key" ON "post_categories"("slug");

-- CreateIndex
CREATE INDEX "post_categories_order_idx" ON "post_categories"("order");

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
CREATE INDEX "sections_pageId_order_isActive_idx" ON "sections"("pageId", "order", "isActive");

-- CreateIndex
CREATE INDEX "sections_type_idx" ON "sections"("type");

-- CreateIndex
CREATE INDEX "navigation_items_type_order_idx" ON "navigation_items"("type", "order");

-- CreateIndex
CREATE INDEX "navigation_items_parentId_idx" ON "navigation_items"("parentId");

-- CreateIndex
CREATE INDEX "social_links_order_idx" ON "social_links"("order");

-- CreateIndex
CREATE UNIQUE INDEX "faq_categories_slug_key" ON "faq_categories"("slug");

-- CreateIndex
CREATE INDEX "faq_categories_order_idx" ON "faq_categories"("order");

-- CreateIndex
CREATE INDEX "faq_categories_isActive_order_idx" ON "faq_categories"("isActive", "order");

-- CreateIndex
CREATE INDEX "faq_categories_deletedAt_idx" ON "faq_categories"("deletedAt");

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
CREATE UNIQUE INDEX "instagram_posts_postId_key" ON "instagram_posts"("postId");

-- CreateIndex
CREATE INDEX "instagram_posts_sortOrder_idx" ON "instagram_posts"("sortOrder");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_resource_resourceId_idx" ON "audit_logs"("resource", "resourceId");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_userId_createdAt_idx" ON "audit_logs"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "media_type_usage_idx" ON "media"("type", "usage");

-- CreateIndex
CREATE INDEX "media_uploadedBy_idx" ON "media"("uploadedBy");

-- CreateIndex
CREATE INDEX "media_isActive_createdAt_idx" ON "media"("isActive", "createdAt");

-- CreateIndex
CREATE INDEX "media_mimeType_idx" ON "media"("mimeType");

-- CreateIndex
CREATE INDEX "login_attempts_identifier_createdAt_idx" ON "login_attempts"("identifier", "createdAt");

-- CreateIndex
CREATE INDEX "login_attempts_email_createdAt_idx" ON "login_attempts"("email", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "terms_documents_slug_key" ON "terms_documents"("slug");

-- CreateIndex
CREATE INDEX "terms_documents_type_idx" ON "terms_documents"("type");

-- CreateIndex
CREATE INDEX "terms_documents_deletedAt_isPublished_idx" ON "terms_documents"("deletedAt", "isPublished");

-- CreateIndex
CREATE INDEX "terms_documents_showInFooter_isPublished_footerOrder_idx" ON "terms_documents"("showInFooter", "isPublished", "footerOrder");

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
CREATE INDEX "editor_comment_threads_contentType_contentId_status_idx" ON "editor_comment_threads"("contentType", "contentId", "status");

-- CreateIndex
CREATE INDEX "editor_comment_threads_createdBy_idx" ON "editor_comment_threads"("createdBy");

-- CreateIndex
CREATE INDEX "editor_comment_threads_status_createdAt_idx" ON "editor_comment_threads"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "editor_comment_threads_markId_contentType_contentId_key" ON "editor_comment_threads"("markId", "contentType", "contentId");

-- CreateIndex
CREATE INDEX "editor_comments_threadId_createdAt_idx" ON "editor_comments"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "editor_comments_createdBy_idx" ON "editor_comments"("createdBy");

-- CreateIndex
CREATE INDEX "editor_comments_isDeleted_idx" ON "editor_comments"("isDeleted");

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
CREATE INDEX "event_time_slots_eventId_startAt_idx" ON "event_time_slots"("eventId", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "event_time_slots_eventId_startAt_key" ON "event_time_slots"("eventId", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "events_slug_key" ON "events"("slug");

-- CreateIndex
CREATE INDEX "events_status_idx" ON "events"("status");

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
CREATE INDEX "event_tickets_eventId_sortOrder_idx" ON "event_tickets"("eventId", "sortOrder");

-- CreateIndex
CREATE INDEX "event_tickets_eventId_isAvailable_idx" ON "event_tickets"("eventId", "isAvailable");

-- CreateIndex
CREATE INDEX "event_registrations_eventId_idx" ON "event_registrations"("eventId");

-- CreateIndex
CREATE INDEX "event_registrations_slotId_idx" ON "event_registrations"("slotId");

-- CreateIndex
CREATE INDEX "event_registrations_slotId_status_idx" ON "event_registrations"("slotId", "status");

-- CreateIndex
CREATE INDEX "event_registrations_ticketId_idx" ON "event_registrations"("ticketId");

-- CreateIndex
CREATE INDEX "event_registrations_customerId_idx" ON "event_registrations"("customerId");

-- CreateIndex
CREATE INDEX "event_registrations_status_idx" ON "event_registrations"("status");

-- CreateIndex
CREATE INDEX "event_registrations_eventId_status_createdAt_idx" ON "event_registrations"("eventId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "event_registrations_eventId_attendedAt_idx" ON "event_registrations"("eventId", "attendedAt");

-- CreateIndex
CREATE INDEX "admin_notification_isRead_createdAt_idx" ON "admin_notification"("isRead", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "admin_notification_type_idx" ON "admin_notification"("type");

-- CreateIndex
CREATE INDEX "admin_notification_createdAt_idx" ON "admin_notification"("createdAt" DESC);

-- AddForeignKey
ALTER TABLE "user_page_assignments" ADD CONSTRAINT "user_page_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_page_assignments" ADD CONSTRAINT "user_page_assignments_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "space_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocked_dates" ADD CONSTRAINT "blocked_dates_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocked_dates" ADD CONSTRAINT "blocked_dates_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocked_dates" ADD CONSTRAINT "blocked_dates_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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
ALTER TABLE "customers" ADD CONSTRAINT "customers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_repliedById_fkey" FOREIGN KEY ("repliedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terms_agreements" ADD CONSTRAINT "terms_agreements_termsId_fkey" FOREIGN KEY ("termsId") REFERENCES "terms_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terms_agreements" ADD CONSTRAINT "terms_agreements_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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
ALTER TABLE "event_tickets" ADD CONSTRAINT "event_tickets_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "event_time_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "event_tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Manual DB invariants not expressible in Prisma schema.prisma.
-- Keep these with the baseline migration so a fresh database has the same
-- domain constraints as the previous migration history.

ALTER TABLE "blocked_dates"
ADD CONSTRAINT "blocked_dates_scope_target_check"
CHECK (
    ("scope" = 'SPACE' AND "spaceId" IS NOT NULL AND "locationId" IS NULL)
    OR ("scope" = 'LOCATION' AND "locationId" IS NOT NULL AND "spaceId" IS NULL)
    OR ("scope" = 'GLOBAL' AND "spaceId" IS NULL AND "locationId" IS NULL)
);

ALTER TABLE "event_time_slots"
ADD CONSTRAINT "event_time_slots_capacity_positive"
CHECK ("capacity" >= 1);

ALTER TABLE "event_time_slots"
ADD CONSTRAINT "event_time_slots_time_order"
CHECK ("startAt" < "endAt");

ALTER TABLE "event_tickets"
ADD CONSTRAINT "event_tickets_price_non_negative"
CHECK ("price" >= 0);

ALTER TABLE "event_tickets"
ADD CONSTRAINT "event_tickets_capacity_positive_or_null"
CHECK ("capacity" IS NULL OR "capacity" >= 1);

ALTER TABLE "event_tickets"
ADD CONSTRAINT "event_tickets_unit_size_positive"
CHECK ("unitSize" >= 1);

ALTER TABLE "event_registrations"
ADD CONSTRAINT "event_registrations_quantity_positive"
CHECK ("quantity" >= 1);

COMMENT ON COLUMN "events"."scheduleMode" IS
'SINGLE_OCCURRENCE = exactly one EventTimeSlot; TIMED_ENTRY = two or more EventTimeSlot rows. Registrations always attach to EventTimeSlot.';

COMMENT ON COLUMN "events"."registrationDeadline" IS
'Optional registration deadline as an instant. When null, registration closes at the first slot start.';

COMMENT ON CONSTRAINT "event_time_slots_capacity_positive" ON "event_time_slots" IS
'EventTimeSlot.capacity is a positive concrete seat count; zero is intentionally invalid.';

COMMENT ON CONSTRAINT "event_time_slots_time_order" ON "event_time_slots" IS
'EventTimeSlot.startAt must be earlier than endAt.';

COMMENT ON CONSTRAINT "event_tickets_price_non_negative" ON "event_tickets" IS
'EventTicket.price is stored as a non-negative integer amount.';

COMMENT ON CONSTRAINT "event_tickets_capacity_positive_or_null" ON "event_tickets" IS
'EventTicket.capacity is null for no ticket-level cap, otherwise positive.';

COMMENT ON CONSTRAINT "event_tickets_unit_size_positive" ON "event_tickets" IS
'EventTicket.unitSize must be positive.';

COMMENT ON CONSTRAINT "event_registrations_quantity_positive" ON "event_registrations" IS
'EventRegistration.quantity must be positive.';

CREATE OR REPLACE FUNCTION "check_event_schedule_integrity"("targetEventId" text)
RETURNS void AS $$
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "check_event_schedule_integrity_from_event"()
RETURNS trigger AS $$
BEGIN
  PERFORM "check_event_schedule_integrity"(NEW."id");
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "check_event_schedule_integrity_from_slot"()
RETURNS trigger AS $$
DECLARE
  target_event_id text;
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
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "events_schedule_integrity_check"
AFTER INSERT OR UPDATE OF "scheduleMode", "deletedAt", "registrationDeadline" ON "events"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "check_event_schedule_integrity_from_event"();

CREATE CONSTRAINT TRIGGER "event_time_slots_schedule_integrity_check"
AFTER INSERT OR UPDATE OF "eventId", "startAt" OR DELETE ON "event_time_slots"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "check_event_schedule_integrity_from_slot"();

COMMENT ON FUNCTION "check_event_schedule_integrity"(text) IS
'Deferred DB invariant: SINGLE_OCCURRENCE has exactly one EventTimeSlot, TIMED_ENTRY has two or more, and registrationDeadline is not after the first slot start.';

-- Production initial data. This stays in migrate deploy rather than seed so
-- fresh production installs have legal terms without running dev seed data.
-- ============================================================================
-- baseline legal terms data — Prisma 公式 Data Migration パターン (production initial data)
--
-- Prisma 公式 doc: https://www.prisma.io/docs/orm/prisma-migrate/workflows/data-migration
--   "use Prisma Migrate to add data to a database in production"
--
-- 目的: 本番デプロイ時 (`prisma migrate deploy`) で 8 規約を確実に投入する。
--   `prisma db seed` は dev/test 用と公式で明示されており production には走らない。
--   本 migration を SSoT 化することで CI Smoke E2E / 本番 Cloud Build どちらも
--   `migrate deploy` 一発で同一の規約 8 件が DB に存在する状態を保証する。
--
-- idempotency:
--   `ON CONFLICT (slug) DO NOTHING` で再実行安全。admin が手動で本文を改訂した
--   後も上書きされない (slug が既存なら INSERT skip)。
--
-- 投入される規約 (各 scopes 配列で適用先を制御):
--   - 利用規約          → LOGIN_SIGNUP / RESERVATION / INQUIRY / EVENT_REGISTRATION
--   - プライバシーポリシー → LOGIN_SIGNUP / INQUIRY / RESERVATION / EVENT_REGISTRATION
--   - キャンセルポリシー   → RESERVATION / EVENT_REGISTRATION
--   - 特定商取引法・支払い規約・施設利用規約・レビュー投稿ガイドライン・Cookie ポリシー
--     → scopes=[] (フッター掲載のみ)
--
-- seed.ts の terms ブロックは本 migration への移管に伴い撤去 (二重管理排除)。
-- ============================================================================

INSERT INTO public.terms_documents (id, type, slug, title, "contentJson", "contentHtml", "isPublished", "publishedAt", "showInFooter", "footerOrder", "createdAt", "updatedAt", "deletedAt", changelog, scopes) VALUES ('1044f3f6-ab6d-43cf-ad52-1c5625f53a57', 'terms-of-use', 'terms-of-use', '利用規約', '{"root": {"type": "root", "format": "", "indent": 0, "version": 1, "children": [{"type": "paragraph", "format": "", "indent": 0, "version": 1, "children": [{"mode": "normal", "text": "最終更新日：2026年6月26日 事業者情報 事業者名株式会社サンプル 代表者山田 太郎 所在地〒150-0001 東京都 渋谷区 神宮前1-1-1 サンプルビル メールinfo@example.com 電話03-1234-5678 本規約は、当社のレンタルスペースサービスをご利用いただくための基本的なルールを定めたものです。ご利用前に全文をご確認ください。特に 第3条・第10条（未成年者の利用）、第5条・第6条（予約と料金）、第15条（免責事項） は重要な内容を含みます。 第1条（目的・適用範囲） 本規約は、株式会社サンプル（以下「当社」といいます）が提供するレンタルスペースサービス（以下「本サービス」といいます）の利用条件を、利用者（第 2 条で定義します）と当社との間で定めるものです。 利用者が本サービスを利用した場合、本規約の全ての条項に同意したものとみなされます。 当社が別途定める「プライバシーポリシー」「キャンセルポリシー」「支払い規約」「施設利用規約」「特定商取引法に基づく表記」その他の個別規約は、本規約の一部を構成します。本規約と個別規約の内容が矛盾する場合は、個別規約の定めが優先して適用されます。 第2条（定義） 本規約において使用する用語の意義は、次の各号に定めるとおりとします。 利用者：本サービスを利用する全ての方（会員・非会員を問いません） 会員：当社所定の方法によりアカウントを登録した利用者 スペース：当社が本サービスを通じて提供するレンタルスペース 予約：利用者が本サービスを通じてスペースの利用を申し込む行為 投稿コンテンツ：利用者が本サービス上に投稿するレビュー・写真・コメント・評価その他一切の情報 第3条（本規約への同意） 利用者は、本規約に同意したうえで本サービスを利用するものとします。 未成年者（満 18 歳未満の者）が本サービスを利用する場合は、事前に法定代理人（親権者等）の同意を得なければなりません。同意を得ずに利用した結果、民法その他の規定により取消しを主張することはできません。 第4条（会員登録・アカウント管理） 会員登録を希望する方は、当社所定の方法（Google アカウントまたは LINE アカウントによる認証等）により登録を行うものとします。 会員は、登録情報を正確かつ最新の内容に保つ責任を負います。 会員は、アカウント（ID・パスワード・ソーシャルログイン認証情報を含みます）を自らの責任で管理するものとし、第三者に譲渡・貸与・共有することはできません。 アカウントの不正利用による損害について、当社の故意または重過失による場合を除き、会員本人がその責任を負うものとします。 会員は、マイページからいつでもアカウントの退会手続きを行うことができます。退会後も、法令・取引上必要な期間は個人情報が保管されることがあります（プライバシーポリシーに従います）。 第5条（予約の申込みと成立） 利用者は、当社所定の方法により予約の申込みを行うものとします。 予約は、クレジットカード決済が完了し、当社のシステムにおいて予約確認通知がされた時点をもって成立します。決済が成立しない場合、予約は成立しません。 当社は、以下のいずれかに該当する場合、予約の成立を取り消すことができます。 申込内容に虚偽・誤記があった場合 定員超過・システム障害等により提供が困難な場合 利用者が過去に本規約に違反したことがある場合 その他、当社が不適切と判断する事由がある場合 第6条（利用料金・支払い） 利用者は、当社が定める利用料金を、当社の指定する方法により支払うものとします。 料金の詳細、支払方法、返金等については「支払い規約」に従うものとします。 キャンセルに伴う料金の取扱いについては「キャンセルポリシー」に従うものとします。 第7条（利用上のルール） 利用者は、本サービスの利用にあたり、次の各号を遵守するものとします。 予約時間を厳守し、終了時刻までに原状回復のうえ退室すること スペース内の設備・備品を善良な管理者の注意をもって取り扱うこと 他の利用者や近隣住民に対し、騒音その他の迷惑となる行為をしないこと 法令および公序良俗に反する行為をしないこと 個別のスペースにおける「施設利用規約」を遵守すること 第8条（禁止事項） 利用者は、本サービスの利用にあたり、次の行為を行ってはなりません。 法令または公序良俗に違反する行為 犯罪行為または犯罪行為を助長する行為 他の利用者、第三者または当社の権利・利益を侵害する行為 他の利用者、第三者または当社に対する誹謗中傷、脅迫、ハラスメント 虚偽の情報を登録・投稿する行為 無断でスペースを第三者に転貸・又貸しする行為 当社の事前承諾なく、営利目的で本サービスを利用する行為（マルチ商法・連鎖販売・無登録の宗教勧誘等を含みます） 本サービスの運営を妨害する行為、システムに不正アクセスする行為 本サービスを利用して取得した情報を、本サービスの利用目的以外に使用する行為 当社または第三者になりすます行為 その他、当社が不適切と合理的に判断する行為 第9条（投稿コンテンツ） 利用者は、投稿コンテンツが自己のオリジナルの著作物であること、または第三者の権利を侵害しないことを保証するものとします。 利用者は、投稿コンテンツについて、当社に対し、無償かつ地域の制限なく、複製・公衆送信・翻訳・翻案その他の方法により利用すること（本サービスの運営・宣伝・広告・プロモーション目的での利用を含みます）を許諾します。 利用者は、投稿コンテンツの掲載・編集・改変・要約等にあたり、当社および当社が指定する第三者に対して著作者人格権（公表権・氏名表示権・同一性保持権）を行使しないものとします。 当社は、投稿コンテンツが以下のいずれかに該当すると合理的に判断する場合、事前の通知なく当該投稿コンテンツを削除または非表示にすることができます。 本規約に違反する内容を含む場合 第三者の権利・利益を侵害する内容を含む場合 虚偽・誤解を招く内容を含む場合 事実無根の誹謗中傷、営業妨害、特定個人への攻撃が含まれる場合 当社の運営方針に著しく反する内容を含む場合 当社は、投稿コンテンツの内容について、真実性・適法性・有用性を保証するものではありません。 未成年の方へ：本サービスは満 18 歳以上の方を対象としています。満 18 歳未満の方がご利用になる場合は、必ず事前に保護者（法定代理人）の同意を得てください。同意なくお申込みされた場合のトラブルについて、当社は責任を負いかねます。 第10条（未成年者の利用） 満 18 歳未満の方は、本サービスを単独で利用することはできません。法定代理人の同意のうえで利用することが必要です。 法定代理人の同意なく本サービスを利用した場合の責任は、利用者および法定代理人が負うものとします。 第11条（アカウント停止・利用制限） 当社は、利用者が本規約に違反した場合、または違反するおそれがあると合理的に判断した場合、事前の通知なくアカウントの一時停止、利用制限、予約の取消し、会員資格の抹消その他必要な措置を講じることができます。 前項の措置に伴い利用者に損害が生じた場合であっても、当社の故意または重過失による場合を除き、当社は責任を負わないものとします。 当社は、以下の場合に継続的な利用をお断りすることがあります。 無断キャンセル（ノーショー）を繰り返した場合 繰り返し直前キャンセルを行い、当社または他の利用者に著しい不利益を与えた場合 他の利用者や当社スタッフに対する迷惑行為があった場合 第12条（サービスの変更・中断・終了） 当社は、本サービスの内容を、事前の通知により変更することがあります。 当社は、次の各号のいずれかに該当する場合、事前の通知なく本サービスの全部または一部を中断することができます。 システムの保守・点検を行う場合 天災・停電・通信障害その他の不可抗力により運営が困難となった場合 その他、当社が中断を必要と合理的に判断する場合 当社は、利用者に対し事前の通知を行ったうえで、本サービスを終了することができます。 第13条（反社会的勢力の排除） 利用者は、反社会的勢力（暴力団、暴力団員、暴力団関係企業、総会屋、社会運動等標ぼうゴロ、特殊知能暴力集団等をいいます）に該当しないこと、および反社会的勢力と資金提供その他の関係を有しないことを表明し、保証するものとします。 利用者が前項の表明・保証に違反した場合、当社は催告なく直ちに予約を取消し、会員資格を抹消し、または本規約に基づく一切の契約関係を解除することができます。 第14条（損害賠償） 利用者が本規約に違反し、または故意もしくは過失により当社に損害を与えた場合、利用者はその損害（弁護士費用を含みます）を賠償する責任を負います。 利用者の行為により第三者に損害を与えた場合、利用者は自己の責任と費用においてこれを解決し、当社に一切の迷惑をかけないものとします。 第15条（免責事項） 当社は、本サービスに関し、特定目的への適合性、商品的価値、正確性、有用性、完全性、適法性、信頼性その他一切について、明示・黙示を問わず保証するものではありません。 当社は、次の事由により生じた損害について責任を負いません。ただし、当社の故意または重過失による場合を除きます。 天災、戦争、暴動、停電、通信障害、法令の改廃、その他の不可抗力 利用者自身の機器・通信環境に起因する不具合 利用者の私物の盗難・紛失 スペース内で発生した利用者間・利用者と第三者間のトラブル 当社の責めに帰すべき事由により利用者に損害が生じた場合の賠償額は、当該利用者が当社に支払った直近の利用料金相当額を上限とします。ただし、当社の故意または重過失による場合はこの限りではありません。 消費者契約法により、当社の故意・重過失による損害については上記の賠償上限は適用されません。本条はあくまで当社に軽過失がある場合の賠償範囲を定めるものです。 第16条（通知方法） 当社から利用者への通知は、本サービスへの掲示、電子メール、会員登録時に指定された連絡先への通信等、当社が適当と判断する方法により行います。 前項の通知は、発信をもって利用者に到達したものとみなします。 第17条（規約の変更） 当社は、民法 548 条の 4（定型約款の変更）その他関係法令に従い、本規約を変更することができます。 本規約を変更する場合、当社は、変更後の内容、変更の効力発生時期を、効力発生時期の相当期間前までに、本サービス上での掲示その他の適切な方法により周知します。 変更の効力発生時期を経過した後に利用者が本サービスを利用した場合、利用者は変更後の規約に同意したものとみなされます。 第18条（分離可能性） 本規約のいずれかの条項が法令により無効または執行不能と判断された場合であっても、本規約の他の条項の効力には影響しないものとします。この場合、当社と利用者は、当該無効または執行不能な条項を適法かつ有効な条項に置き換えるよう誠実に協議するものとします。 第19条（準拠法・管轄裁判所） 本規約の成立、効力、解釈および適用については、日本法を準拠法とします。 本規約または本サービスに関して当社と利用者との間に紛争が生じた場合、訴額に応じて、当社の所在地を管轄する地方裁判所または簡易裁判所を第一審の専属的合意管轄裁判所とします。 第20条（お問い合わせ） 本規約に関するお問い合わせは、次の連絡先までお願いいたします。 メール：info@example.com 電話：03-1234-5678", "type": "text", "style": "", "detail": 0, "format": 0, "version": 1}], "direction": "ltr", "textStyle": "", "textFormat": 0}], "direction": "ltr"}}', '<p>最終更新日：2026年6月26日</p>

<h2>事業者情報</h2>
<table>
<tbody>
<tr><th>事業者名</th><td>株式会社サンプル</td></tr>
<tr><th>代表者</th><td>山田 太郎</td></tr>
<tr><th>所在地</th><td>〒150-0001 東京都 渋谷区 神宮前1-1-1 サンプルビル</td></tr>
<tr><th>メール</th><td>info@example.com</td></tr>
<tr><th>電話</th><td>03-1234-5678</td></tr>
</tbody>
</table>

<div data-callout-type="info"><p>本規約は、当社のレンタルスペースサービスをご利用いただくための基本的なルールを定めたものです。ご利用前に全文をご確認ください。特に <strong>第3条・第10条（未成年者の利用）</strong>、<strong>第5条・第6条（予約と料金）</strong>、<strong>第15条（免責事項）</strong> は重要な内容を含みます。</p></div>

<h2>第1条（目的・適用範囲）</h2>
<ol>
<li>本規約は、株式会社サンプル（以下「当社」といいます）が提供するレンタルスペースサービス（以下「本サービス」といいます）の利用条件を、利用者（第 2 条で定義します）と当社との間で定めるものです。</li>
<li>利用者が本サービスを利用した場合、本規約の全ての条項に同意したものとみなされます。</li>
<li>当社が別途定める「プライバシーポリシー」「キャンセルポリシー」「支払い規約」「施設利用規約」「特定商取引法に基づく表記」その他の個別規約は、本規約の一部を構成します。本規約と個別規約の内容が矛盾する場合は、個別規約の定めが優先して適用されます。</li>
</ol>

<h2>第2条（定義）</h2>
<p>本規約において使用する用語の意義は、次の各号に定めるとおりとします。</p>
<ul>
<li><strong>利用者</strong>：本サービスを利用する全ての方（会員・非会員を問いません）</li>
<li><strong>会員</strong>：当社所定の方法によりアカウントを登録した利用者</li>
<li><strong>スペース</strong>：当社が本サービスを通じて提供するレンタルスペース</li>
<li><strong>予約</strong>：利用者が本サービスを通じてスペースの利用を申し込む行為</li>
<li><strong>投稿コンテンツ</strong>：利用者が本サービス上に投稿するレビュー・写真・コメント・評価その他一切の情報</li>
</ul>

<h2>第3条（本規約への同意）</h2>
<ol>
<li>利用者は、本規約に同意したうえで本サービスを利用するものとします。</li>
<li>未成年者（満 18 歳未満の者）が本サービスを利用する場合は、事前に法定代理人（親権者等）の同意を得なければなりません。同意を得ずに利用した結果、民法その他の規定により取消しを主張することはできません。</li>
</ol>

<hr>

<h2>第4条（会員登録・アカウント管理）</h2>
<ol>
<li>会員登録を希望する方は、当社所定の方法（Google アカウントまたは LINE アカウントによる認証等）により登録を行うものとします。</li>
<li>会員は、登録情報を正確かつ最新の内容に保つ責任を負います。</li>
<li>会員は、アカウント（ID・パスワード・ソーシャルログイン認証情報を含みます）を自らの責任で管理するものとし、第三者に譲渡・貸与・共有することはできません。</li>
<li>アカウントの不正利用による損害について、当社の故意または重過失による場合を除き、会員本人がその責任を負うものとします。</li>
<li>会員は、マイページからいつでもアカウントの退会手続きを行うことができます。退会後も、法令・取引上必要な期間は個人情報が保管されることがあります（プライバシーポリシーに従います）。</li>
</ol>

<h2>第5条（予約の申込みと成立）</h2>
<ol>
<li>利用者は、当社所定の方法により予約の申込みを行うものとします。</li>
<li>予約は、クレジットカード決済が完了し、当社のシステムにおいて予約確認通知がされた時点をもって成立します。決済が成立しない場合、予約は成立しません。</li>
<li>当社は、以下のいずれかに該当する場合、予約の成立を取り消すことができます。
<ul>
<li>申込内容に虚偽・誤記があった場合</li>
<li>定員超過・システム障害等により提供が困難な場合</li>
<li>利用者が過去に本規約に違反したことがある場合</li>
<li>その他、当社が不適切と判断する事由がある場合</li>
</ul>
</li>
</ol>

<h2>第6条（利用料金・支払い）</h2>
<ol>
<li>利用者は、当社が定める利用料金を、当社の指定する方法により支払うものとします。</li>
<li>料金の詳細、支払方法、返金等については「支払い規約」に従うものとします。</li>
<li>キャンセルに伴う料金の取扱いについては「キャンセルポリシー」に従うものとします。</li>
</ol>

<hr>

<h2>第7条（利用上のルール）</h2>
<p>利用者は、本サービスの利用にあたり、次の各号を遵守するものとします。</p>
<ul>
<li>予約時間を厳守し、終了時刻までに原状回復のうえ退室すること</li>
<li>スペース内の設備・備品を善良な管理者の注意をもって取り扱うこと</li>
<li>他の利用者や近隣住民に対し、騒音その他の迷惑となる行為をしないこと</li>
<li>法令および公序良俗に反する行為をしないこと</li>
<li>個別のスペースにおける「施設利用規約」を遵守すること</li>
</ul>

<h2>第8条（禁止事項）</h2>
<p>利用者は、本サービスの利用にあたり、次の行為を行ってはなりません。</p>
<ul>
<li>法令または公序良俗に違反する行為</li>
<li>犯罪行為または犯罪行為を助長する行為</li>
<li>他の利用者、第三者または当社の権利・利益を侵害する行為</li>
<li>他の利用者、第三者または当社に対する誹謗中傷、脅迫、ハラスメント</li>
<li>虚偽の情報を登録・投稿する行為</li>
<li>無断でスペースを第三者に転貸・又貸しする行為</li>
<li>当社の事前承諾なく、営利目的で本サービスを利用する行為（マルチ商法・連鎖販売・無登録の宗教勧誘等を含みます）</li>
<li>本サービスの運営を妨害する行為、システムに不正アクセスする行為</li>
<li>本サービスを利用して取得した情報を、本サービスの利用目的以外に使用する行為</li>
<li>当社または第三者になりすます行為</li>
<li>その他、当社が不適切と合理的に判断する行為</li>
</ul>

<h2>第9条（投稿コンテンツ）</h2>
<ol>
<li>利用者は、投稿コンテンツが自己のオリジナルの著作物であること、または第三者の権利を侵害しないことを保証するものとします。</li>
<li>利用者は、投稿コンテンツについて、当社に対し、無償かつ地域の制限なく、複製・公衆送信・翻訳・翻案その他の方法により利用すること（本サービスの運営・宣伝・広告・プロモーション目的での利用を含みます）を許諾します。</li>
<li>利用者は、投稿コンテンツの掲載・編集・改変・要約等にあたり、当社および当社が指定する第三者に対して著作者人格権（公表権・氏名表示権・同一性保持権）を行使しないものとします。</li>
<li>当社は、投稿コンテンツが以下のいずれかに該当すると合理的に判断する場合、事前の通知なく当該投稿コンテンツを削除または非表示にすることができます。
<ul>
<li>本規約に違反する内容を含む場合</li>
<li>第三者の権利・利益を侵害する内容を含む場合</li>
<li>虚偽・誤解を招く内容を含む場合</li>
<li>事実無根の誹謗中傷、営業妨害、特定個人への攻撃が含まれる場合</li>
<li>当社の運営方針に著しく反する内容を含む場合</li>
</ul>
</li>
<li>当社は、投稿コンテンツの内容について、真実性・適法性・有用性を保証するものではありません。</li>
</ol>

<div data-callout-type="warning"><p><strong>未成年の方へ：</strong>本サービスは満 18 歳以上の方を対象としています。満 18 歳未満の方がご利用になる場合は、必ず事前に保護者（法定代理人）の同意を得てください。同意なくお申込みされた場合のトラブルについて、当社は責任を負いかねます。</p></div>

<h2>第10条（未成年者の利用）</h2>
<ol>
<li>満 18 歳未満の方は、本サービスを単独で利用することはできません。法定代理人の同意のうえで利用することが必要です。</li>
<li>法定代理人の同意なく本サービスを利用した場合の責任は、利用者および法定代理人が負うものとします。</li>
</ol>

<h2>第11条（アカウント停止・利用制限）</h2>
<ol>
<li>当社は、利用者が本規約に違反した場合、または違反するおそれがあると合理的に判断した場合、事前の通知なくアカウントの一時停止、利用制限、予約の取消し、会員資格の抹消その他必要な措置を講じることができます。</li>
<li>前項の措置に伴い利用者に損害が生じた場合であっても、当社の故意または重過失による場合を除き、当社は責任を負わないものとします。</li>
<li>当社は、以下の場合に継続的な利用をお断りすることがあります。
<ul>
<li>無断キャンセル（ノーショー）を繰り返した場合</li>
<li>繰り返し直前キャンセルを行い、当社または他の利用者に著しい不利益を与えた場合</li>
<li>他の利用者や当社スタッフに対する迷惑行為があった場合</li>
</ul>
</li>
</ol>

<h2>第12条（サービスの変更・中断・終了）</h2>
<ol>
<li>当社は、本サービスの内容を、事前の通知により変更することがあります。</li>
<li>当社は、次の各号のいずれかに該当する場合、事前の通知なく本サービスの全部または一部を中断することができます。
<ul>
<li>システムの保守・点検を行う場合</li>
<li>天災・停電・通信障害その他の不可抗力により運営が困難となった場合</li>
<li>その他、当社が中断を必要と合理的に判断する場合</li>
</ul>
</li>
<li>当社は、利用者に対し事前の通知を行ったうえで、本サービスを終了することができます。</li>
</ol>

<hr>

<h2>第13条（反社会的勢力の排除）</h2>
<ol>
<li>利用者は、反社会的勢力（暴力団、暴力団員、暴力団関係企業、総会屋、社会運動等標ぼうゴロ、特殊知能暴力集団等をいいます）に該当しないこと、および反社会的勢力と資金提供その他の関係を有しないことを表明し、保証するものとします。</li>
<li>利用者が前項の表明・保証に違反した場合、当社は催告なく直ちに予約を取消し、会員資格を抹消し、または本規約に基づく一切の契約関係を解除することができます。</li>
</ol>

<h2>第14条（損害賠償）</h2>
<ol>
<li>利用者が本規約に違反し、または故意もしくは過失により当社に損害を与えた場合、利用者はその損害（弁護士費用を含みます）を賠償する責任を負います。</li>
<li>利用者の行為により第三者に損害を与えた場合、利用者は自己の責任と費用においてこれを解決し、当社に一切の迷惑をかけないものとします。</li>
</ol>

<h2>第15条（免責事項）</h2>
<ol>
<li>当社は、本サービスに関し、特定目的への適合性、商品的価値、正確性、有用性、完全性、適法性、信頼性その他一切について、明示・黙示を問わず保証するものではありません。</li>
<li>当社は、次の事由により生じた損害について責任を負いません。ただし、当社の故意または重過失による場合を除きます。
<ul>
<li>天災、戦争、暴動、停電、通信障害、法令の改廃、その他の不可抗力</li>
<li>利用者自身の機器・通信環境に起因する不具合</li>
<li>利用者の私物の盗難・紛失</li>
<li>スペース内で発生した利用者間・利用者と第三者間のトラブル</li>
</ul>
</li>
<li>当社の責めに帰すべき事由により利用者に損害が生じた場合の賠償額は、当該利用者が当社に支払った直近の利用料金相当額を上限とします。ただし、当社の故意または重過失による場合はこの限りではありません。</li>
</ol>

<div data-callout-type="info"><p>消費者契約法により、当社の故意・重過失による損害については上記の賠償上限は適用されません。本条はあくまで当社に軽過失がある場合の賠償範囲を定めるものです。</p></div>

<hr>

<h2>第16条（通知方法）</h2>
<ol>
<li>当社から利用者への通知は、本サービスへの掲示、電子メール、会員登録時に指定された連絡先への通信等、当社が適当と判断する方法により行います。</li>
<li>前項の通知は、発信をもって利用者に到達したものとみなします。</li>
</ol>

<h2>第17条（規約の変更）</h2>
<ol>
<li>当社は、民法 548 条の 4（定型約款の変更）その他関係法令に従い、本規約を変更することができます。</li>
<li>本規約を変更する場合、当社は、変更後の内容、変更の効力発生時期を、効力発生時期の相当期間前までに、本サービス上での掲示その他の適切な方法により周知します。</li>
<li>変更の効力発生時期を経過した後に利用者が本サービスを利用した場合、利用者は変更後の規約に同意したものとみなされます。</li>
</ol>

<h2>第18条（分離可能性）</h2>
<p>本規約のいずれかの条項が法令により無効または執行不能と判断された場合であっても、本規約の他の条項の効力には影響しないものとします。この場合、当社と利用者は、当該無効または執行不能な条項を適法かつ有効な条項に置き換えるよう誠実に協議するものとします。</p>

<h2>第19条（準拠法・管轄裁判所）</h2>
<ol>
<li>本規約の成立、効力、解釈および適用については、日本法を準拠法とします。</li>
<li>本規約または本サービスに関して当社と利用者との間に紛争が生じた場合、訴額に応じて、当社の所在地を管轄する地方裁判所または簡易裁判所を第一審の専属的合意管轄裁判所とします。</li>
</ol>

<h2>第20条（お問い合わせ）</h2>
<p>本規約に関するお問い合わせは、次の連絡先までお願いいたします。<br>
メール：info@example.com<br>
電話：03-1234-5678</p>', true, '2026-06-26 11:20:55.181', true, 0, '2026-06-26 11:20:55.183', '2026-06-26 11:20:55.183', NULL, NULL, '{LOGIN_SIGNUP,RESERVATION,INQUIRY,EVENT_REGISTRATION}') ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.terms_documents (id, type, slug, title, "contentJson", "contentHtml", "isPublished", "publishedAt", "showInFooter", "footerOrder", "createdAt", "updatedAt", "deletedAt", changelog, scopes) VALUES ('d9561d2f-9816-444d-93db-aea70fed62b2', 'privacy-policy', 'privacy-policy', 'プライバシーポリシー', '{"root": {"type": "root", "format": "", "indent": 0, "version": 1, "children": [{"type": "paragraph", "format": "", "indent": 0, "version": 1, "children": [{"mode": "normal", "text": "最終更新日：2026年6月26日 当社は、お客様の個人情報を関連法令に従い適切に取り扱います。本ポリシーでは、取得する情報・利用目的・第三者提供・お客様の権利についてご説明します。お客様はいつでも自己の個人情報の開示・訂正・利用停止等を請求できます（第 13 項）。 1. 事業者情報 事業者名株式会社サンプル 代表者山田 太郎 所在地〒150-0001 東京都 渋谷区 神宮前1-1-1 サンプルビル メールinfo@example.com 電話03-1234-5678 2. 個人情報保護管理責任者 当社は、個人情報の適切な管理のため、個人情報保護管理責任者を設置しています。 個人情報保護管理責任者：山田 太郎 連絡先：info@example.com 3. 取得する個人情報の項目 当社は、本サービスの提供にあたり、以下の個人情報を取得する場合があります。 氏名・氏名カナ メールアドレス 電話番号 住所 会社名・部署名・役職（法人利用の場合） 生年月日（本人確認を要する場合） ソーシャルログインサービスから取得する情報（プロフィール名、メールアドレス、ID、プロフィール画像等） 決済に関する情報（クレジットカード情報は決済代行会社が直接取得します。当社は保存しません） 予約履歴・利用履歴 投稿コンテンツ（レビュー、写真、コメント等） お問い合わせ内容 Cookie、IP アドレス、ブラウザ情報、アクセスログ等の閲覧情報 4. 利用目的 当社は、取得した個人情報を以下の目的で利用します。 本サービスの提供、予約受付・管理、料金請求および決済処理 本人確認、認証、アカウント管理 サービスに関するお知らせ・重要な連絡の送信 お問い合わせ・ご意見への対応 本サービスの品質向上、新機能の開発、利用状況の分析 不正利用・規約違反行為の検知および防止 マーケティング目的での情報発信（本人の同意を得た場合に限ります） 法令に基づく対応、裁判所・行政機関等からの要請への対応 その他、上記利用目的に付随する業務の遂行 5. 個人情報の第三者提供 当社は、次の場合を除き、あらかじめ本人の同意を得ずに個人情報を第三者に提供しません。 法令に基づく場合 人の生命、身体または財産の保護のために必要がある場合であって、本人の同意を得ることが困難であるとき 公衆衛生の向上または児童の健全な育成の推進のために特に必要がある場合 国の機関もしくは地方公共団体またはその委託を受けた者が法令の定める事務を遂行することに対して協力する必要がある場合 独立行政法人、地方独立行政法人等が法令に基づく事務を遂行する場合 6. 業務委託 当社は、利用目的の達成に必要な範囲内で、個人情報の取扱いを外部事業者（クラウドホスティング事業者、メール配信事業者、決済代行事業者、カスタマーサポート等）に委託する場合があります。委託先との間では、個人情報保護に関する契約を締結し、適切な監督を行います。 7. 利用する外部サービス 当社は、本サービスの提供にあたり、以下の外部サービスを利用しています。各サービスにおけるデータの取扱いについては、各提供事業者のプライバシーポリシーをご確認ください。 7.1 決済処理（Stripe） オンライン決済に、Stripe, Inc.（アメリカ合衆国）の提供する決済サービス「Stripe」を利用しています。クレジットカード情報は Stripe が PCI DSS 準拠環境で直接取得・管理し、当社サーバーには保存されません。 Stripe プライバシーポリシー：https://stripe.com/jp/privacy 7.2 メール配信（Resend） 予約確認・お問い合わせ受付・パスワードリセット等のメール配信に、Resend, Inc.（アメリカ合衆国）の提供するメール配信サービス「Resend」を利用しています。 Resend プライバシーポリシー：https://resend.com/legal/privacy-policy 7.3 ソーシャルログイン（Google OAuth） 会員登録・ログインの選択肢として、Google LLC（アメリカ合衆国）の提供する「Google アカウントでログイン」を利用しています。 Google プライバシーポリシー：https://policies.google.com/privacy 7.4 ソーシャルログイン（LINE Login） 会員登録・ログインの選択肢として、LINE ヤフー株式会社の提供する「LINE Login」を利用しています。 LINE ヤフー プライバシーポリシー：https://www.lycorp.co.jp/ja/company/privacypolicy/ 7.5 カレンダー連携（Google Calendar API） 予約の Google カレンダーへの自動登録・同期に、Google LLC の提供する Google Calendar API を利用しています。本機能をご利用いただく場合、お客様の Google カレンダーへのアクセス許可をいただきます。 7.6 地図表示（Google Maps Embed API） スペースの所在地表示に、Google LLC の提供する Google Maps Embed API を利用しています。地図の表示に際し、Google がお客様の IP アドレス等の情報を取得する場合があります。 7.7 アクセス解析（Google Analytics） 本サービスの利用状況の分析に、Google LLC の提供する「Google Analytics」を利用しています。Google Analytics は Cookie を利用して匿名化された統計情報を収集します。個人を特定する情報は含まれません。 Google Analytics 利用規約：https://marketingplatform.google.com/about/analytics/terms/jp/ Google Analytics オプトアウト：https://tools.google.com/dlpage/gaoptout 7.8 セキュリティ・ストレージ（Cloudflare） 以下の目的に、Cloudflare, Inc.（アメリカ合衆国）のサービスを利用しています。 Cloudflare Turnstile：お問い合わせフォーム・会員登録等の Bot 対策・スパム防止。IP アドレス・User-Agent・ブラウザ指紋等の bot 検出用メタデータを取得します。 Cloudflare R2：スペース画像・ロゴ・オープングラフ画像等のメディアファイルの保存および公開配信。管理者による運営コンテンツの保管に限り利用し、顧客の個人情報の保管には利用していません。アップロードされたファイルおよびそのメタデータが保存されます。 Cloudflare プライバシーポリシー：https://www.cloudflare.com/privacypolicy/ 7.9 SNS 連携（Instagram Graph API） 公式 Instagram アカウントの投稿表示に、Meta Platforms, Inc.（アメリカ合衆国）の提供する Instagram Graph API を利用しています。 Meta プライバシーポリシー：https://www.facebook.com/privacy/policy/ 7.10 クラウドインフラ（Google Cloud Run） 本サービスのサーバー環境に、Google LLC の提供する「Google Cloud Run」を利用しています。データセンターの所在地は原則として日本国内（東京リージョン）ですが、サービス提供上必要な場合に限り、他リージョンとの間でデータが転送されることがあります。 8. 個人データの越境移転 当社が利用する外部サービスの一部はアメリカ合衆国の事業者が提供しており、個人データが同国へ移転される場合があります。当社は個人情報保護法第 28 条に基づき、移転先の保護体制の確認とデータ保護契約（DPA）の締結を行っています。 当社は、個人情報保護法第 28 条に基づき、次の措置を講じています。 移転先事業者における個人情報保護の体制について、公表情報に基づき確認を行っています 移転先事業者との間で、個人情報保護法に準じたデータ保護契約（DPA）を締結しています アメリカ合衆国における個人情報保護制度の概要は、個人情報保護委員会ウェブサイトにおいて確認することができます：https://www.ppc.go.jp/personalinfo/legal/kaiseihogohou/#gaikoku 9. 個人関連情報の取扱い 当社は、Cookie 等を通じて取得した個人関連情報（Cookie ID、閲覧履歴、行動履歴等）について、個人情報と結びつけて利用する場合があります。また、第三者が当該個人関連情報を個人データとして取得することが想定される場合は、個人情報保護法第 31 条に基づき、本人の同意が得られていることを確認したうえで提供します。 10. 保有期間 当社は、利用目的の達成に必要な期間に限り個人情報を保有し、当該期間経過後は速やかに削除または匿名化します。 情報の種類保有期間 会員情報退会後 1 年間（法令上の保存義務がある場合はその期間） 予約・取引履歴取引完了後 7 年間（法人税法・消費税法に基づく保存義務） お問い合わせ記録対応完了後 3 年間 アクセスログ取得後 1 年間 11. 安全管理措置 当社は、取得した個人情報について、漏洩、滅失または毀損の防止その他の安全管理のため、以下の措置を講じています。 組織的安全管理措置：個人情報保護管理責任者の設置、取扱い規程の整備、従業員への教育 人的安全管理措置：従業員との秘密保持契約、個人情報取扱いに関する定期研修 物理的安全管理措置：個人情報を取り扱う区域への入退室管理、機器・書類の盗難等の防止 技術的安全管理措置：通信経路の暗号化（HTTPS）、アクセス権限の最小化、不正アクセス防止のためのファイアウォール・WAF、パスワードのハッシュ化保存、定期的な脆弱性診断 外的環境の把握：前項 8 に記載のとおり、越境移転先の制度について把握のうえ必要な措置を講じています 12. Cookie およびアクセスログ 当社のウェブサイトでは、次の目的で Cookie およびアクセスログを利用しています。 ログイン状態の維持 認証・セキュリティ対策（CSRF 対策等） アクセス解析・サービス改善 本人の同意に基づくマーケティング目的 ブラウザの設定によりCookieの受け入れを拒否することができますが、その場合、一部の機能がご利用いただけなくなることがあります。Cookie の詳細な取扱いについては、別途「Cookie ポリシー」をご確認ください。 13. 開示・訂正・利用停止等の請求 お客様は、当社が保有する自己の個人情報について、開示・訂正・追加・削除・利用停止・第三者提供の停止・利用目的の通知を請求できます。第 16 項のお問い合わせ窓口までお申し出ください。 利用者は、当社が保有する自己の個人情報について、開示、訂正、追加、削除、利用の停止、第三者提供の停止、利用目的の通知を請求することができます。 請求は、第 16 項記載の連絡先までお申し出ください。ご本人であることを確認のうえ、法令に定める期間内に対応いたします。 請求にあたっては、法令に基づき手数料をいただく場合があります。 14. 個人情報漏洩時の対応 当社は、個人情報保護法第 26 条に基づく個人の権利利益を害するおそれが大きい事態が発生した場合には、速やかに個人情報保護委員会への報告および本人への通知を行います。 15. 未成年者の個人情報 満 18 歳未満の方の個人情報を取得する場合、法定代理人の同意を得たうえで取得します。 16. お問い合わせ窓口 個人情報の取扱いに関するお問い合わせは、次の連絡先までお願いいたします。 メール：info@example.com 電話：03-1234-5678 17. プライバシーポリシーの変更 当社は、法令の改正その他必要に応じて本プライバシーポリシーを変更することがあります。重要な変更を行う場合、当社は、変更後の内容および効力発生時期を、本サービス上での掲示その他の適切な方法により周知します。", "type": "text", "style": "", "detail": 0, "format": 0, "version": 1}], "direction": "ltr", "textStyle": "", "textFormat": 0}], "direction": "ltr"}}', '<p>最終更新日：2026年6月26日</p>

<div data-callout-type="info"><p>当社は、お客様の個人情報を関連法令に従い適切に取り扱います。本ポリシーでは、取得する情報・利用目的・第三者提供・お客様の権利についてご説明します。お客様はいつでも自己の個人情報の開示・訂正・利用停止等を請求できます（<strong>第 13 項</strong>）。</p></div>

<h2>1. 事業者情報</h2>
<table>
<tbody>
<tr><th>事業者名</th><td>株式会社サンプル</td></tr>
<tr><th>代表者</th><td>山田 太郎</td></tr>
<tr><th>所在地</th><td>〒150-0001 東京都 渋谷区 神宮前1-1-1 サンプルビル</td></tr>
<tr><th>メール</th><td>info@example.com</td></tr>
<tr><th>電話</th><td>03-1234-5678</td></tr>
</tbody>
</table>

<h2>2. 個人情報保護管理責任者</h2>
<p>当社は、個人情報の適切な管理のため、個人情報保護管理責任者を設置しています。</p>
<p>個人情報保護管理責任者：山田 太郎<br>
連絡先：info@example.com</p>

<h2>3. 取得する個人情報の項目</h2>
<p>当社は、本サービスの提供にあたり、以下の個人情報を取得する場合があります。</p>
<ul>
<li>氏名・氏名カナ</li>
<li>メールアドレス</li>
<li>電話番号</li>
<li>住所</li>
<li>会社名・部署名・役職（法人利用の場合）</li>
<li>生年月日（本人確認を要する場合）</li>
<li>ソーシャルログインサービスから取得する情報（プロフィール名、メールアドレス、ID、プロフィール画像等）</li>
<li>決済に関する情報（クレジットカード情報は決済代行会社が直接取得します。当社は保存しません）</li>
<li>予約履歴・利用履歴</li>
<li>投稿コンテンツ（レビュー、写真、コメント等）</li>
<li>お問い合わせ内容</li>
<li>Cookie、IP アドレス、ブラウザ情報、アクセスログ等の閲覧情報</li>
</ul>

<h2>4. 利用目的</h2>
<p>当社は、取得した個人情報を以下の目的で利用します。</p>
<ul>
<li>本サービスの提供、予約受付・管理、料金請求および決済処理</li>
<li>本人確認、認証、アカウント管理</li>
<li>サービスに関するお知らせ・重要な連絡の送信</li>
<li>お問い合わせ・ご意見への対応</li>
<li>本サービスの品質向上、新機能の開発、利用状況の分析</li>
<li>不正利用・規約違反行為の検知および防止</li>
<li>マーケティング目的での情報発信（本人の同意を得た場合に限ります）</li>
<li>法令に基づく対応、裁判所・行政機関等からの要請への対応</li>
<li>その他、上記利用目的に付随する業務の遂行</li>
</ul>

<h2>5. 個人情報の第三者提供</h2>
<p>当社は、次の場合を除き、あらかじめ本人の同意を得ずに個人情報を第三者に提供しません。</p>
<ul>
<li>法令に基づく場合</li>
<li>人の生命、身体または財産の保護のために必要がある場合であって、本人の同意を得ることが困難であるとき</li>
<li>公衆衛生の向上または児童の健全な育成の推進のために特に必要がある場合</li>
<li>国の機関もしくは地方公共団体またはその委託を受けた者が法令の定める事務を遂行することに対して協力する必要がある場合</li>
<li>独立行政法人、地方独立行政法人等が法令に基づく事務を遂行する場合</li>
</ul>

<h2>6. 業務委託</h2>
<p>当社は、利用目的の達成に必要な範囲内で、個人情報の取扱いを外部事業者（クラウドホスティング事業者、メール配信事業者、決済代行事業者、カスタマーサポート等）に委託する場合があります。委託先との間では、個人情報保護に関する契約を締結し、適切な監督を行います。</p>

<hr>

<h2>7. 利用する外部サービス</h2>
<p>当社は、本サービスの提供にあたり、以下の外部サービスを利用しています。各サービスにおけるデータの取扱いについては、各提供事業者のプライバシーポリシーをご確認ください。</p>

<h3>7.1 決済処理（Stripe）</h3>
<p>オンライン決済に、Stripe, Inc.（アメリカ合衆国）の提供する決済サービス「Stripe」を利用しています。クレジットカード情報は Stripe が PCI DSS 準拠環境で直接取得・管理し、当社サーバーには保存されません。</p>
<ul>
<li>Stripe プライバシーポリシー：https://stripe.com/jp/privacy</li>
</ul>

<h3>7.2 メール配信（Resend）</h3>
<p>予約確認・お問い合わせ受付・パスワードリセット等のメール配信に、Resend, Inc.（アメリカ合衆国）の提供するメール配信サービス「Resend」を利用しています。</p>
<ul>
<li>Resend プライバシーポリシー：https://resend.com/legal/privacy-policy</li>
</ul>

<h3>7.3 ソーシャルログイン（Google OAuth）</h3>
<p>会員登録・ログインの選択肢として、Google LLC（アメリカ合衆国）の提供する「Google アカウントでログイン」を利用しています。</p>
<ul>
<li>Google プライバシーポリシー：https://policies.google.com/privacy</li>
</ul>

<h3>7.4 ソーシャルログイン（LINE Login）</h3>
<p>会員登録・ログインの選択肢として、LINE ヤフー株式会社の提供する「LINE Login」を利用しています。</p>
<ul>
<li>LINE ヤフー プライバシーポリシー：https://www.lycorp.co.jp/ja/company/privacypolicy/</li>
</ul>

<h3>7.5 カレンダー連携（Google Calendar API）</h3>
<p>予約の Google カレンダーへの自動登録・同期に、Google LLC の提供する Google Calendar API を利用しています。本機能をご利用いただく場合、お客様の Google カレンダーへのアクセス許可をいただきます。</p>

<h3>7.6 地図表示（Google Maps Embed API）</h3>
<p>スペースの所在地表示に、Google LLC の提供する Google Maps Embed API を利用しています。地図の表示に際し、Google がお客様の IP アドレス等の情報を取得する場合があります。</p>

<h3>7.7 アクセス解析（Google Analytics）</h3>
<p>本サービスの利用状況の分析に、Google LLC の提供する「Google Analytics」を利用しています。Google Analytics は Cookie を利用して匿名化された統計情報を収集します。個人を特定する情報は含まれません。</p>
<ul>
<li>Google Analytics 利用規約：https://marketingplatform.google.com/about/analytics/terms/jp/</li>
<li>Google Analytics オプトアウト：https://tools.google.com/dlpage/gaoptout</li>
</ul>

<h3>7.8 セキュリティ・ストレージ（Cloudflare）</h3>
<p>以下の目的に、Cloudflare, Inc.（アメリカ合衆国）のサービスを利用しています。</p>
<ul>
<li><strong>Cloudflare Turnstile</strong>：お問い合わせフォーム・会員登録等の Bot 対策・スパム防止。IP アドレス・User-Agent・ブラウザ指紋等の bot 検出用メタデータを取得します。</li>
<li><strong>Cloudflare R2</strong>：スペース画像・ロゴ・オープングラフ画像等のメディアファイルの保存および公開配信。管理者による運営コンテンツの保管に限り利用し、顧客の個人情報の保管には利用していません。アップロードされたファイルおよびそのメタデータが保存されます。</li>
</ul>
<ul>
<li>Cloudflare プライバシーポリシー：https://www.cloudflare.com/privacypolicy/</li>
</ul>

<h3>7.9 SNS 連携（Instagram Graph API）</h3>
<p>公式 Instagram アカウントの投稿表示に、Meta Platforms, Inc.（アメリカ合衆国）の提供する Instagram Graph API を利用しています。</p>
<ul>
<li>Meta プライバシーポリシー：https://www.facebook.com/privacy/policy/</li>
</ul>

<h3>7.10 クラウドインフラ（Google Cloud Run）</h3>
<p>本サービスのサーバー環境に、Google LLC の提供する「Google Cloud Run」を利用しています。データセンターの所在地は原則として日本国内（東京リージョン）ですが、サービス提供上必要な場合に限り、他リージョンとの間でデータが転送されることがあります。</p>

<h2>8. 個人データの越境移転</h2>
<div data-callout-type="info"><p>当社が利用する外部サービスの一部はアメリカ合衆国の事業者が提供しており、個人データが同国へ移転される場合があります。当社は個人情報保護法第 28 条に基づき、移転先の保護体制の確認とデータ保護契約（DPA）の締結を行っています。</p></div>
<p>当社は、個人情報保護法第 28 条に基づき、次の措置を講じています。</p>
<ul>
<li>移転先事業者における個人情報保護の体制について、公表情報に基づき確認を行っています</li>
<li>移転先事業者との間で、個人情報保護法に準じたデータ保護契約（DPA）を締結しています</li>
<li>アメリカ合衆国における個人情報保護制度の概要は、個人情報保護委員会ウェブサイトにおいて確認することができます：https://www.ppc.go.jp/personalinfo/legal/kaiseihogohou/#gaikoku</li>
</ul>

<h2>9. 個人関連情報の取扱い</h2>
<p>当社は、Cookie 等を通じて取得した個人関連情報（Cookie ID、閲覧履歴、行動履歴等）について、個人情報と結びつけて利用する場合があります。また、第三者が当該個人関連情報を個人データとして取得することが想定される場合は、個人情報保護法第 31 条に基づき、本人の同意が得られていることを確認したうえで提供します。</p>

<h2>10. 保有期間</h2>
<p>当社は、利用目的の達成に必要な期間に限り個人情報を保有し、当該期間経過後は速やかに削除または匿名化します。</p>
<table>
<thead>
<tr><th>情報の種類</th><th>保有期間</th></tr>
</thead>
<tbody>
<tr><td>会員情報</td><td>退会後 1 年間（法令上の保存義務がある場合はその期間）</td></tr>
<tr><td>予約・取引履歴</td><td>取引完了後 7 年間（法人税法・消費税法に基づく保存義務）</td></tr>
<tr><td>お問い合わせ記録</td><td>対応完了後 3 年間</td></tr>
<tr><td>アクセスログ</td><td>取得後 1 年間</td></tr>
</tbody>
</table>

<h2>11. 安全管理措置</h2>
<p>当社は、取得した個人情報について、漏洩、滅失または毀損の防止その他の安全管理のため、以下の措置を講じています。</p>
<ul>
<li><strong>組織的安全管理措置</strong>：個人情報保護管理責任者の設置、取扱い規程の整備、従業員への教育</li>
<li><strong>人的安全管理措置</strong>：従業員との秘密保持契約、個人情報取扱いに関する定期研修</li>
<li><strong>物理的安全管理措置</strong>：個人情報を取り扱う区域への入退室管理、機器・書類の盗難等の防止</li>
<li><strong>技術的安全管理措置</strong>：通信経路の暗号化（HTTPS）、アクセス権限の最小化、不正アクセス防止のためのファイアウォール・WAF、パスワードのハッシュ化保存、定期的な脆弱性診断</li>
<li><strong>外的環境の把握</strong>：前項 8 に記載のとおり、越境移転先の制度について把握のうえ必要な措置を講じています</li>
</ul>

<h2>12. Cookie およびアクセスログ</h2>
<p>当社のウェブサイトでは、次の目的で Cookie およびアクセスログを利用しています。</p>
<ul>
<li>ログイン状態の維持</li>
<li>認証・セキュリティ対策（CSRF 対策等）</li>
<li>アクセス解析・サービス改善</li>
<li>本人の同意に基づくマーケティング目的</li>
</ul>
<p>ブラウザの設定によりCookieの受け入れを拒否することができますが、その場合、一部の機能がご利用いただけなくなることがあります。Cookie の詳細な取扱いについては、別途「Cookie ポリシー」をご確認ください。</p>

<hr>

<h2>13. 開示・訂正・利用停止等の請求</h2>
<div data-callout-type="success"><p>お客様は、当社が保有する自己の個人情報について、<strong>開示・訂正・追加・削除・利用停止・第三者提供の停止・利用目的の通知</strong>を請求できます。第 16 項のお問い合わせ窓口までお申し出ください。</p></div>
<ol>
<li>利用者は、当社が保有する自己の個人情報について、開示、訂正、追加、削除、利用の停止、第三者提供の停止、利用目的の通知を請求することができます。</li>
<li>請求は、第 16 項記載の連絡先までお申し出ください。ご本人であることを確認のうえ、法令に定める期間内に対応いたします。</li>
<li>請求にあたっては、法令に基づき手数料をいただく場合があります。</li>
</ol>

<h2>14. 個人情報漏洩時の対応</h2>
<p>当社は、個人情報保護法第 26 条に基づく個人の権利利益を害するおそれが大きい事態が発生した場合には、速やかに個人情報保護委員会への報告および本人への通知を行います。</p>

<h2>15. 未成年者の個人情報</h2>
<p>満 18 歳未満の方の個人情報を取得する場合、法定代理人の同意を得たうえで取得します。</p>

<h2>16. お問い合わせ窓口</h2>
<p>個人情報の取扱いに関するお問い合わせは、次の連絡先までお願いいたします。<br>
メール：info@example.com<br>
電話：03-1234-5678</p>

<h2>17. プライバシーポリシーの変更</h2>
<p>当社は、法令の改正その他必要に応じて本プライバシーポリシーを変更することがあります。重要な変更を行う場合、当社は、変更後の内容および効力発生時期を、本サービス上での掲示その他の適切な方法により周知します。</p>', true, '2026-06-26 11:20:55.235', true, 1, '2026-06-26 11:20:55.236', '2026-06-26 11:20:55.236', NULL, NULL, '{LOGIN_SIGNUP,INQUIRY,RESERVATION,EVENT_REGISTRATION}') ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.terms_documents (id, type, slug, title, "contentJson", "contentHtml", "isPublished", "publishedAt", "showInFooter", "footerOrder", "createdAt", "updatedAt", "deletedAt", changelog, scopes) VALUES ('e3685398-fd58-4829-b202-ccf51b7fa3f8', 'cancellation', 'cancellation-policy', 'キャンセルポリシー', '{"root": {"type": "root", "format": "", "indent": 0, "version": 1, "children": [{"type": "paragraph", "format": "", "indent": 0, "version": 1, "children": [{"mode": "normal", "text": "最終更新日：2026年6月26日 事業者情報 事業者名株式会社サンプル 代表者山田 太郎 所在地〒150-0001 東京都 渋谷区 神宮前1-1-1 サンプルビル メールinfo@example.com 電話03-1234-5678 ご予約のキャンセルには、ご利用開始日時を基準としたキャンセル料が発生します。キャンセル時期が利用日に近いほどキャンセル料が高くなります。お早めのお手続きにご協力ください。 1. 適用範囲 本ポリシーは、株式会社サンプル（以下「当社」といいます）が提供するレンタルスペースサービスにおける、予約のキャンセル・変更・返金の取扱いを定めるものです。 2. キャンセル料金 ご予約のキャンセルには、キャンセル時期に応じて以下のキャンセル料金が発生します。キャンセル時期は、ご利用開始日時を基準に計算します。 キャンセル時期キャンセル料 ご利用開始 7 日前まで無料 ご利用開始 3 日前〜6 日前利用料金の 30% ご利用開始前日〜2 日前利用料金の 50% ご利用開始当日利用料金の 100% 無断キャンセル（ノーショー）利用料金の 100% ご利用当日のキャンセルおよび無断キャンセル（ノーショー）は、利用料金の 100% をキャンセル料として申し受けます。予定が変わった場合は、できるだけ早めにキャンセルのお手続きをお願いいたします。 3. キャンセル方法 キャンセルは、マイページの「予約一覧」より該当予約を選択してお手続きください。 マイページによるキャンセルが困難な場合は、上記連絡先までご連絡ください。 システム上のキャンセル受付完了時刻をもって、キャンセル時期を判定します。 受付完了後、登録メールアドレス宛てにキャンセル確認メールを自動送信します。メールが届かない場合は、お問い合わせください。 4. クーポン利用時のキャンセル クーポンをご利用いただいた予約をキャンセルした場合、キャンセル料の有無にかかわらず、使用済みクーポンの利用回数は復元され、再度ご利用いただけます（ただし、クーポンの有効期限が経過している場合はご利用いただけません）。 当社都合によるキャンセルの場合も同様とします。 5. 返金 キャンセル料を差し引いた残額を、以下のとおり返金いたします。 クレジットカード決済の場合：決済代行会社（Stripe）を通じ、ご利用いただいたクレジットカードへ返金します。返金処理の完了までに、カード会社により 5〜30 日程度を要することがあります。 銀行振込の場合：お客様指定の口座へ振り込みます。振込手数料はお客様のご負担とし、返金額から差し引かせていただきます。 決済時の決済代行手数料は、返金対象外とする場合があります。詳細は支払い規約に従います。 締め日をまたぐご利用・返金の場合、カード会社の処理時期により、ご利用月と返金月が異なる場合があります。 6. 予約変更について 予約の日時・スペースの変更は、マイページよりお手続きいただけます。 変更は、キャンセル扱いのうえ新規予約として承ります。変更時のキャンセル料は、第 2 条のキャンセル料規定に従います。 変更後の新規予約の料金が変動する場合、差額のご請求または返金が発生します。 空き状況により、ご希望の日時・スペースに変更できない場合があります。 7. 当社都合によるキャンセル 天災・設備の重大な故障・感染症拡大防止のための休業等、当社の都合により本サービスを提供できなくなった場合は、利用料金を全額返金いたします。キャンセル料は発生しません。 天災、設備の重大な故障、感染症拡大防止のための休業、その他当社の責に帰すべからざる事由により本サービスの提供が困難となった場合、利用料金の全額を返金いたします。キャンセル料は発生しません。 前項の場合、代替日時・代替スペースのご提案を行うことがあります。 本項に基づく返金以外に、交通費・宿泊費等の付随費用の補償は致しかねます。 8. 不可抗力によるお客様側のキャンセル お客様側の事情による天災・交通機関の運休・感染症罹患等を理由とするキャンセルにつきましても、本ポリシー第 2 条のキャンセル料規定に従います。必要に応じて旅行保険等のご利用をご検討ください。 9. ノーショー・繰り返しキャンセル 無断キャンセル（ノーショー）は、利用料金の 100% をキャンセル料として申し受けます。 当社は、短期間に複数回のノーショーまたは直前キャンセルを繰り返した利用者に対し、以後のご利用をお断りする場合があります。 10. 領収書の取扱い キャンセルが発生した予約に関し既に発行済みの領収書は、キャンセル料に対応する金額に再発行いたします。再発行をご希望の場合は、お問い合わせください。 11. お問い合わせ キャンセルに関するお問い合わせは、次の連絡先までお願いいたします。 メール：info@example.com 電話：03-1234-5678", "type": "text", "style": "", "detail": 0, "format": 0, "version": 1}], "direction": "ltr", "textStyle": "", "textFormat": 0}], "direction": "ltr"}}', '<p>最終更新日：2026年6月26日</p>

<h2>事業者情報</h2>
<table>
<tbody>
<tr><th>事業者名</th><td>株式会社サンプル</td></tr>
<tr><th>代表者</th><td>山田 太郎</td></tr>
<tr><th>所在地</th><td>〒150-0001 東京都 渋谷区 神宮前1-1-1 サンプルビル</td></tr>
<tr><th>メール</th><td>info@example.com</td></tr>
<tr><th>電話</th><td>03-1234-5678</td></tr>
</tbody>
</table>

<div data-callout-type="info"><p>ご予約のキャンセルには、ご利用開始日時を基準としたキャンセル料が発生します。キャンセル時期が利用日に近いほどキャンセル料が高くなります。お早めのお手続きにご協力ください。</p></div>

<h2>1. 適用範囲</h2>
<p>本ポリシーは、株式会社サンプル（以下「当社」といいます）が提供するレンタルスペースサービスにおける、予約のキャンセル・変更・返金の取扱いを定めるものです。</p>

<h2>2. キャンセル料金</h2>
<p>ご予約のキャンセルには、キャンセル時期に応じて以下のキャンセル料金が発生します。キャンセル時期は、ご利用開始日時を基準に計算します。</p>

<table>
<thead>
<tr><th>キャンセル時期</th><th>キャンセル料</th></tr>
</thead>
<tbody>
<tr><td>ご利用開始 7 日前まで</td><td>無料</td></tr>
<tr><td>ご利用開始 3 日前〜6 日前</td><td>利用料金の 30%</td></tr>
<tr><td>ご利用開始前日〜2 日前</td><td>利用料金の 50%</td></tr>
<tr><td>ご利用開始当日</td><td>利用料金の 100%</td></tr>
<tr><td>無断キャンセル（ノーショー）</td><td>利用料金の 100%</td></tr>
</tbody>
</table>

<div data-callout-type="warning"><p><strong>ご利用当日のキャンセルおよび無断キャンセル（ノーショー）は、利用料金の 100% をキャンセル料として申し受けます。</strong>予定が変わった場合は、できるだけ早めにキャンセルのお手続きをお願いいたします。</p></div>

<h2>3. キャンセル方法</h2>
<ol>
<li>キャンセルは、マイページの「予約一覧」より該当予約を選択してお手続きください。</li>
<li>マイページによるキャンセルが困難な場合は、上記連絡先までご連絡ください。</li>
<li>システム上のキャンセル受付完了時刻をもって、キャンセル時期を判定します。</li>
<li>受付完了後、登録メールアドレス宛てにキャンセル確認メールを自動送信します。メールが届かない場合は、お問い合わせください。</li>
</ol>

<h2>4. クーポン利用時のキャンセル</h2>
<ol>
<li>クーポンをご利用いただいた予約をキャンセルした場合、キャンセル料の有無にかかわらず、使用済みクーポンの利用回数は復元され、再度ご利用いただけます（ただし、クーポンの有効期限が経過している場合はご利用いただけません）。</li>
<li>当社都合によるキャンセルの場合も同様とします。</li>
</ol>

<h2>5. 返金</h2>
<ol>
<li>キャンセル料を差し引いた残額を、以下のとおり返金いたします。
<ul>
<li><strong>クレジットカード決済の場合</strong>：決済代行会社（Stripe）を通じ、ご利用いただいたクレジットカードへ返金します。返金処理の完了までに、カード会社により 5〜30 日程度を要することがあります。</li>
<li><strong>銀行振込の場合</strong>：お客様指定の口座へ振り込みます。振込手数料はお客様のご負担とし、返金額から差し引かせていただきます。</li>
</ul>
</li>
<li>決済時の決済代行手数料は、返金対象外とする場合があります。詳細は支払い規約に従います。</li>
<li>締め日をまたぐご利用・返金の場合、カード会社の処理時期により、ご利用月と返金月が異なる場合があります。</li>
</ol>

<hr>

<h2>6. 予約変更について</h2>
<ol>
<li>予約の日時・スペースの変更は、マイページよりお手続きいただけます。</li>
<li>変更は、キャンセル扱いのうえ新規予約として承ります。変更時のキャンセル料は、第 2 条のキャンセル料規定に従います。</li>
<li>変更後の新規予約の料金が変動する場合、差額のご請求または返金が発生します。</li>
<li>空き状況により、ご希望の日時・スペースに変更できない場合があります。</li>
</ol>

<h2>7. 当社都合によるキャンセル</h2>
<div data-callout-type="success"><p>天災・設備の重大な故障・感染症拡大防止のための休業等、当社の都合により本サービスを提供できなくなった場合は、利用料金を全額返金いたします。キャンセル料は発生しません。</p></div>
<ol>
<li>天災、設備の重大な故障、感染症拡大防止のための休業、その他当社の責に帰すべからざる事由により本サービスの提供が困難となった場合、利用料金の全額を返金いたします。キャンセル料は発生しません。</li>
<li>前項の場合、代替日時・代替スペースのご提案を行うことがあります。</li>
<li>本項に基づく返金以外に、交通費・宿泊費等の付随費用の補償は致しかねます。</li>
</ol>

<h2>8. 不可抗力によるお客様側のキャンセル</h2>
<p>お客様側の事情による天災・交通機関の運休・感染症罹患等を理由とするキャンセルにつきましても、本ポリシー第 2 条のキャンセル料規定に従います。必要に応じて旅行保険等のご利用をご検討ください。</p>

<h2>9. ノーショー・繰り返しキャンセル</h2>
<ol>
<li>無断キャンセル（ノーショー）は、利用料金の 100% をキャンセル料として申し受けます。</li>
<li>当社は、短期間に複数回のノーショーまたは直前キャンセルを繰り返した利用者に対し、以後のご利用をお断りする場合があります。</li>
</ol>

<h2>10. 領収書の取扱い</h2>
<p>キャンセルが発生した予約に関し既に発行済みの領収書は、キャンセル料に対応する金額に再発行いたします。再発行をご希望の場合は、お問い合わせください。</p>

<h2>11. お問い合わせ</h2>
<p>キャンセルに関するお問い合わせは、次の連絡先までお願いいたします。<br>
メール：info@example.com<br>
電話：03-1234-5678</p>', true, '2026-06-26 11:20:55.283', true, 2, '2026-06-26 11:20:55.285', '2026-06-26 11:20:55.285', NULL, NULL, '{RESERVATION,EVENT_REGISTRATION}') ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.terms_documents (id, type, slug, title, "contentJson", "contentHtml", "isPublished", "publishedAt", "showInFooter", "footerOrder", "createdAt", "updatedAt", "deletedAt", changelog, scopes) VALUES ('16238567-23ae-4a1a-bcf6-bb15cda6bb5b', 'commercial-transaction', 'commercial-transaction', '特定商取引法に基づく表記', '{"root": {"type": "root", "format": "", "indent": 0, "version": 1, "children": [{"type": "paragraph", "format": "", "indent": 0, "version": 1, "children": [{"mode": "normal", "text": "最終更新日：2026年6月26日 特定商取引法第 11 条に基づき、本サービスの販売事業者・販売価格・支払方法・提供時期・キャンセル等の取引条件を以下のとおり表示します。 販売事業者 事業者名称株式会社サンプル 代表者山田 太郎 法人番号1234567890123 所在地〒150-0001 東京都 渋谷区 神宮前1-1-1 サンプルビル 電話番号03-1234-5678 FAX番号【FAX番号を入力してください】 電話受付時間平日 10:00〜18:00（土日祝日・年末年始を除く） メールアドレスinfo@example.com 適格請求書発行事業者登録番号【インボイス登録番号を入力してください（T+13桁）】 販売価格 各スペースの詳細ページに表示された料金（消費税込み・総額表示） 商品・サービスの内容 レンタルスペースの時間貸しサービス 販売数量の制限 各スペースの定員・予約可能枠の範囲内でご利用いただけます。定員超過・枠満了によりお断りする場合があります。 対価以外に必要な費用 インターネット通信料（お客様負担） オプションサービス利用時の追加料金（各オプション表示料金） 銀行振込ご利用時の振込手数料（お客様負担） 利用時間延長・原状回復不備・特別清掃が必要な場合の追加料金 支払方法 クレジットカード決済（VISA / Mastercard / JCB / American Express / Diners Club） 銀行振込（前払い） 支払時期 クレジットカード決済：予約確定時に決済が実行されます。 銀行振込：予約確定後、当社が指定する期限までにお振込みください。期限までに入金が確認できない場合、予約は自動的にキャンセルされます。 サービスの提供時期 予約確定後、お客様が予約された日時においてスペースをご利用いただけます。 キャンセル・返金 キャンセル・返金は別途定める「キャンセルポリシー」に従います。本サービスの性質上、サービス提供後の返品・交換には応じられません。 キャンセル・返金に関しては、別途定める「キャンセルポリシー」に従います。本サービスの性質上、サービス提供後の返品・交換には応じられません。 未成年者の利用 満 18 歳未満の方は、法定代理人（親権者等）の同意を得ずに本サービスをお申込みいただくことはできません。同意なく行われた申込みは、民法に従い取り消されることがあります。 動作環境 本サービスの予約システムをご利用いただくには、以下の環境が必要です。 Google Chrome、Safari、Firefox、Microsoft Edge の最新版 JavaScript の有効化 Cookie の有効化 特別な販売条件 利用にあたっては、利用規約・施設利用規約への同意が必要です。 当社の定める禁止事項に該当する利用はお断りします。 当社の判断により、利用をお断りする場合があります。", "type": "text", "style": "", "detail": 0, "format": 0, "version": 1}], "direction": "ltr", "textStyle": "", "textFormat": 0}], "direction": "ltr"}}', '<p>最終更新日：2026年6月26日</p>

<div data-callout-type="info"><p>特定商取引法第 11 条に基づき、本サービスの販売事業者・販売価格・支払方法・提供時期・キャンセル等の取引条件を以下のとおり表示します。</p></div>

<h2>販売事業者</h2>
<table>
<tbody>
<tr><th>事業者名称</th><td>株式会社サンプル</td></tr>
<tr><th>代表者</th><td>山田 太郎</td></tr>
<tr><th>法人番号</th><td>1234567890123</td></tr>
<tr><th>所在地</th><td>〒150-0001 東京都 渋谷区 神宮前1-1-1 サンプルビル</td></tr>
<tr><th>電話番号</th><td>03-1234-5678</td></tr>
<tr><th>FAX番号</th><td>【FAX番号を入力してください】</td></tr>
<tr><th>電話受付時間</th><td>平日 10:00〜18:00（土日祝日・年末年始を除く）</td></tr>
<tr><th>メールアドレス</th><td>info@example.com</td></tr>
<tr><th>適格請求書発行事業者登録番号</th><td>【インボイス登録番号を入力してください（T+13桁）】</td></tr>
</tbody>
</table>

<h2>販売価格</h2>
<p>各スペースの詳細ページに表示された料金（消費税込み・総額表示）</p>

<h2>商品・サービスの内容</h2>
<p>レンタルスペースの時間貸しサービス</p>

<h2>販売数量の制限</h2>
<p>各スペースの定員・予約可能枠の範囲内でご利用いただけます。定員超過・枠満了によりお断りする場合があります。</p>

<h2>対価以外に必要な費用</h2>
<ul>
<li>インターネット通信料（お客様負担）</li>
<li>オプションサービス利用時の追加料金（各オプション表示料金）</li>
<li>銀行振込ご利用時の振込手数料（お客様負担）</li>
<li>利用時間延長・原状回復不備・特別清掃が必要な場合の追加料金</li>
</ul>

<h2>支払方法</h2>
<ul>
<li>クレジットカード決済（VISA / Mastercard / JCB / American Express / Diners Club）</li>
<li>銀行振込（前払い）</li>
</ul>

<h2>支払時期</h2>
<ul>
<li><strong>クレジットカード決済</strong>：予約確定時に決済が実行されます。</li>
<li><strong>銀行振込</strong>：予約確定後、当社が指定する期限までにお振込みください。期限までに入金が確認できない場合、予約は自動的にキャンセルされます。</li>
</ul>

<h2>サービスの提供時期</h2>
<p>予約確定後、お客様が予約された日時においてスペースをご利用いただけます。</p>

<h2>キャンセル・返金</h2>
<div data-callout-type="warning"><p>キャンセル・返金は別途定める「キャンセルポリシー」に従います。本サービスの性質上、サービス提供後の返品・交換には応じられません。</p></div>
<p>キャンセル・返金に関しては、別途定める「キャンセルポリシー」に従います。本サービスの性質上、サービス提供後の返品・交換には応じられません。</p>

<h2>未成年者の利用</h2>
<p>満 18 歳未満の方は、法定代理人（親権者等）の同意を得ずに本サービスをお申込みいただくことはできません。同意なく行われた申込みは、民法に従い取り消されることがあります。</p>

<h2>動作環境</h2>
<p>本サービスの予約システムをご利用いただくには、以下の環境が必要です。</p>
<ul>
<li>Google Chrome、Safari、Firefox、Microsoft Edge の最新版</li>
<li>JavaScript の有効化</li>
<li>Cookie の有効化</li>
</ul>

<h2>特別な販売条件</h2>
<ul>
<li>利用にあたっては、利用規約・施設利用規約への同意が必要です。</li>
<li>当社の定める禁止事項に該当する利用はお断りします。</li>
<li>当社の判断により、利用をお断りする場合があります。</li>
</ul>', true, '2026-06-26 11:20:55.331', true, 3, '2026-06-26 11:20:55.332', '2026-06-26 11:20:55.332', NULL, NULL, '{}') ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.terms_documents (id, type, slug, title, "contentJson", "contentHtml", "isPublished", "publishedAt", "showInFooter", "footerOrder", "createdAt", "updatedAt", "deletedAt", changelog, scopes) VALUES ('708a5ca5-6a05-4d44-b81b-788666a4b662', 'payment', 'payment-terms', '支払い規約', '{"root": {"type": "root", "format": "", "indent": 0, "version": 1, "children": [{"type": "paragraph", "format": "", "indent": 0, "version": 1, "children": [{"mode": "normal", "text": "最終更新日：2026年6月26日 事業者情報 事業者名株式会社サンプル 代表者山田 太郎 所在地〒150-0001 東京都 渋谷区 神宮前1-1-1 サンプルビル メールinfo@example.com 電話03-1234-5678 本規約は、利用料金・消費税・支払方法・インボイス（適格請求書）・返金等の取扱いを定めるものです。表示価格はすべて消費税込みの総額表示です。 1. 料金体系 1.1 基本料金 利用料金は、スペースごとに設定された時間単価に利用時間を乗じて算出します。 料金表示は、原則として消費税込みの総額表示（税込価格）を採用します。 1.2 オプション料金 以下のオプションをご利用の場合、別途料金が発生します。 利用時間の延長 追加備品のレンタル 清掃オプション・特別清掃 スペースごとに定めるその他のオプション 2. 消費税 表示価格は、消費税率 10%（標準税率）の税込価格です。 軽減税率（8%）の対象となる取引は当サービスにはありません。 消費税率の改定があった場合、改定日以降の取引には新税率が適用されます。 3. 適格請求書（インボイス） 当社は適格請求書発行事業者です。登録番号：【インボイス登録番号を入力してください（T+13桁）】 マイページから適格請求書の要件を満たした領収書を PDF でダウンロードいただけます。 当社は、適格請求書等保存方式（インボイス制度、令和 5 年 10 月 1 日施行）に基づく適格請求書発行事業者です。 適格請求書発行事業者登録番号：【インボイス登録番号を入力してください（T+13桁）】 領収書・請求書は、適格請求書の記載要件（登録番号、適用税率、税率ごとに区分した消費税額等）を満たした形式で発行します。 マイページより PDF 形式で領収書をダウンロードいただけます。宛名・但書の変更が必要な場合は、お問い合わせください。 4. 支払方法 以下の支払方法をご利用いただけます。 クレジットカード決済（VISA / Mastercard / JCB / American Express / Diners Club） 銀行振込（前払い・振込手数料お客様負担） 5. 決済代行会社（Stripe） クレジットカード決済は、Stripe, Inc.（アメリカ合衆国）の提供する決済サービス「Stripe」を通じて処理されます。 Stripe は PCI DSS（Payment Card Industry Data Security Standard）Level 1 に準拠した決済基盤を提供しており、クレジットカード情報は Stripe のサーバー上で直接取得・管理されます。当社のサーバーにはクレジットカード情報は保存されません。 Stripe の利用規約およびプライバシーポリシーについては、https://stripe.com/jp/legal をご確認ください。 6. 支払時期 6.1 クレジットカード決済 予約確定時に決済が実行されます。決済が成立しない場合、予約は成立しません。 6.2 銀行振込 予約確定後、当社が指定する期限（原則 3 営業日以内かつご利用開始日前）までにお振込みください。 振込手数料はお客様のご負担となります。 当社の入金確認をもって予約完了となります。 期限までに入金が確認できない場合、予約は自動的にキャンセルされます。 銀行振込をご利用の場合は、当社指定の期限（原則 3 営業日以内かつご利用開始日前）までにお振込みください。期限までにご入金が確認できない場合、予約は自動的にキャンセルされます。 7. 追加料金 以下の場合、後日追加料金を請求させていただきます。 利用時間の超過 通常の清掃で除去できない汚損・臭気の付着 設備・備品の破損・紛失 追加備品の使用・オプションサービスの事後利用 8. 法人のお客様への請求書払い 法人のお客様については、事前審査のうえ請求書払い（後払い）をご利用いただける場合があります。詳細はお問い合わせください。 請求書払いの場合、請求書発行日から当月末締め・翌月末払いを原則とします。 支払遅延が発生した場合、遅延期間に応じて、民法所定の法定利率（民法第 404 条。3 年ごとに見直される変動制で、本規約改定時点では年 3.0%）による遅延損害金を申し受けます。 9. 源泉徴収 ご利用料金のうち、法令により源泉徴収の対象となる取引については、所定の手続きに従って対応します。対象取引の有無については、事前にお問い合わせください。 10. 返金 返金が発生する場合の取扱いは、「キャンセルポリシー」に従います。決済代行手数料・振込手数料等は返金対象外とする場合があります。 11. 決済通貨 本サービスの決済通貨は日本円（JPY）のみとします。海外発行のクレジットカードをご利用の場合、カード会社が為替レート・海外取引手数料を適用することがあります。 12. 不正利用時の対応 当社は、不正な決済の疑いがあると合理的に判断した場合、事前の通知なく予約の取消し、利用停止その他の措置を講じることができます。 クレジットカードの不正利用の可能性を発見された場合、速やかにカード発行会社および当社へご連絡ください。 13. 料金の改定 当社は、経済状況の変化、仕入価格の変動等により、料金を改定することがあります。改定後の料金は、改定日以降の新規予約に適用されます。改定前に成立した予約には影響しません。 14. お問い合わせ お支払いに関するお問い合わせは、次の連絡先までお願いいたします。 メール：info@example.com 電話：03-1234-5678", "type": "text", "style": "", "detail": 0, "format": 0, "version": 1}], "direction": "ltr", "textStyle": "", "textFormat": 0}], "direction": "ltr"}}', '<p>最終更新日：2026年6月26日</p>

<h2>事業者情報</h2>
<table>
<tbody>
<tr><th>事業者名</th><td>株式会社サンプル</td></tr>
<tr><th>代表者</th><td>山田 太郎</td></tr>
<tr><th>所在地</th><td>〒150-0001 東京都 渋谷区 神宮前1-1-1 サンプルビル</td></tr>
<tr><th>メール</th><td>info@example.com</td></tr>
<tr><th>電話</th><td>03-1234-5678</td></tr>
</tbody>
</table>

<div data-callout-type="info"><p>本規約は、利用料金・消費税・支払方法・インボイス（適格請求書）・返金等の取扱いを定めるものです。表示価格はすべて消費税込みの総額表示です。</p></div>

<h2>1. 料金体系</h2>
<h3>1.1 基本料金</h3>
<ul>
<li>利用料金は、スペースごとに設定された時間単価に利用時間を乗じて算出します。</li>
<li>料金表示は、原則として消費税込みの総額表示（税込価格）を採用します。</li>
</ul>

<h3>1.2 オプション料金</h3>
<p>以下のオプションをご利用の場合、別途料金が発生します。</p>
<ul>
<li>利用時間の延長</li>
<li>追加備品のレンタル</li>
<li>清掃オプション・特別清掃</li>
<li>スペースごとに定めるその他のオプション</li>
</ul>

<h2>2. 消費税</h2>
<ol>
<li>表示価格は、消費税率 10%（標準税率）の税込価格です。</li>
<li>軽減税率（8%）の対象となる取引は当サービスにはありません。</li>
<li>消費税率の改定があった場合、改定日以降の取引には新税率が適用されます。</li>
</ol>

<h2>3. 適格請求書（インボイス）</h2>
<div data-callout-type="info"><p>当社は適格請求書発行事業者です。登録番号：<strong>【インボイス登録番号を入力してください（T+13桁）】</strong><br>マイページから適格請求書の要件を満たした領収書を PDF でダウンロードいただけます。</p></div>
<ol>
<li>当社は、適格請求書等保存方式（インボイス制度、令和 5 年 10 月 1 日施行）に基づく適格請求書発行事業者です。</li>
<li>適格請求書発行事業者登録番号：【インボイス登録番号を入力してください（T+13桁）】</li>
<li>領収書・請求書は、適格請求書の記載要件（登録番号、適用税率、税率ごとに区分した消費税額等）を満たした形式で発行します。</li>
<li>マイページより PDF 形式で領収書をダウンロードいただけます。宛名・但書の変更が必要な場合は、お問い合わせください。</li>
</ol>

<hr>

<h2>4. 支払方法</h2>
<p>以下の支払方法をご利用いただけます。</p>
<ul>
<li><strong>クレジットカード決済</strong>（VISA / Mastercard / JCB / American Express / Diners Club）</li>
<li><strong>銀行振込</strong>（前払い・振込手数料お客様負担）</li>
</ul>

<h2>5. 決済代行会社（Stripe）</h2>
<ol>
<li>クレジットカード決済は、Stripe, Inc.（アメリカ合衆国）の提供する決済サービス「Stripe」を通じて処理されます。</li>
<li>Stripe は PCI DSS（Payment Card Industry Data Security Standard）Level 1 に準拠した決済基盤を提供しており、クレジットカード情報は Stripe のサーバー上で直接取得・管理されます。当社のサーバーにはクレジットカード情報は保存されません。</li>
<li>Stripe の利用規約およびプライバシーポリシーについては、https://stripe.com/jp/legal をご確認ください。</li>
</ol>

<h2>6. 支払時期</h2>
<h3>6.1 クレジットカード決済</h3>
<p>予約確定時に決済が実行されます。決済が成立しない場合、予約は成立しません。</p>

<h3>6.2 銀行振込</h3>
<ul>
<li>予約確定後、当社が指定する期限（原則 3 営業日以内かつご利用開始日前）までにお振込みください。</li>
<li>振込手数料はお客様のご負担となります。</li>
<li>当社の入金確認をもって予約完了となります。</li>
<li>期限までに入金が確認できない場合、予約は自動的にキャンセルされます。</li>
</ul>

<div data-callout-type="warning"><p><strong>銀行振込をご利用の場合は、当社指定の期限（原則 3 営業日以内かつご利用開始日前）までにお振込みください。</strong>期限までにご入金が確認できない場合、予約は自動的にキャンセルされます。</p></div>

<h2>7. 追加料金</h2>
<p>以下の場合、後日追加料金を請求させていただきます。</p>
<ul>
<li>利用時間の超過</li>
<li>通常の清掃で除去できない汚損・臭気の付着</li>
<li>設備・備品の破損・紛失</li>
<li>追加備品の使用・オプションサービスの事後利用</li>
</ul>

<h2>8. 法人のお客様への請求書払い</h2>
<ol>
<li>法人のお客様については、事前審査のうえ請求書払い（後払い）をご利用いただける場合があります。詳細はお問い合わせください。</li>
<li>請求書払いの場合、請求書発行日から当月末締め・翌月末払いを原則とします。</li>
<li>支払遅延が発生した場合、遅延期間に応じて、民法所定の法定利率（民法第 404 条。3 年ごとに見直される変動制で、本規約改定時点では年 3.0%）による遅延損害金を申し受けます。</li>
</ol>

<h2>9. 源泉徴収</h2>
<p>ご利用料金のうち、法令により源泉徴収の対象となる取引については、所定の手続きに従って対応します。対象取引の有無については、事前にお問い合わせください。</p>

<h2>10. 返金</h2>
<p>返金が発生する場合の取扱いは、「キャンセルポリシー」に従います。決済代行手数料・振込手数料等は返金対象外とする場合があります。</p>

<h2>11. 決済通貨</h2>
<p>本サービスの決済通貨は日本円（JPY）のみとします。海外発行のクレジットカードをご利用の場合、カード会社が為替レート・海外取引手数料を適用することがあります。</p>

<hr>

<h2>12. 不正利用時の対応</h2>
<ol>
<li>当社は、不正な決済の疑いがあると合理的に判断した場合、事前の通知なく予約の取消し、利用停止その他の措置を講じることができます。</li>
<li>クレジットカードの不正利用の可能性を発見された場合、速やかにカード発行会社および当社へご連絡ください。</li>
</ol>

<h2>13. 料金の改定</h2>
<p>当社は、経済状況の変化、仕入価格の変動等により、料金を改定することがあります。改定後の料金は、改定日以降の新規予約に適用されます。改定前に成立した予約には影響しません。</p>

<h2>14. お問い合わせ</h2>
<p>お支払いに関するお問い合わせは、次の連絡先までお願いいたします。<br>
メール：info@example.com<br>
電話：03-1234-5678</p>', true, '2026-06-26 11:20:55.379', true, 4, '2026-06-26 11:20:55.381', '2026-06-26 11:20:55.381', NULL, NULL, '{}') ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.terms_documents (id, type, slug, title, "contentJson", "contentHtml", "isPublished", "publishedAt", "showInFooter", "footerOrder", "createdAt", "updatedAt", "deletedAt", changelog, scopes) VALUES ('d1454cc9-724a-4ec7-8625-d0eea4dce90c', 'rental-terms', 'rental-terms', '施設利用規約', '{"root": {"type": "root", "format": "", "indent": 0, "version": 1, "children": [{"type": "paragraph", "format": "", "indent": 0, "version": 1, "children": [{"mode": "normal", "text": "最終更新日：2026年6月26日 事業者情報 事業者名株式会社サンプル 代表者山田 太郎 所在地〒150-0001 東京都 渋谷区 神宮前1-1-1 サンプルビル メールinfo@example.com 電話03-1234-5678 安全で快適な利用環境を維持するため、すべてのご利用者に本規約の遵守をお願いしています。特に 第 9 条（喫煙）・第 10 条（宿泊の禁止）・第 20 条（原状回復）・第 21 条（緊急時の対応） をご確認ください。 1. 目的 本規約は、株式会社サンプル（以下「当社」といいます）が運営するレンタルスペースの利用にあたって、ご利用者に遵守いただくべきルールを定めるものです。安全で快適な利用環境を維持するため、すべてのご利用者にご協力をお願いいたします。 2. 入退室手続き 入室は、予約開始時刻以降に行ってください。予約開始時刻より前の入室は原則としてお断りします。 入室方法（スマートロック解錠コード・鍵の受渡し等）は、予約確認メールまたはマイページにてご案内します。 退室は、予約終了時刻までに完了してください。 解錠コード・鍵は、第三者に譲渡・共有しないでください。 3. 利用時間 ご利用時間は予約時間内に限ります。入室から退室までをご利用時間とします。 延長をご希望の場合は、後続の予約状況により対応可否が異なります。原則としてマイページから延長予約をお取りください。 予約時間を超過して利用された場合、延長料金を事後請求することがあります。 4. 定員 各スペースに定められた最大収容人数を超えてのご利用はできません。 予約時の申告人数と実際の利用人数が大きく異なる場合、追加料金を請求することがあります。 定員超過が発覚した場合、当社は利用の中止を求めることができます。 5. 設備・備品 設備・備品は、善良な管理者の注意をもって取り扱ってください。 設備の故障・不具合を発見された場合は、速やかにスタッフまでご連絡ください。 備品の持ち出しはご遠慮ください。 利用者が持ち込んだ私物の盗難・紛失について、当社は責任を負いません。 6. Wi-Fi の利用 Wi-Fi は、本サービスの利用目的の範囲内でのみご利用いただけます。 法令に違反する行為、他者の権利を侵害する行為、当該回線の運営を妨害する行為に Wi-Fi を利用することを禁止します。 通信品質は保証しません。通信障害による損害について、当社は責任を負いません。 7. 飲食・調理 飲食の可否は、各スペースの詳細ページに記載します。記載がない場合、原則として飲食可能です。 調理器具（電子レンジ、IH クッキングヒーター等）の提供有無は、各スペースの詳細ページをご確認ください。 提供されていない調理器具（カセットコンロ、バーナー等）の持ち込みはご遠慮ください。 8. 飲酒 飲酒の可否は、各スペースの詳細ページに記載します。許可されている場合も、過度な飲酒、泥酔、他の利用者への迷惑となる行為はお控えください。 9. 喫煙 スペース内は全面禁煙です。紙巻たばこ・加熱式たばこ・電子たばこ・水たばこを含むすべての喫煙を禁止します。喫煙は当社が指定した喫煙場所に限ります。 スペース内は、紙巻たばこ、加熱式たばこ、電子たばこ、水たばこを含むすべての喫煙を禁止します。 健康増進法および当社の方針に基づき、施設内および敷地内の喫煙は、当社が指定した喫煙場所に限ります。 10. 宿泊の禁止 本サービスは時間貸しのレンタルスペースであり、宿泊施設ではありません。宿泊・深夜から翌朝にかけての連続利用・仮眠以外の就寝を伴う利用は禁止します。発覚した場合は利用を中止いただき、所定の違約金を申し受けることがあります。 本サービスは時間貸しのレンタルスペースサービスであり、旅館業法上の宿泊施設ではありません。 宿泊目的での利用、深夜から翌朝にかけての連続宿泊、仮眠以外の就寝を伴う利用を禁止します。 宿泊行為が発覚した場合、当社は直ちに利用を中止させ、所定の違約金を請求することがあります。 11. 営業活動・勧誘の禁止 スペース内において、以下の行為を禁止します。 マルチ商法・連鎖販売取引の勧誘 特定商取引法に違反する販売行為 宗教、政治、思想に関する無許可の勧誘活動 反社会的勢力に関係する活動 その他、他の利用者・近隣に迷惑となる営業・勧誘活動 12. 撮影・SNS 投稿 個人利用のための撮影は可能です。 商業目的での撮影（広告・商用写真・映画・ミュージックビデオ等）は、事前に当社の書面による承諾を要します。 SNS への投稿にあたっては、他の利用者のプライバシーに配慮してください。 当社の許可なく、スペース内で他の利用者を撮影・録画することを禁止します。 13. 騒音対策 大声での会話、音楽の大音量再生、楽器の演奏その他近隣に迷惑となる行為はお控えください。 夜間（22 時〜翌 7 時）は、特に静粛にご利用ください。 苦情が発生した場合、当社はスペース利用の中止を求めることがあります。 14. ペット・動物 ペットその他の動物の持ち込みは原則として禁止します。ただし、身体障害者補助犬法に基づく補助犬（盲導犬・介助犬・聴導犬）はこの限りではありません。 15. 危険物・火気 以下の持ち込み・使用を禁止します。 爆発物、引火性の高い物質、有毒物質 花火、ろうそく、香炉等の裸火（スペースにより許可される場合は、当社の定める方法に従ってください） 銃器・刀剣・危険な工具類 その他、当社が危険と判断するもの 16. 駐車場 駐車場の有無、利用方法、料金は、各スペースの詳細ページに記載します。駐車場が無いスペースについては、近隣のコインパーキング等をご利用ください。路上駐車・私有地への無断駐車は厳禁です。 17. ゴミの処理 ゴミは、各スペースで定めるルールに従って分別・処理してください。 大量のゴミが発生する利用（イベント・撮影等）の場合、ゴミはお持ち帰りいただくか、当社指定の処理費用をお支払いいただきます。 18. 忘れ物 忘れ物を発見した場合、当社は 30 日間保管します。保管期間を経過した忘れ物は、所有権放棄とみなし、当社にて処分します。 貴重品・個人情報を含む物品については、ご本人確認のうえ返却します。 返送をご希望の場合、送料は着払いといたします。 19. 監視カメラ 防犯および事故防止のため、スペースの共用部（エントランス・廊下等）に監視カメラを設置する場合があります。録画された映像は、防犯・事故調査・警察等からの要請対応の目的に限り利用し、通常の個人情報と同等の安全管理措置を講じます。詳細はプライバシーポリシーに従います。 20. 原状回復 ご利用終了時は、次のとおり原状回復をお願いいたします。 テーブル・椅子等の備品を原状の位置に戻す ゴミの分別・指定場所への廃棄 使用した備品の返却・再収納 照明・空調・電子機器の電源オフ 持ち込み物の撤去 21. 緊急時の対応 生命・身体に関わる緊急事態（火災・急病・事故等）の場合は、ためらわず 119 番・110 番へ通報してください。そのうえで当社の緊急連絡先までご連絡ください。避難経路・消火器・AED の位置は各スペースの案内板でご確認ください。 火災・地震・設備の重大な故障・事故・体調不良その他の緊急事態が発生した場合、直ちに所定の緊急連絡先までご連絡ください。 避難経路、消火器、AED の位置は、各スペースの案内板でご確認ください。 生命・身体に関わる緊急事態の場合は、119 番または 110 番への連絡を最優先してください。 22. 転貸・譲渡の禁止 予約の第三者への転売・譲渡・貸与を禁止します。 申込者と実際の利用者が異なる場合、事前に当社へご連絡ください。 23. 損害賠償 利用者が故意または過失により当社または第三者の設備・備品を破損・汚損・紛失させた場合、その修繕費用または再調達費用の全額を賠償していただきます。 通常の利用の範囲を超える清掃が必要となった場合、特別清掃料金を請求します。 24. 免責事項 利用者の私物の盗難・紛失について、当社は責任を負いません。 天災、停電、通信障害その他の不可抗力による利用中断について、当社は責任を負いません。 利用者間または利用者と第三者との間で発生したトラブル（騒音、器物破損、傷害等）について、当社は責任を負いません。 25. お問い合わせ 施設利用に関するお問い合わせは、次の連絡先までお願いいたします。 メール：info@example.com 電話：03-1234-5678", "type": "text", "style": "", "detail": 0, "format": 0, "version": 1}], "direction": "ltr", "textStyle": "", "textFormat": 0}], "direction": "ltr"}}', '<p>最終更新日：2026年6月26日</p>

<h2>事業者情報</h2>
<table>
<tbody>
<tr><th>事業者名</th><td>株式会社サンプル</td></tr>
<tr><th>代表者</th><td>山田 太郎</td></tr>
<tr><th>所在地</th><td>〒150-0001 東京都 渋谷区 神宮前1-1-1 サンプルビル</td></tr>
<tr><th>メール</th><td>info@example.com</td></tr>
<tr><th>電話</th><td>03-1234-5678</td></tr>
</tbody>
</table>

<div data-callout-type="info"><p>安全で快適な利用環境を維持するため、すべてのご利用者に本規約の遵守をお願いしています。特に <strong>第 9 条（喫煙）</strong>・<strong>第 10 条（宿泊の禁止）</strong>・<strong>第 20 条（原状回復）</strong>・<strong>第 21 条（緊急時の対応）</strong> をご確認ください。</p></div>

<h2>1. 目的</h2>
<p>本規約は、株式会社サンプル（以下「当社」といいます）が運営するレンタルスペースの利用にあたって、ご利用者に遵守いただくべきルールを定めるものです。安全で快適な利用環境を維持するため、すべてのご利用者にご協力をお願いいたします。</p>

<h2>2. 入退室手続き</h2>
<ol>
<li>入室は、予約開始時刻以降に行ってください。予約開始時刻より前の入室は原則としてお断りします。</li>
<li>入室方法（スマートロック解錠コード・鍵の受渡し等）は、予約確認メールまたはマイページにてご案内します。</li>
<li>退室は、予約終了時刻までに完了してください。</li>
<li>解錠コード・鍵は、第三者に譲渡・共有しないでください。</li>
</ol>

<h2>3. 利用時間</h2>
<ol>
<li>ご利用時間は予約時間内に限ります。入室から退室までをご利用時間とします。</li>
<li>延長をご希望の場合は、後続の予約状況により対応可否が異なります。原則としてマイページから延長予約をお取りください。</li>
<li>予約時間を超過して利用された場合、延長料金を事後請求することがあります。</li>
</ol>

<h2>4. 定員</h2>
<ol>
<li>各スペースに定められた最大収容人数を超えてのご利用はできません。</li>
<li>予約時の申告人数と実際の利用人数が大きく異なる場合、追加料金を請求することがあります。</li>
<li>定員超過が発覚した場合、当社は利用の中止を求めることができます。</li>
</ol>

<h2>5. 設備・備品</h2>
<ol>
<li>設備・備品は、善良な管理者の注意をもって取り扱ってください。</li>
<li>設備の故障・不具合を発見された場合は、速やかにスタッフまでご連絡ください。</li>
<li>備品の持ち出しはご遠慮ください。</li>
<li>利用者が持ち込んだ私物の盗難・紛失について、当社は責任を負いません。</li>
</ol>

<h2>6. Wi-Fi の利用</h2>
<ol>
<li>Wi-Fi は、本サービスの利用目的の範囲内でのみご利用いただけます。</li>
<li>法令に違反する行為、他者の権利を侵害する行為、当該回線の運営を妨害する行為に Wi-Fi を利用することを禁止します。</li>
<li>通信品質は保証しません。通信障害による損害について、当社は責任を負いません。</li>
</ol>

<hr>

<h2>7. 飲食・調理</h2>
<ol>
<li>飲食の可否は、各スペースの詳細ページに記載します。記載がない場合、原則として飲食可能です。</li>
<li>調理器具（電子レンジ、IH クッキングヒーター等）の提供有無は、各スペースの詳細ページをご確認ください。</li>
<li>提供されていない調理器具（カセットコンロ、バーナー等）の持ち込みはご遠慮ください。</li>
</ol>

<h2>8. 飲酒</h2>
<p>飲酒の可否は、各スペースの詳細ページに記載します。許可されている場合も、過度な飲酒、泥酔、他の利用者への迷惑となる行為はお控えください。</p>

<h2>9. 喫煙</h2>
<div data-callout-type="warning"><p><strong>スペース内は全面禁煙です。</strong>紙巻たばこ・加熱式たばこ・電子たばこ・水たばこを含むすべての喫煙を禁止します。喫煙は当社が指定した喫煙場所に限ります。</p></div>
<ol>
<li>スペース内は、紙巻たばこ、加熱式たばこ、電子たばこ、水たばこを含むすべての喫煙を禁止します。</li>
<li>健康増進法および当社の方針に基づき、施設内および敷地内の喫煙は、当社が指定した喫煙場所に限ります。</li>
</ol>

<h2>10. 宿泊の禁止</h2>
<div data-callout-type="warning"><p><strong>本サービスは時間貸しのレンタルスペースであり、宿泊施設ではありません。</strong>宿泊・深夜から翌朝にかけての連続利用・仮眠以外の就寝を伴う利用は禁止します。発覚した場合は利用を中止いただき、所定の違約金を申し受けることがあります。</p></div>
<ol>
<li>本サービスは時間貸しのレンタルスペースサービスであり、旅館業法上の宿泊施設ではありません。</li>
<li>宿泊目的での利用、深夜から翌朝にかけての連続宿泊、仮眠以外の就寝を伴う利用を禁止します。</li>
<li>宿泊行為が発覚した場合、当社は直ちに利用を中止させ、所定の違約金を請求することがあります。</li>
</ol>

<h2>11. 営業活動・勧誘の禁止</h2>
<p>スペース内において、以下の行為を禁止します。</p>
<ul>
<li>マルチ商法・連鎖販売取引の勧誘</li>
<li>特定商取引法に違反する販売行為</li>
<li>宗教、政治、思想に関する無許可の勧誘活動</li>
<li>反社会的勢力に関係する活動</li>
<li>その他、他の利用者・近隣に迷惑となる営業・勧誘活動</li>
</ul>

<h2>12. 撮影・SNS 投稿</h2>
<ol>
<li>個人利用のための撮影は可能です。</li>
<li>商業目的での撮影（広告・商用写真・映画・ミュージックビデオ等）は、事前に当社の書面による承諾を要します。</li>
<li>SNS への投稿にあたっては、他の利用者のプライバシーに配慮してください。</li>
<li>当社の許可なく、スペース内で他の利用者を撮影・録画することを禁止します。</li>
</ol>

<h2>13. 騒音対策</h2>
<ol>
<li>大声での会話、音楽の大音量再生、楽器の演奏その他近隣に迷惑となる行為はお控えください。</li>
<li>夜間（22 時〜翌 7 時）は、特に静粛にご利用ください。</li>
<li>苦情が発生した場合、当社はスペース利用の中止を求めることがあります。</li>
</ol>

<h2>14. ペット・動物</h2>
<p>ペットその他の動物の持ち込みは原則として禁止します。ただし、身体障害者補助犬法に基づく補助犬（盲導犬・介助犬・聴導犬）はこの限りではありません。</p>

<h2>15. 危険物・火気</h2>
<p>以下の持ち込み・使用を禁止します。</p>
<ul>
<li>爆発物、引火性の高い物質、有毒物質</li>
<li>花火、ろうそく、香炉等の裸火（スペースにより許可される場合は、当社の定める方法に従ってください）</li>
<li>銃器・刀剣・危険な工具類</li>
<li>その他、当社が危険と判断するもの</li>
</ul>

<h2>16. 駐車場</h2>
<p>駐車場の有無、利用方法、料金は、各スペースの詳細ページに記載します。駐車場が無いスペースについては、近隣のコインパーキング等をご利用ください。路上駐車・私有地への無断駐車は厳禁です。</p>

<h2>17. ゴミの処理</h2>
<ol>
<li>ゴミは、各スペースで定めるルールに従って分別・処理してください。</li>
<li>大量のゴミが発生する利用（イベント・撮影等）の場合、ゴミはお持ち帰りいただくか、当社指定の処理費用をお支払いいただきます。</li>
</ol>

<h2>18. 忘れ物</h2>
<ol>
<li>忘れ物を発見した場合、当社は 30 日間保管します。保管期間を経過した忘れ物は、所有権放棄とみなし、当社にて処分します。</li>
<li>貴重品・個人情報を含む物品については、ご本人確認のうえ返却します。</li>
<li>返送をご希望の場合、送料は着払いといたします。</li>
</ol>

<h2>19. 監視カメラ</h2>
<p>防犯および事故防止のため、スペースの共用部（エントランス・廊下等）に監視カメラを設置する場合があります。録画された映像は、防犯・事故調査・警察等からの要請対応の目的に限り利用し、通常の個人情報と同等の安全管理措置を講じます。詳細はプライバシーポリシーに従います。</p>

<hr>

<h2>20. 原状回復</h2>
<p>ご利用終了時は、次のとおり原状回復をお願いいたします。</p>
<ul>
<li>テーブル・椅子等の備品を原状の位置に戻す</li>
<li>ゴミの分別・指定場所への廃棄</li>
<li>使用した備品の返却・再収納</li>
<li>照明・空調・電子機器の電源オフ</li>
<li>持ち込み物の撤去</li>
</ul>

<h2>21. 緊急時の対応</h2>
<div data-callout-type="error"><p><strong>生命・身体に関わる緊急事態（火災・急病・事故等）の場合は、ためらわず 119 番・110 番へ通報してください。</strong>そのうえで当社の緊急連絡先までご連絡ください。避難経路・消火器・AED の位置は各スペースの案内板でご確認ください。</p></div>
<ol>
<li>火災・地震・設備の重大な故障・事故・体調不良その他の緊急事態が発生した場合、直ちに所定の緊急連絡先までご連絡ください。</li>
<li>避難経路、消火器、AED の位置は、各スペースの案内板でご確認ください。</li>
<li>生命・身体に関わる緊急事態の場合は、119 番または 110 番への連絡を最優先してください。</li>
</ol>

<h2>22. 転貸・譲渡の禁止</h2>
<ol>
<li>予約の第三者への転売・譲渡・貸与を禁止します。</li>
<li>申込者と実際の利用者が異なる場合、事前に当社へご連絡ください。</li>
</ol>

<h2>23. 損害賠償</h2>
<ol>
<li>利用者が故意または過失により当社または第三者の設備・備品を破損・汚損・紛失させた場合、その修繕費用または再調達費用の全額を賠償していただきます。</li>
<li>通常の利用の範囲を超える清掃が必要となった場合、特別清掃料金を請求します。</li>
</ol>

<h2>24. 免責事項</h2>
<ol>
<li>利用者の私物の盗難・紛失について、当社は責任を負いません。</li>
<li>天災、停電、通信障害その他の不可抗力による利用中断について、当社は責任を負いません。</li>
<li>利用者間または利用者と第三者との間で発生したトラブル（騒音、器物破損、傷害等）について、当社は責任を負いません。</li>
</ol>

<h2>25. お問い合わせ</h2>
<p>施設利用に関するお問い合わせは、次の連絡先までお願いいたします。<br>
メール：info@example.com<br>
電話：03-1234-5678</p>', true, '2026-06-26 11:20:55.427', true, 5, '2026-06-26 11:20:55.427', '2026-06-26 11:20:55.427', NULL, NULL, '{}') ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.terms_documents (id, type, slug, title, "contentJson", "contentHtml", "isPublished", "publishedAt", "showInFooter", "footerOrder", "createdAt", "updatedAt", "deletedAt", changelog, scopes) VALUES ('e0de0ee9-7dae-4dc4-a897-cd455a692ddb', 'review-guidelines', 'review-guidelines', 'レビュー投稿ガイドライン', '{"root": {"type": "root", "format": "", "indent": 0, "version": 1, "children": [{"type": "paragraph", "format": "", "indent": 0, "version": 1, "children": [{"mode": "normal", "text": "最終更新日：2026年6月26日 事業者情報 事業者名株式会社サンプル 代表者山田 太郎 所在地〒150-0001 東京都 渋谷区 神宮前1-1-1 サンプルビル メールinfo@example.com 電話03-1234-5678 レビューは、他の利用者の予約判断を支援し、サービス品質の向上に役立てるために運営しています。実際にご利用いただいた体験に基づく、建設的なご投稿をお願いいたします。 1. 本ガイドラインの目的 本ガイドラインは、株式会社サンプル（以下「当社」といいます）が運営するレンタルスペース予約サービスにおいて、利用者による施設レビュー投稿（以下「レビュー」といいます）の基準およびモデレーション方針を定めるものです。レビューは、他の利用者の予約判断を支援し、サービス品質の継続的改善を目的として運営されます。 2. 投稿資格 レビューを投稿できるのは、当社のレンタルスペースを実際にご利用いただいた利用者に限ります。 1 件の予約につき 1 件のレビュー投稿を基本とします。 レビュー投稿は、ご利用完了後の所定の期間内に限り受け付けます。 3. 投稿内容の基準 次の基準を満たす投稿を歓迎します。 ご自身のご利用体験に基づく、具体的かつ客観的な内容 他の利用者にとって参考となる、建設的なフィードバック 施設・設備・サービスに関する事実に基づいた記述 4. 投稿禁止事項 金銭やサービスの提供を受けた対価としての投稿（ステルスマーケティング）は、景品表示法に基づき禁止されています。また、誹謗中傷・個人情報の記載・実際に利用していない施設へのレビューも禁止です。違反するレビューは予告なく削除・非表示とすることがあります。 以下の内容を含むレビューの投稿を禁止します。該当するレビューは、事前の通知なく削除または非表示にすることがあります。 事実に反する内容、誤解を招く誇張表現 特定の個人・団体に対する誹謗中傷、侮辱、差別的表現 脅迫・暴言・ハラスメントに該当する表現 個人情報（氏名、住所、電話番号、メールアドレス等）の記載 第三者の著作権、商標権、プライバシー権その他の権利を侵害する内容 わいせつ・暴力的・反社会的な内容 営業・宣伝・勧誘、外部サイトへの誘導リンク 実際にご利用いただいていない施設に関するレビュー 金銭・サービスの提供を受けた対価として投稿されたレビュー（ステルスマーケティング） 同一人物による重複投稿、複数アカウントによる組織的投稿 施設内で発生したトラブルで、当社への直接のお問い合わせを経ていない一方的な告発 他の法令違反または公序良俗に反する内容 5. 評価基準（星評価） レビュー投稿時の星評価は、ご自身の体験に基づき、以下の目安を参考に投稿してください。 評価目安 ★★★★★（5）期待を上回る優れた体験だった ★★★★☆（4）期待通り、または期待以上で満足できた ★★★☆☆（3）期待通りで普通 ★★☆☆☆（2）期待を下回ったが、利用自体は可能だった ★☆☆☆☆（1）期待を大きく下回り、重大な問題があった 6. モデレーション方針 投稿されたレビューは、当社の基準に基づく確認を経て公開されます。 本ガイドラインに違反する内容が含まれると当社が合理的に判断した場合、事前の通知なく当該レビューを非公開、編集、または削除することがあります。 当社は、レビューの真実性・客観性・有用性を保証するものではありません。 当社は、本ガイドラインの趣旨に照らし、公序良俗に反しない範囲で、投稿内容をそのまま掲載することを原則とします。編集は誤字修正・個人情報の削除等、軽微な範囲に限ります。 7. 投稿内容の利用許諾 利用者は、投稿したレビューについて、当社に対し、無償、地域の制限なく、複製・公衆送信・翻訳・翻案その他の方法により利用することを許諾します。 利用者は、レビューの掲載・編集・要約等にあたり、当社および当社が指定する第三者に対して著作者人格権（公表権・氏名表示権・同一性保持権）を行使しないものとします。 当社は、プライバシー保護のため、利用者の氏名を全表示せず、イニシャル・ニックネーム等の表示形式で掲載する場合があります。 8. 投稿の削除請求 利用者は、自己が投稿したレビューについて、マイページより削除することができます。 第三者の権利を侵害するレビューについて削除を希望される場合は、第 11 条記載の連絡先までご連絡ください。合理的な期間内に確認のうえ、対応いたします。 9. 事業者による返信 当社は、投稿されたレビューに対して返信することがあります。 返信は、事実関係の補足説明、お詫び、今後の改善方針の共有等を目的とし、誠実かつ礼節を持って行います。 利用者の個人情報を含む形での返信は行いません。 10. 不適切な利用への対応 本ガイドラインに繰り返し違反した利用者に対し、当社はレビュー投稿権限の停止、会員資格の抹消その他必要な措置を講じることがあります。 11. お問い合わせ レビュー投稿に関するお問い合わせ、および第三者からの権利侵害に関する削除依頼は、次の連絡先までお願いいたします。 メール：info@example.com 電話：03-1234-5678 12. 本ガイドラインの変更 当社は、必要に応じて本ガイドラインを変更することがあります。変更後の内容は、本サービス上での掲示その他の適切な方法により周知し、効力発生時期以降に投稿されたレビューに適用されます。", "type": "text", "style": "", "detail": 0, "format": 0, "version": 1}], "direction": "ltr", "textStyle": "", "textFormat": 0}], "direction": "ltr"}}', '<p>最終更新日：2026年6月26日</p>

<h2>事業者情報</h2>
<table>
<tbody>
<tr><th>事業者名</th><td>株式会社サンプル</td></tr>
<tr><th>代表者</th><td>山田 太郎</td></tr>
<tr><th>所在地</th><td>〒150-0001 東京都 渋谷区 神宮前1-1-1 サンプルビル</td></tr>
<tr><th>メール</th><td>info@example.com</td></tr>
<tr><th>電話</th><td>03-1234-5678</td></tr>
</tbody>
</table>

<div data-callout-type="info"><p>レビューは、他の利用者の予約判断を支援し、サービス品質の向上に役立てるために運営しています。実際にご利用いただいた体験に基づく、建設的なご投稿をお願いいたします。</p></div>

<h2>1. 本ガイドラインの目的</h2>
<p>本ガイドラインは、株式会社サンプル（以下「当社」といいます）が運営するレンタルスペース予約サービスにおいて、利用者による施設レビュー投稿（以下「レビュー」といいます）の基準およびモデレーション方針を定めるものです。レビューは、他の利用者の予約判断を支援し、サービス品質の継続的改善を目的として運営されます。</p>

<h2>2. 投稿資格</h2>
<ol>
<li>レビューを投稿できるのは、当社のレンタルスペースを実際にご利用いただいた利用者に限ります。</li>
<li>1 件の予約につき 1 件のレビュー投稿を基本とします。</li>
<li>レビュー投稿は、ご利用完了後の所定の期間内に限り受け付けます。</li>
</ol>

<h2>3. 投稿内容の基準</h2>
<p>次の基準を満たす投稿を歓迎します。</p>
<ul>
<li>ご自身のご利用体験に基づく、具体的かつ客観的な内容</li>
<li>他の利用者にとって参考となる、建設的なフィードバック</li>
<li>施設・設備・サービスに関する事実に基づいた記述</li>
</ul>

<h2>4. 投稿禁止事項</h2>
<div data-callout-type="warning"><p>金銭やサービスの提供を受けた対価としての投稿（ステルスマーケティング）は、景品表示法に基づき禁止されています。また、誹謗中傷・個人情報の記載・実際に利用していない施設へのレビューも禁止です。違反するレビューは予告なく削除・非表示とすることがあります。</p></div>
<p>以下の内容を含むレビューの投稿を禁止します。該当するレビューは、事前の通知なく削除または非表示にすることがあります。</p>
<ul>
<li>事実に反する内容、誤解を招く誇張表現</li>
<li>特定の個人・団体に対する誹謗中傷、侮辱、差別的表現</li>
<li>脅迫・暴言・ハラスメントに該当する表現</li>
<li>個人情報（氏名、住所、電話番号、メールアドレス等）の記載</li>
<li>第三者の著作権、商標権、プライバシー権その他の権利を侵害する内容</li>
<li>わいせつ・暴力的・反社会的な内容</li>
<li>営業・宣伝・勧誘、外部サイトへの誘導リンク</li>
<li>実際にご利用いただいていない施設に関するレビュー</li>
<li>金銭・サービスの提供を受けた対価として投稿されたレビュー（ステルスマーケティング）</li>
<li>同一人物による重複投稿、複数アカウントによる組織的投稿</li>
<li>施設内で発生したトラブルで、当社への直接のお問い合わせを経ていない一方的な告発</li>
<li>他の法令違反または公序良俗に反する内容</li>
</ul>

<h2>5. 評価基準（星評価）</h2>
<p>レビュー投稿時の星評価は、ご自身の体験に基づき、以下の目安を参考に投稿してください。</p>
<table>
<thead>
<tr><th>評価</th><th>目安</th></tr>
</thead>
<tbody>
<tr><td>★★★★★（5）</td><td>期待を上回る優れた体験だった</td></tr>
<tr><td>★★★★☆（4）</td><td>期待通り、または期待以上で満足できた</td></tr>
<tr><td>★★★☆☆（3）</td><td>期待通りで普通</td></tr>
<tr><td>★★☆☆☆（2）</td><td>期待を下回ったが、利用自体は可能だった</td></tr>
<tr><td>★☆☆☆☆（1）</td><td>期待を大きく下回り、重大な問題があった</td></tr>
</tbody>
</table>

<hr>

<h2>6. モデレーション方針</h2>
<ol>
<li>投稿されたレビューは、当社の基準に基づく確認を経て公開されます。</li>
<li>本ガイドラインに違反する内容が含まれると当社が合理的に判断した場合、事前の通知なく当該レビューを非公開、編集、または削除することがあります。</li>
<li>当社は、レビューの真実性・客観性・有用性を保証するものではありません。</li>
<li>当社は、本ガイドラインの趣旨に照らし、公序良俗に反しない範囲で、投稿内容をそのまま掲載することを原則とします。編集は誤字修正・個人情報の削除等、軽微な範囲に限ります。</li>
</ol>

<h2>7. 投稿内容の利用許諾</h2>
<ol>
<li>利用者は、投稿したレビューについて、当社に対し、無償、地域の制限なく、複製・公衆送信・翻訳・翻案その他の方法により利用することを許諾します。</li>
<li>利用者は、レビューの掲載・編集・要約等にあたり、当社および当社が指定する第三者に対して著作者人格権（公表権・氏名表示権・同一性保持権）を行使しないものとします。</li>
<li>当社は、プライバシー保護のため、利用者の氏名を全表示せず、イニシャル・ニックネーム等の表示形式で掲載する場合があります。</li>
</ol>

<h2>8. 投稿の削除請求</h2>
<ol>
<li>利用者は、自己が投稿したレビューについて、マイページより削除することができます。</li>
<li>第三者の権利を侵害するレビューについて削除を希望される場合は、第 11 条記載の連絡先までご連絡ください。合理的な期間内に確認のうえ、対応いたします。</li>
</ol>

<h2>9. 事業者による返信</h2>
<ol>
<li>当社は、投稿されたレビューに対して返信することがあります。</li>
<li>返信は、事実関係の補足説明、お詫び、今後の改善方針の共有等を目的とし、誠実かつ礼節を持って行います。</li>
<li>利用者の個人情報を含む形での返信は行いません。</li>
</ol>

<h2>10. 不適切な利用への対応</h2>
<p>本ガイドラインに繰り返し違反した利用者に対し、当社はレビュー投稿権限の停止、会員資格の抹消その他必要な措置を講じることがあります。</p>

<h2>11. お問い合わせ</h2>
<p>レビュー投稿に関するお問い合わせ、および第三者からの権利侵害に関する削除依頼は、次の連絡先までお願いいたします。<br>
メール：info@example.com<br>
電話：03-1234-5678</p>

<h2>12. 本ガイドラインの変更</h2>
<p>当社は、必要に応じて本ガイドラインを変更することがあります。変更後の内容は、本サービス上での掲示その他の適切な方法により周知し、効力発生時期以降に投稿されたレビューに適用されます。</p>', true, '2026-06-26 11:20:55.475', true, 6, '2026-06-26 11:20:55.476', '2026-06-26 11:20:55.476', NULL, NULL, '{}') ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.terms_documents (id, type, slug, title, "contentJson", "contentHtml", "isPublished", "publishedAt", "showInFooter", "footerOrder", "createdAt", "updatedAt", "deletedAt", changelog, scopes) VALUES ('e2e1df5b-adee-4d61-985d-49b0cf6fd4bc', 'cookie-policy', 'cookie-policy', 'Cookie ポリシー', '{"root": {"type": "root", "format": "", "indent": 0, "version": 1, "children": [{"type": "paragraph", "format": "", "indent": 0, "version": 1, "children": [{"mode": "normal", "text": "最終更新日：2026年6月26日 事業者情報 事業者名株式会社サンプル 代表者山田 太郎 所在地〒150-0001 東京都 渋谷区 神宮前1-1-1 サンプルビル メールinfo@example.com 電話03-1234-5678 当サイトは、ログイン状態の維持やアクセス解析等のために Cookie 等を利用しています。本ポリシーでは、利用する Cookie の種類・第三者への外部送信・無効化の方法をご説明します。 1. 本ポリシーの目的 本ポリシーは、株式会社サンプル（以下「当社」といいます）が運営する本サービスにおいて、Cookie および類似技術（Web ビーコン、ローカルストレージ等。以下総称して「Cookie 等」といいます）を利用して取得する情報の種類、利用目的、および利用者による選択の方法について説明するものです。 2. Cookie 等とは Cookie：ウェブサイトを閲覧した際、利用者のブラウザに保存される小さなテキストデータです。次回訪問時に同じウェブサイトが参照することで、ログイン状態の維持や利用環境の記憶等に用いられます。 ローカルストレージ / セッションストレージ：ブラウザに情報を保存する Web 標準の仕組みです。Cookie より多くの情報を保存できます。 Web ビーコン：ページ閲覧やメール開封の有無を検知する小さな画像または HTML 要素です。 3. 当社が利用する Cookie 等の種類 当社は、Cookie 等を目的別に以下のとおり分類して利用しています。 3.1 必須 Cookie（同意不要） 本サービスの基本機能の提供に不可欠なため、無効化すると本サービスが正常に利用できなくなります。 認証 Cookie：ログイン状態の維持（Better Auth が発行） セキュリティ Cookie：CSRF 攻撃対策、セッション保護 負荷分散 Cookie：サーバーへの接続安定化 不正アクセス防止 Cookie：Cloudflare Turnstile による Bot 対策 3.2 機能性 Cookie（同意に基づき利用） 利便性向上のために利用します。 表示設定 Cookie：言語・地域・税込/税抜表示等の保存 フォーム入力補助 Cookie：お問い合わせフォーム等の入力支援 3.3 アクセス解析 Cookie（同意に基づき利用） 本サービスの利用状況の分析、改善に利用します。 Google Analytics：ページ閲覧数、滞在時間、流入経路等の匿名統計情報の取得 3.4 マーケティング Cookie（同意に基づき利用） 現時点で当社はマーケティング目的の Cookie を利用していません。将来的に利用する場合には、事前に本ポリシーで告知し、利用者の同意を取得します。 4. 第三者への情報の外部送信（外部送信規律） 本サービスでは、利用者の端末から第三者の事業者に対し、Cookie 等を通じて情報が自動的に送信される場合があります。電気通信事業法第 27 条の 12（外部送信規律、令和 5 年 6 月 16 日施行）に基づき、送信先の事業者、送信される情報の内容、および送信先における利用目的を以下のとおり公表します。各事業者における情報の取扱いの詳細は、それぞれのプライバシーポリシー・Cookie ポリシーをご確認ください。 送信先事業者送信される情報送信先での利用目的関連ポリシー Google LLC（米国）— Google AnalyticsCookie 識別子、IP アドレス、閲覧ページ URL、リファラー、デバイス・ブラウザ情報アクセス解析・統計レポートの提供https://policies.google.com/technologies/cookies Google LLC（米国）— Google MapsIP アドレス、おおよその位置情報、閲覧ページ情報地図の表示・最適化https://policies.google.com/technologies/cookies Cloudflare, Inc.（米国）— TurnstileIP アドレス、User-Agent、ブラウザ指紋等の Bot 検出用メタデータBot・不正アクセスの検知および防止https://www.cloudflare.com/cookie-policy/ Stripe, Inc.（米国）— 決済Cookie 識別子、IP アドレス、デバイス情報、決済関連の操作情報決済処理および不正決済の検知https://stripe.com/jp/cookies-policy/legal これらの外部送信のうち、必須 Cookie に該当しないもの（アクセス解析等）については、利用者は本ポリシー第 6 条記載の方法により Cookie を無効化することで送信を停止できます。 5. Cookie の保存期間 セッション Cookie：ブラウザを閉じると削除されます。 永続 Cookie：有効期限まで保存されます（通常は数日〜数年）。期限はサービスや目的により異なります。 6. Cookie の管理・無効化 必須 Cookie を無効化すると、ログインや予約等の基本機能がご利用いただけなくなります。アクセス解析等の Cookie のみを無効化することも、ブラウザ設定や下記オプトアウトで可能です。 利用者は、ブラウザの設定により Cookie の受け入れを拒否、制限、削除することができます。 主要ブラウザの設定方法は、以下のリンク先で案内されています。 Google Chrome：https://support.google.com/chrome/answer/95647 Safari：https://support.apple.com/ja-jp/guide/safari/sfri11471/mac Firefox：https://support.mozilla.org/ja/kb/block-websites-storing-cookies-site-data Microsoft Edge：https://support.microsoft.com/ja-jp/microsoft-edge Cookie を無効化した場合、本サービスの一部機能が利用できなくなることがあります。必須 Cookie を無効化した場合、本サービスをご利用いただけません。 7. Google Analytics のオプトアウト Google Analytics によるアクセス解析を望まない場合は、Google が提供するオプトアウトアドオンをインストールすることで拒否できます。 Google Analytics オプトアウトアドオン：https://tools.google.com/dlpage/gaoptout 8. Do Not Track（DNT）シグナルへの対応 当社は、現時点でブラウザの Do Not Track（DNT）シグナルには対応していません。DNT 仕様が世界的に標準化された場合、対応方針を改めて検討します。 9. プライバシーポリシーとの関係 本ポリシーは、当社のプライバシーポリシーの一部を構成します。Cookie 等によって取得された情報を含む個人情報の取扱い全般については、プライバシーポリシーをご確認ください。 10. お問い合わせ Cookie 等の利用に関するお問い合わせは、次の連絡先までお願いいたします。 メール：info@example.com 電話：03-1234-5678 11. 本ポリシーの変更 当社は、Cookie 等の利用内容の変更、関連法令の改正等に応じて、本ポリシーを変更することがあります。変更後の内容は、本サービス上での掲示その他の適切な方法により周知します。", "type": "text", "style": "", "detail": 0, "format": 0, "version": 1}], "direction": "ltr", "textStyle": "", "textFormat": 0}], "direction": "ltr"}}', '<p>最終更新日：2026年6月26日</p>

<h2>事業者情報</h2>
<table>
<tbody>
<tr><th>事業者名</th><td>株式会社サンプル</td></tr>
<tr><th>代表者</th><td>山田 太郎</td></tr>
<tr><th>所在地</th><td>〒150-0001 東京都 渋谷区 神宮前1-1-1 サンプルビル</td></tr>
<tr><th>メール</th><td>info@example.com</td></tr>
<tr><th>電話</th><td>03-1234-5678</td></tr>
</tbody>
</table>

<div data-callout-type="info"><p>当サイトは、ログイン状態の維持やアクセス解析等のために Cookie 等を利用しています。本ポリシーでは、利用する Cookie の種類・第三者への外部送信・無効化の方法をご説明します。</p></div>

<h2>1. 本ポリシーの目的</h2>
<p>本ポリシーは、株式会社サンプル（以下「当社」といいます）が運営する本サービスにおいて、Cookie および類似技術（Web ビーコン、ローカルストレージ等。以下総称して「Cookie 等」といいます）を利用して取得する情報の種類、利用目的、および利用者による選択の方法について説明するものです。</p>

<h2>2. Cookie 等とは</h2>
<ol>
<li><strong>Cookie</strong>：ウェブサイトを閲覧した際、利用者のブラウザに保存される小さなテキストデータです。次回訪問時に同じウェブサイトが参照することで、ログイン状態の維持や利用環境の記憶等に用いられます。</li>
<li><strong>ローカルストレージ / セッションストレージ</strong>：ブラウザに情報を保存する Web 標準の仕組みです。Cookie より多くの情報を保存できます。</li>
<li><strong>Web ビーコン</strong>：ページ閲覧やメール開封の有無を検知する小さな画像または HTML 要素です。</li>
</ol>

<h2>3. 当社が利用する Cookie 等の種類</h2>
<p>当社は、Cookie 等を目的別に以下のとおり分類して利用しています。</p>

<h3>3.1 必須 Cookie（同意不要）</h3>
<p>本サービスの基本機能の提供に不可欠なため、無効化すると本サービスが正常に利用できなくなります。</p>
<ul>
<li><strong>認証 Cookie</strong>：ログイン状態の維持（Better Auth が発行）</li>
<li><strong>セキュリティ Cookie</strong>：CSRF 攻撃対策、セッション保護</li>
<li><strong>負荷分散 Cookie</strong>：サーバーへの接続安定化</li>
<li><strong>不正アクセス防止 Cookie</strong>：Cloudflare Turnstile による Bot 対策</li>
</ul>

<h3>3.2 機能性 Cookie（同意に基づき利用）</h3>
<p>利便性向上のために利用します。</p>
<ul>
<li><strong>表示設定 Cookie</strong>：言語・地域・税込/税抜表示等の保存</li>
<li><strong>フォーム入力補助 Cookie</strong>：お問い合わせフォーム等の入力支援</li>
</ul>

<h3>3.3 アクセス解析 Cookie（同意に基づき利用）</h3>
<p>本サービスの利用状況の分析、改善に利用します。</p>
<ul>
<li><strong>Google Analytics</strong>：ページ閲覧数、滞在時間、流入経路等の匿名統計情報の取得</li>
</ul>

<h3>3.4 マーケティング Cookie（同意に基づき利用）</h3>
<p>現時点で当社はマーケティング目的の Cookie を利用していません。将来的に利用する場合には、事前に本ポリシーで告知し、利用者の同意を取得します。</p>

<hr>

<h2>4. 第三者への情報の外部送信（外部送信規律）</h2>
<p>本サービスでは、利用者の端末から第三者の事業者に対し、Cookie 等を通じて情報が自動的に送信される場合があります。電気通信事業法第 27 条の 12（外部送信規律、令和 5 年 6 月 16 日施行）に基づき、送信先の事業者、送信される情報の内容、および送信先における利用目的を以下のとおり公表します。各事業者における情報の取扱いの詳細は、それぞれのプライバシーポリシー・Cookie ポリシーをご確認ください。</p>
<table>
<thead>
<tr><th>送信先事業者</th><th>送信される情報</th><th>送信先での利用目的</th><th>関連ポリシー</th></tr>
</thead>
<tbody>
<tr><td>Google LLC（米国）— Google Analytics</td><td>Cookie 識別子、IP アドレス、閲覧ページ URL、リファラー、デバイス・ブラウザ情報</td><td>アクセス解析・統計レポートの提供</td><td>https://policies.google.com/technologies/cookies</td></tr>
<tr><td>Google LLC（米国）— Google Maps</td><td>IP アドレス、おおよその位置情報、閲覧ページ情報</td><td>地図の表示・最適化</td><td>https://policies.google.com/technologies/cookies</td></tr>
<tr><td>Cloudflare, Inc.（米国）— Turnstile</td><td>IP アドレス、User-Agent、ブラウザ指紋等の Bot 検出用メタデータ</td><td>Bot・不正アクセスの検知および防止</td><td>https://www.cloudflare.com/cookie-policy/</td></tr>
<tr><td>Stripe, Inc.（米国）— 決済</td><td>Cookie 識別子、IP アドレス、デバイス情報、決済関連の操作情報</td><td>決済処理および不正決済の検知</td><td>https://stripe.com/jp/cookies-policy/legal</td></tr>
</tbody>
</table>
<p>これらの外部送信のうち、必須 Cookie に該当しないもの（アクセス解析等）については、利用者は本ポリシー第 6 条記載の方法により Cookie を無効化することで送信を停止できます。</p>

<h2>5. Cookie の保存期間</h2>
<ul>
<li><strong>セッション Cookie</strong>：ブラウザを閉じると削除されます。</li>
<li><strong>永続 Cookie</strong>：有効期限まで保存されます（通常は数日〜数年）。期限はサービスや目的により異なります。</li>
</ul>

<h2>6. Cookie の管理・無効化</h2>
<div data-callout-type="warning"><p>必須 Cookie を無効化すると、ログインや予約等の基本機能がご利用いただけなくなります。アクセス解析等の Cookie のみを無効化することも、ブラウザ設定や下記オプトアウトで可能です。</p></div>
<ol>
<li>利用者は、ブラウザの設定により Cookie の受け入れを拒否、制限、削除することができます。</li>
<li>主要ブラウザの設定方法は、以下のリンク先で案内されています。
<ul>
<li>Google Chrome：https://support.google.com/chrome/answer/95647</li>
<li>Safari：https://support.apple.com/ja-jp/guide/safari/sfri11471/mac</li>
<li>Firefox：https://support.mozilla.org/ja/kb/block-websites-storing-cookies-site-data</li>
<li>Microsoft Edge：https://support.microsoft.com/ja-jp/microsoft-edge</li>
</ul>
</li>
<li>Cookie を無効化した場合、本サービスの一部機能が利用できなくなることがあります。必須 Cookie を無効化した場合、本サービスをご利用いただけません。</li>
</ol>

<h2>7. Google Analytics のオプトアウト</h2>
<p>Google Analytics によるアクセス解析を望まない場合は、Google が提供するオプトアウトアドオンをインストールすることで拒否できます。</p>
<ul>
<li>Google Analytics オプトアウトアドオン：https://tools.google.com/dlpage/gaoptout</li>
</ul>

<h2>8. Do Not Track（DNT）シグナルへの対応</h2>
<p>当社は、現時点でブラウザの Do Not Track（DNT）シグナルには対応していません。DNT 仕様が世界的に標準化された場合、対応方針を改めて検討します。</p>

<h2>9. プライバシーポリシーとの関係</h2>
<p>本ポリシーは、当社のプライバシーポリシーの一部を構成します。Cookie 等によって取得された情報を含む個人情報の取扱い全般については、プライバシーポリシーをご確認ください。</p>

<h2>10. お問い合わせ</h2>
<p>Cookie 等の利用に関するお問い合わせは、次の連絡先までお願いいたします。<br>
メール：info@example.com<br>
電話：03-1234-5678</p>

<h2>11. 本ポリシーの変更</h2>
<p>当社は、Cookie 等の利用内容の変更、関連法令の改正等に応じて、本ポリシーを変更することがあります。変更後の内容は、本サービス上での掲示その他の適切な方法により周知します。</p>', true, '2026-06-26 11:20:55.523', true, 7, '2026-06-26 11:20:55.523', '2026-06-26 11:20:55.523', NULL, NULL, '{}') ON CONFLICT (slug) DO NOTHING;
