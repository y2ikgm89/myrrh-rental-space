-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'EDITOR', 'VIEWER', 'USER');

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

-- CreateEnum
CREATE TYPE "LayoutWidth" AS ENUM ('XS', 'SM', 'MD', 'LG', 'XL', 'FULL', 'CUSTOM');

-- CreateEnum
CREATE TYPE "HomepageSectionType" AS ENUM ('HERO', 'SPACE_LIST', 'NEWS', 'POST', 'FAQ', 'CTA', 'CUSTOM', 'INSTAGRAM');

-- CreateEnum
CREATE TYPE "PostStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TermsType" AS ENUM ('TERMS_OF_USE', 'PRIVACY_POLICY', 'CANCELLATION', 'PAYMENT', 'CUSTOM');

-- CreateEnum
CREATE TYPE "TermsStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CouponType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'PUBLISH', 'UNPUBLISH', 'LOGIN_SUCCESS', 'LOGIN_FAILED', 'PERMISSION_DENIED', 'PASSWORD_CHANGE', 'ROLE_CHANGE');

-- CreateEnum
CREATE TYPE "EditorCommentStatus" AS ENUM ('ACTIVE', 'RESOLVED', 'DELETED');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('IMAGE', 'VIDEO', 'DOCUMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "MediaUsage" AS ENUM ('POST', 'NEWS', 'PAGE', 'SPACE', 'SITE', 'GENERAL');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "assignedPages" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
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
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "staff_invitations" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "name" TEXT,
    "usedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "staff_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "address" TEXT NOT NULL,
    "access" TEXT,
    "imageUrl" TEXT NOT NULL,
    "imageUrls" JSONB NOT NULL DEFAULT '[]',
    "businessHours" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "space_categories" (
    "id" TEXT NOT NULL,
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
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
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
    "metaDescription" TEXT,
    "metaKeywords" TEXT,
    "ogpTitle" TEXT,
    "ogpDescription" TEXT,
    "ogpImageUrl" TEXT,
    "termsId" TEXT,
    "discountType" TEXT NOT NULL DEFAULT 'none',
    "discountValue" DECIMAL(10,2),
    "durationDiscountOverride" TEXT NOT NULL DEFAULT 'inherit',
    "taxRateType" TEXT NOT NULL DEFAULT 'standard',
    "locationId" TEXT,
    "categoryId" TEXT,

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
    "couponId" TEXT,
    "couponDiscountAmount" DECIMAL(10,2),
    "durationDiscountAmount" DECIMAL(10,2),
    "spaceDiscountAmount" DECIMAL(10,2),
    "basePrice" DECIMAL(10,2),
    "taxRateType" TEXT,
    "taxRate" DECIMAL(5,2),
    "taxAmount" DECIMAL(10,2),
    "totalPriceWithTax" DECIMAL(10,2),
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
    "lastNameKana" TEXT,
    "firstNameKana" TEXT,
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
CREATE TABLE "coupons" (
    "id" TEXT NOT NULL,
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
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
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
CREATE TABLE "news_versions" (
    "id" TEXT NOT NULL,
    "newsId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "news_versions_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "posts" (
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
    "status" "PostStatus" NOT NULL DEFAULT 'DRAFT',
    "authorId" TEXT NOT NULL,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "contentWidth" "LayoutWidth",
    "contentWidthCustom" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_versions" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "post_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_categories" (
    "id" TEXT NOT NULL,
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
    "id" TEXT NOT NULL,
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
CREATE TABLE "post_comments" (
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

    CONSTRAINT "post_comments_pkey" PRIMARY KEY ("id")
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
    "isSystemPage" BOOLEAN NOT NULL DEFAULT false,
    "contentWidth" "LayoutWidth",
    "contentWidthCustom" INTEGER,
    "showSidebar" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pages_pkey" PRIMARY KEY ("id")
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
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "metaDescription" TEXT,
    "metaKeywords" TEXT,
    "ogpTitle" TEXT,
    "ogpDescription" TEXT,
    "ogpImageUrl" TEXT,

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
    "footerLogoUrl" TEXT,
    "footerCopyright" TEXT,
    "useHeaderLogo" BOOLEAN NOT NULL DEFAULT true,
    "useFooterLogo" BOOLEAN NOT NULL DEFAULT true,
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
    "containerWidth" "LayoutWidth",
    "containerWidthCustom" INTEGER,
    "contentWidth" "LayoutWidth",
    "contentWidthCustom" INTEGER,
    "sidebarEnabled" BOOLEAN NOT NULL DEFAULT true,
    "sidebarWidgets" JSONB NOT NULL DEFAULT '{"search":true,"recent":true,"popular":true,"categories":true,"tags":true}',
    "sidebarRecentCount" INTEGER NOT NULL DEFAULT 5,
    "sidebarPopularCount" INTEGER NOT NULL DEFAULT 5,
    "postPermalinkStructure" TEXT NOT NULL DEFAULT 'post-name',
    "postUrlPrefixEnabled" BOOLEAN NOT NULL DEFAULT true,
    "analyticsType" TEXT,
    "googleAnalyticsId" TEXT,
    "googleTagManagerId" TEXT,
    "googleSearchConsoleId" TEXT,
    "bingWebmasterToolsId" TEXT,
    "gaPropertyId" TEXT,
    "defaultTimeSlot" INTEGER DEFAULT 60,
    "minReservationDuration" INTEGER DEFAULT 60,
    "maxReservationDuration" INTEGER DEFAULT 480,
    "cancellationTermsId" TEXT,
    "sendReservationConfirmationEmail" BOOLEAN NOT NULL DEFAULT true,
    "sendAdminNotificationEmail" BOOLEAN NOT NULL DEFAULT true,
    "durationDiscountEnabled" BOOLEAN NOT NULL DEFAULT false,
    "durationDiscountRules" JSONB NOT NULL DEFAULT '[]',
    "discountCombinationMode" TEXT NOT NULL DEFAULT 'best',
    "showOriginalPrice" BOOLEAN NOT NULL DEFAULT true,
    "discountWarningEnabled" BOOLEAN NOT NULL DEFAULT true,
    "taxStandardRate" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "taxReducedRate" DECIMAL(5,2) NOT NULL DEFAULT 8,
    "taxDisplayModeAdmin" TEXT NOT NULL DEFAULT 'both',
    "taxDisplayModePublic" TEXT NOT NULL DEFAULT 'tax_included',
    "taxInputMode" TEXT NOT NULL DEFAULT 'tax_excluded',
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
    "cloudflareZoneId" TEXT,
    "cloudflareApiToken" TEXT,
    "cloudflareLastTestedAt" TIMESTAMP(3),
    "cloudflareConnectionStatus" TEXT,
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
    "googleCalendarWebhookToken" TEXT,
    "instagramAccessToken" TEXT,
    "instagramTokenExpiresAt" TIMESTAMP(3),
    "instagramUserId" TEXT,
    "instagramUsername" TEXT,
    "instagramAccountType" TEXT,
    "instagramFeedEnabled" BOOLEAN NOT NULL DEFAULT false,
    "instagramFeedLayout" TEXT NOT NULL DEFAULT 'grid',
    "instagramFeedColumns" INTEGER NOT NULL DEFAULT 4,
    "instagramFeedMaxItems" INTEGER NOT NULL DEFAULT 8,
    "instagramShowCaption" BOOLEAN NOT NULL DEFAULT false,
    "instagramShowViewAll" BOOLEAN NOT NULL DEFAULT true,
    "robotsTxtEnabled" BOOLEAN NOT NULL DEFAULT false,
    "robotsTxtCustom" TEXT,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instagram_posts" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "postUrl" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "thumbnailUrl" TEXT,
    "caption" TEXT,
    "mediaType" TEXT NOT NULL,
    "permalink" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "instagram_posts_pkey" PRIMARY KEY ("id")
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

-- CreateTable
CREATE TABLE "homepage_sections" (
    "id" TEXT NOT NULL,
    "type" "HomepageSectionType" NOT NULL,
    "title" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "content" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "homepage_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "permissionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
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
    "id" TEXT NOT NULL,
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
    "uploadedBy" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_attempts" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terms" (
    "id" TEXT NOT NULL,
    "type" "TermsType" NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isSiteWide" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "metaDescription" TEXT,
    "metaKeywords" TEXT,
    "ogpTitle" TEXT,
    "ogpDescription" TEXT,
    "ogpImageUrl" TEXT,

    CONSTRAINT "terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terms_versions" (
    "id" TEXT NOT NULL,
    "termsId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "status" "TermsStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "publishedBy" TEXT,
    "isCurrentVersion" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "terms_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terms_agreements" (
    "id" TEXT NOT NULL,
    "termsId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "reservationId" TEXT,
    "userId" TEXT,
    "guestName" TEXT,
    "guestEmail" TEXT,
    "agreedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "terms_agreements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "editor_comment_threads" (
    "id" TEXT NOT NULL,
    "markId" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "quotedText" TEXT NOT NULL,
    "status" "EditorCommentStatus" NOT NULL DEFAULT 'ACTIVE',
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "editor_comment_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "editor_comments" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "editor_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "user_name_idx" ON "user"("name");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "login_tokens_token_key" ON "login_tokens"("token");

-- CreateIndex
CREATE INDEX "login_tokens_token_idx" ON "login_tokens"("token");

-- CreateIndex
CREATE INDEX "login_tokens_expiresAt_idx" ON "login_tokens"("expiresAt");

-- CreateIndex
CREATE INDEX "login_tokens_usedAt_idx" ON "login_tokens"("usedAt");

-- CreateIndex
CREATE UNIQUE INDEX "staff_invitations_token_key" ON "staff_invitations"("token");

-- CreateIndex
CREATE INDEX "staff_invitations_token_idx" ON "staff_invitations"("token");

-- CreateIndex
CREATE INDEX "staff_invitations_email_idx" ON "staff_invitations"("email");

-- CreateIndex
CREATE INDEX "staff_invitations_expiresAt_idx" ON "staff_invitations"("expiresAt");

-- CreateIndex
CREATE INDEX "locations_isPublished_isActive_idx" ON "locations"("isPublished", "isActive");

-- CreateIndex
CREATE INDEX "locations_sortOrder_idx" ON "locations"("sortOrder");

-- CreateIndex
CREATE INDEX "space_categories_sortOrder_idx" ON "space_categories"("sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "spaces_slug_key" ON "spaces"("slug");

-- CreateIndex
CREATE INDEX "spaces_name_idx" ON "spaces"("name");

-- CreateIndex
CREATE INDEX "spaces_address_idx" ON "spaces"("address");

-- CreateIndex
CREATE INDEX "spaces_isPublished_isActive_idx" ON "spaces"("isPublished", "isActive");

-- CreateIndex
CREATE INDEX "spaces_termsId_idx" ON "spaces"("termsId");

-- CreateIndex
CREATE INDEX "spaces_locationId_idx" ON "spaces"("locationId");

-- CreateIndex
CREATE INDEX "spaces_categoryId_idx" ON "spaces"("categoryId");

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
CREATE INDEX "reservations_couponId_idx" ON "reservations"("couponId");

-- CreateIndex
CREATE UNIQUE INDEX "customers_email_key" ON "customers"("email");

-- CreateIndex
CREATE INDEX "customers_lastName_idx" ON "customers"("lastName");

-- CreateIndex
CREATE INDEX "customers_firstName_idx" ON "customers"("firstName");

-- CreateIndex
CREATE INDEX "customers_phoneNumber_idx" ON "customers"("phoneNumber");

-- CreateIndex
CREATE INDEX "customers_status_idx" ON "customers"("status");

-- CreateIndex
CREATE INDEX "customers_isActive_idx" ON "customers"("isActive");

-- CreateIndex
CREATE INDEX "customers_lastReservationAt_idx" ON "customers"("lastReservationAt");

-- CreateIndex
CREATE INDEX "customers_lastName_firstName_idx" ON "customers"("lastName", "firstName");

-- CreateIndex
CREATE UNIQUE INDEX "coupons_code_key" ON "coupons"("code");

-- CreateIndex
CREATE INDEX "coupons_code_idx" ON "coupons"("code");

-- CreateIndex
CREATE INDEX "coupons_validFrom_validUntil_idx" ON "coupons"("validFrom", "validUntil");

-- CreateIndex
CREATE INDEX "coupons_isActive_idx" ON "coupons"("isActive");

-- CreateIndex
CREATE INDEX "inquiries_status_idx" ON "inquiries"("status");

-- CreateIndex
CREATE INDEX "inquiries_createdAt_idx" ON "inquiries"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "news_slug_key" ON "news"("slug");

-- CreateIndex
CREATE INDEX "news_title_idx" ON "news"("title");

-- CreateIndex
CREATE INDEX "news_isPublished_publishedAt_idx" ON "news"("isPublished", "publishedAt");

-- CreateIndex
CREATE INDEX "news_versions_newsId_createdAt_idx" ON "news_versions"("newsId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "news_versions_newsId_version_key" ON "news_versions"("newsId", "version");

-- CreateIndex
CREATE INDEX "announcement_bars_isActive_priority_idx" ON "announcement_bars"("isActive", "priority");

-- CreateIndex
CREATE INDEX "announcement_bars_startAt_endAt_idx" ON "announcement_bars"("startAt", "endAt");

-- CreateIndex
CREATE UNIQUE INDEX "posts_slug_key" ON "posts"("slug");

-- CreateIndex
CREATE INDEX "posts_title_idx" ON "posts"("title");

-- CreateIndex
CREATE INDEX "posts_status_publishedAt_idx" ON "posts"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "posts_categoryId_status_publishedAt_idx" ON "posts"("categoryId", "status", "publishedAt");

-- CreateIndex
CREATE INDEX "posts_viewCount_idx" ON "posts"("viewCount");

-- CreateIndex
CREATE INDEX "post_versions_postId_createdAt_idx" ON "post_versions"("postId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "post_versions_postId_version_key" ON "post_versions"("postId", "version");

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
CREATE INDEX "post_comments_postId_createdAt_idx" ON "post_comments"("postId", "createdAt");

-- CreateIndex
CREATE INDEX "post_comments_parentCommentId_idx" ON "post_comments"("parentCommentId");

-- CreateIndex
CREATE INDEX "post_comments_userId_idx" ON "post_comments"("userId");

-- CreateIndex
CREATE INDEX "post_comments_ipAddress_createdAt_idx" ON "post_comments"("ipAddress", "createdAt");

-- CreateIndex
CREATE INDEX "post_comments_guestEmail_createdAt_idx" ON "post_comments"("guestEmail", "createdAt");

-- CreateIndex
CREATE INDEX "post_comments_contentHash_idx" ON "post_comments"("contentHash");

-- CreateIndex
CREATE INDEX "post_comments_isDeleted_idx" ON "post_comments"("isDeleted");

-- CreateIndex
CREATE INDEX "post_comments_isDeleted_createdAt_idx" ON "post_comments"("isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "pages_slug_key" ON "pages"("slug");

-- CreateIndex
CREATE INDEX "pages_isPublished_isActive_idx" ON "pages"("isPublished", "isActive");

-- CreateIndex
CREATE INDEX "pages_isSystemPage_idx" ON "pages"("isSystemPage");

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
CREATE INDEX "faq_items_isPublished_idx" ON "faq_items"("isPublished");

-- CreateIndex
CREATE UNIQUE INDEX "instagram_posts_postId_key" ON "instagram_posts"("postId");

-- CreateIndex
CREATE INDEX "instagram_posts_sortOrder_idx" ON "instagram_posts"("sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ical_tokens_token_key" ON "ical_tokens"("token");

-- CreateIndex
CREATE INDEX "ical_tokens_token_idx" ON "ical_tokens"("token");

-- CreateIndex
CREATE INDEX "ical_tokens_spaceId_idx" ON "ical_tokens"("spaceId");

-- CreateIndex
CREATE INDEX "ical_tokens_createdBy_idx" ON "ical_tokens"("createdBy");

-- CreateIndex
CREATE INDEX "homepage_sections_order_isActive_idx" ON "homepage_sections"("order", "isActive");

-- CreateIndex
CREATE INDEX "homepage_sections_type_idx" ON "homepage_sections"("type");

-- CreateIndex
CREATE INDEX "permissions_resource_idx" ON "permissions"("resource");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_resource_action_key" ON "permissions"("resource", "action");

-- CreateIndex
CREATE INDEX "role_permissions_role_idx" ON "role_permissions"("role");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_role_permissionId_key" ON "role_permissions"("role", "permissionId");

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
CREATE UNIQUE INDEX "terms_slug_key" ON "terms"("slug");

-- CreateIndex
CREATE INDEX "terms_type_isActive_idx" ON "terms"("type", "isActive");

-- CreateIndex
CREATE INDEX "terms_type_isSiteWide_idx" ON "terms"("type", "isSiteWide");

-- CreateIndex
CREATE INDEX "terms_slug_idx" ON "terms"("slug");

-- CreateIndex
CREATE INDEX "terms_versions_termsId_isCurrentVersion_idx" ON "terms_versions"("termsId", "isCurrentVersion");

-- CreateIndex
CREATE INDEX "terms_versions_status_publishedAt_idx" ON "terms_versions"("status", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "terms_versions_termsId_version_key" ON "terms_versions"("termsId", "version");

-- CreateIndex
CREATE INDEX "terms_agreements_reservationId_idx" ON "terms_agreements"("reservationId");

-- CreateIndex
CREATE INDEX "terms_agreements_userId_agreedAt_idx" ON "terms_agreements"("userId", "agreedAt");

-- CreateIndex
CREATE INDEX "terms_agreements_termsId_versionId_idx" ON "terms_agreements"("termsId", "versionId");

-- CreateIndex
CREATE INDEX "terms_agreements_guestEmail_agreedAt_idx" ON "terms_agreements"("guestEmail", "agreedAt");

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

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_termsId_fkey" FOREIGN KEY ("termsId") REFERENCES "terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "space_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_versions" ADD CONSTRAINT "news_versions_newsId_fkey" FOREIGN KEY ("newsId") REFERENCES "news"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "post_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_versions" ADD CONSTRAINT "post_versions_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_parentCommentId_fkey" FOREIGN KEY ("parentCommentId") REFERENCES "post_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "navigation_items" ADD CONSTRAINT "navigation_items_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "navigation_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faq_items" ADD CONSTRAINT "faq_items_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "faq_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings" ADD CONSTRAINT "settings_cancellationTermsId_fkey" FOREIGN KEY ("cancellationTermsId") REFERENCES "terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ical_tokens" ADD CONSTRAINT "ical_tokens_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ical_tokens" ADD CONSTRAINT "ical_tokens_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terms_versions" ADD CONSTRAINT "terms_versions_termsId_fkey" FOREIGN KEY ("termsId") REFERENCES "terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terms_agreements" ADD CONSTRAINT "terms_agreements_termsId_fkey" FOREIGN KEY ("termsId") REFERENCES "terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terms_agreements" ADD CONSTRAINT "terms_agreements_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "terms_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terms_agreements" ADD CONSTRAINT "terms_agreements_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terms_agreements" ADD CONSTRAINT "terms_agreements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "editor_comments" ADD CONSTRAINT "editor_comments_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "editor_comment_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
