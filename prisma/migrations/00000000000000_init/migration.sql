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
CREATE TYPE "role" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'EDITOR', 'VIEWER', 'USER', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "reservation_status" AS ENUM ('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "reservation_series_freq" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "inquiry_status" AS ENUM ('NEW', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'FLAGGED', 'SPAM');

-- CreateEnum
CREATE TYPE "inquiry_reply_author_type" AS ENUM ('STAFF', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "customer_type" AS ENUM ('PERSONAL', 'CORPORATE');

-- CreateEnum
CREATE TYPE "customer_status" AS ENUM ('NEW', 'REGULAR', 'VIP', 'INACTIVE', 'BLACKLIST');

-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('UNPAID', 'PENDING', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED', 'FAILED');

-- CreateEnum
CREATE TYPE "navigation_type" AS ENUM ('HEADER_DESKTOP', 'HEADER_MOBILE', 'FOOTER');

-- CreateEnum
CREATE TYPE "social_platform" AS ENUM ('TWITTER', 'FACEBOOK', 'INSTAGRAM', 'YOUTUBE', 'LINE', 'TIKTOK', 'OTHER');

-- CreateEnum
CREATE TYPE "layout_width" AS ENUM ('XS', 'SM', 'MD', 'LG', 'XL', 'FULL', 'CUSTOM');

-- CreateEnum
CREATE TYPE "post_status" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "coupon_type" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');

-- CreateEnum
CREATE TYPE "discount_type" AS ENUM ('NONE', 'PERCENTAGE', 'FIXED');

-- CreateEnum
CREATE TYPE "duration_discount_override" AS ENUM ('INHERIT', 'ENABLED', 'DISABLED');

-- CreateEnum
CREATE TYPE "tax_rate_type" AS ENUM ('STANDARD', 'REDUCED');

-- CreateEnum
CREATE TYPE "header_scroll_behavior" AS ENUM ('AUTO_HIDE', 'ALWAYS_VISIBLE', 'HIDE_ON_SCROLL');

-- CreateEnum
CREATE TYPE "header_background_mode" AS ENUM ('SOLID', 'TRANSPARENT');

-- CreateEnum
CREATE TYPE "tax_display_mode" AS ENUM ('TAX_EXCLUDED', 'TAX_INCLUDED', 'BOTH');

-- CreateEnum
CREATE TYPE "calendar_sync_method" AS ENUM ('POLLING', 'WEBHOOK', 'BOTH');

-- CreateEnum
CREATE TYPE "connection_status" AS ENUM ('CONNECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "blocked_date_scope" AS ENUM ('GLOBAL', 'LOCATION', 'SPACE');

-- CreateEnum
CREATE TYPE "blocked_date_type" AS ENUM ('HOLIDAY', 'MAINTENANCE', 'EMERGENCY', 'OTHER');

-- CreateEnum
CREATE TYPE "refunded_by_type" AS ENUM ('ADMIN', 'AUTO_ON_CANCEL', 'AUTO_CAPACITY_RACE', 'AUTO_AMOUNT_MISMATCH', 'STRIPE_DASHBOARD');

-- CreateEnum
CREATE TYPE "cancelled_by" AS ENUM ('CUSTOMER_MYPAGE', 'CUSTOMER_TOKEN', 'ADMIN', 'SYSTEM');

-- CreateEnum
CREATE TYPE "transfer_account_type" AS ENUM ('ORDINARY', 'CURRENT', 'SAVINGS');

-- CreateEnum
CREATE TYPE "analytics_type" AS ENUM ('GA4', 'GTM');

-- CreateEnum
CREATE TYPE "discount_combination_mode" AS ENUM ('BEST', 'BOTH');

-- CreateEnum
CREATE TYPE "announcement_bar_animation" AS ENUM ('FADE', 'SLIDE_X', 'SLIDE_Y');

-- CreateEnum
CREATE TYPE "announcement_bar_design_style" AS ENUM ('SOLID', 'GRADIENT', 'OUTLINED', 'GLASS', 'MINIMAL', 'STRIPED');

-- CreateEnum
CREATE TYPE "instagram_media_type" AS ENUM ('IMAGE', 'VIDEO', 'CAROUSEL_ALBUM');

-- CreateEnum
CREATE TYPE "event_status" AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "event_schedule_mode" AS ENUM ('SINGLE_OCCURRENCE', 'TIMED_ENTRY');

-- CreateEnum
CREATE TYPE "event_format" AS ENUM ('OFFLINE', 'ONLINE', 'HYBRID');

-- CreateEnum
CREATE TYPE "meeting_provider" AS ENUM ('MANUAL', 'GOOGLE_MEET');

-- CreateEnum
CREATE TYPE "registration_status" AS ENUM ('CONFIRMED', 'CANCELLED', 'WAITLISTED', 'WAITLISTED_OFFERED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "email_delivery_status" AS ENUM ('OK', 'SOFT_BOUNCED', 'HARD_BOUNCED', 'COMPLAINED');

-- CreateEnum
CREATE TYPE "day_of_week" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- CreateEnum
CREATE TYPE "holiday_mode" AS ENUM ('ANY', 'ONLY', 'EXCLUDE');

-- CreateEnum
CREATE TYPE "audit_action" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'READ', 'MANAGE', 'PUBLISH', 'EXPORT', 'LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT', 'PERMISSION_DENIED', 'PASSWORD_CHANGE', 'PASSWORD_RESET_REQUEST', 'PASSWORD_RESET_FAILED', 'ROLE_CHANGE', 'INTEGRITY_CHECK');

-- CreateEnum
CREATE TYPE "editor_comment_status" AS ENUM ('ACTIVE', 'RESOLVED', 'DELETED');

-- CreateEnum
CREATE TYPE "media_type" AS ENUM ('IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "media_usage" AS ENUM ('POST', 'NEWS', 'PAGE', 'SPACE', 'EVENT', 'SITE', 'GENERAL');

-- CreateEnum
CREATE TYPE "terms_scope" AS ENUM ('LOGIN_SIGNUP', 'RESERVATION', 'INQUIRY', 'EVENT_REGISTRATION', 'RESERVATION_SERIES');

-- CreateEnum
CREATE TYPE "smart_lock_device_type" AS ENUM ('KEYPAD', 'KEYPAD_TOUCH', 'KEYPAD_VISION', 'KEYPAD_VISION_PRO', 'LOCK', 'LOCK_LITE', 'LOCK_PRO');

-- CreateEnum
CREATE TYPE "smart_lock_passcode_status" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED', 'REVOKE_PENDING', 'REVOKED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "name" TEXT NOT NULL,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "role" "role" NOT NULL DEFAULT 'USER',
    "dashboard_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_page_assignments" (
    "user_id" UUID NOT NULL,
    "page_id" UUID NOT NULL,

    CONSTRAINT "user_page_assignments_pkey" PRIMARY KEY ("user_id","page_id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "account_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "id_token" TEXT,
    "access_token_expires_at" TIMESTAMPTZ(6),
    "refresh_token_expires_at" TIMESTAMPTZ(6),
    "scope" TEXT,
    "password" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verifications" (
    "id" UUID NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(255) NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "address" TEXT NOT NULL,
    "postal_code" VARCHAR(10),
    "prefecture" VARCHAR(20),
    "city" VARCHAR(100),
    "street_address" VARCHAR(200),
    "building_name" VARCHAR(200),
    "access_lines" JSONB NOT NULL DEFAULT '[]',
    "parking_info" TEXT,
    "amenities" JSONB NOT NULL DEFAULT '{}',
    "image_url" TEXT NOT NULL,
    "image_urls" JSONB NOT NULL DEFAULT '[]',
    "business_hours" JSONB,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "google_business_place_id" TEXT,
    "google_review_url" TEXT,
    "price_range" VARCHAR(100),
    "payment_accepted" TEXT,
    "phone_number" VARCHAR(30),
    "email" VARCHAR(254),
    "gbp_sync_enabled" BOOLEAN NOT NULL DEFAULT true,
    "gbp_synced_at" TIMESTAMPTZ(6),
    "gbp_sync_error" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "default_smart_lock_device_id" UUID,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "space_categories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "color" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "space_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spaces" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description_json" JSONB NOT NULL,
    "description_html" TEXT NOT NULL,
    "description_plain_text" TEXT NOT NULL,
    "address_detail" TEXT,
    "capacity" INTEGER NOT NULL,
    "area" INTEGER,
    "hourly_price" INTEGER NOT NULL,
    "main_image_url" TEXT NOT NULL,
    "gallery" JSONB NOT NULL DEFAULT '[]',
    "facilities" JSONB NOT NULL DEFAULT '[]',
    "business_hours" JSONB,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMPTZ(6),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "reviews_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "meta_description" TEXT,
    "meta_keywords" TEXT,
    "ogp_title" TEXT,
    "ogp_description" TEXT,
    "ogp_image_url" TEXT,
    "discount_type" "discount_type" NOT NULL DEFAULT 'NONE',
    "discount_value" INTEGER,
    "duration_discount_override" "duration_discount_override" NOT NULL DEFAULT 'INHERIT',
    "tax_rate_type" "tax_rate_type" NOT NULL DEFAULT 'STANDARD',
    "location_id" UUID NOT NULL,
    "category_id" UUID,
    "smart_lock_device_id" UUID,

    CONSTRAINT "spaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "space_rate_plans" (
    "id" UUID NOT NULL,
    "space_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "hourly_price" INTEGER NOT NULL,
    "days_of_week" "day_of_week"[],
    "holiday_mode" "holiday_mode" NOT NULL DEFAULT 'ANY',
    "start_time" VARCHAR(5),
    "end_time" VARCHAR(5),
    "effective_from" DATE,
    "effective_to" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "space_rate_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blocked_dates" (
    "id" UUID NOT NULL,
    "scope" "blocked_date_scope" NOT NULL,
    "space_id" UUID,
    "location_id" UUID,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "reason" VARCHAR(200),
    "type" "blocked_date_type" NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "blocked_dates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservation_series" (
    "id" UUID NOT NULL,
    "space_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "coupon_id" UUID,
    "rrule" VARCHAR(500) NOT NULL,
    "dtstart" TIMESTAMPTZ(6) NOT NULL,
    "duration" INTEGER NOT NULL,
    "instance_count" INTEGER NOT NULL,
    "template_data" JSONB NOT NULL,
    "agreement_snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancelled_by_type" "cancelled_by",
    "cancellation_reason" TEXT,
    "deleted_at" TIMESTAMPTZ(6),
    "deleted_by_id" UUID,
    "google_calendar_master_event_id" VARCHAR(1024),

    CONSTRAINT "reservation_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" UUID NOT NULL,
    "space_id" UUID NOT NULL,
    "user_id" UUID,
    "customer_id" UUID NOT NULL,
    "start_time" TIMESTAMPTZ(6) NOT NULL,
    "end_time" TIMESTAMPTZ(6) NOT NULL,
    "status" "reservation_status" NOT NULL DEFAULT 'PENDING',
    "total_price" INTEGER NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "coupon_id" UUID,
    "coupon_discount_amount" INTEGER,
    "duration_discount_amount" INTEGER,
    "space_discount_amount" INTEGER,
    "base_price" INTEGER NOT NULL,
    "rate_breakdown_json" JSONB NOT NULL,
    "tax_rate_type" "tax_rate_type" NOT NULL,
    "tax_rate" INTEGER NOT NULL,
    "tax_amount" INTEGER NOT NULL,
    "total_price_with_tax" INTEGER NOT NULL,
    "price_overridden_by_id" UUID,
    "manual_adjustment_amount" INTEGER,
    "google_calendar_event_id" TEXT,
    "calendar_synced_at" TIMESTAMPTZ(6),
    "calendar_sync_error" TEXT,
    "guest_last_name" VARCHAR(50),
    "guest_first_name" VARCHAR(50),
    "guest_email" VARCHAR(254),
    "guest_phone" VARCHAR(30),
    "guest_company_name" VARCHAR(100),
    "guest_customer_type" "customer_type",
    "deleted_at" TIMESTAMPTZ(6),
    "deleted_by_id" UUID,
    "number_of_guests" INTEGER,
    "payment_status" "payment_status" NOT NULL DEFAULT 'UNPAID',
    "stripe_checkout_session_id" TEXT,
    "stripe_payment_intent_id" TEXT,
    "paid_at" TIMESTAMPTZ(6),
    "payment_initiated_at" TIMESTAMPTZ(6),
    "cancellation_reason" TEXT,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancelled_by_type" "cancelled_by",
    "ics_sequence" INTEGER NOT NULL DEFAULT 0,
    "reminder_sent_at" TIMESTAMPTZ(6),
    "smart_lock_reissue_pending_at" TIMESTAMPTZ(6),
    "series_id" UUID,
    "recurrence_instance_index" INTEGER,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "last_name" VARCHAR(50) NOT NULL,
    "first_name" VARCHAR(50) NOT NULL,
    "last_name_kana" VARCHAR(50),
    "first_name_kana" VARCHAR(50),
    "company_name" VARCHAR(100),
    "customer_type" "customer_type" NOT NULL DEFAULT 'PERSONAL',
    "email" VARCHAR(254) NOT NULL,
    "email_canonical" VARCHAR(254) NOT NULL,
    "phone_number" VARCHAR(30),
    "postal_code" VARCHAR(10),
    "prefecture" VARCHAR(20),
    "city" VARCHAR(100),
    "street_address" VARCHAR(200),
    "building" VARCHAR(200),
    "status" "customer_status" NOT NULL DEFAULT 'NEW',
    "notes" TEXT,
    "total_reservations" INTEGER NOT NULL DEFAULT 0,
    "total_spent" INTEGER,
    "last_reservation_at" TIMESTAMPTZ(6),
    "first_reservation_at" TIMESTAMPTZ(6),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "marketing_opt_in" BOOLEAN NOT NULL DEFAULT false,
    "phone_contact_opt_in" BOOLEAN NOT NULL DEFAULT true,
    "email_delivery_status" "email_delivery_status" NOT NULL DEFAULT 'OK',
    "email_delivery_updated_at" TIMESTAMPTZ(6),
    "email_delivery_reason" VARCHAR(500),
    "flagged_for_review_at" TIMESTAMPTZ(6),
    "flag_reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "anonymized_at" TIMESTAMPTZ(6),
    "anonymized_reason" VARCHAR(50),
    "suppressed_email_hash" VARCHAR(128),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "user_id" UUID,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pending_customer_email_changes" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "new_email" VARCHAR(254) NOT NULL,
    "new_email_canonical" VARCHAR(254) NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_customer_email_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pending_customer_merges" (
    "id" UUID NOT NULL,
    "target_customer_id" UUID NOT NULL,
    "source_customer_id" UUID NOT NULL,
    "guest_email" VARCHAR(254) NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_customer_merges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupons" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "coupon_type" NOT NULL,
    "discount_value" INTEGER NOT NULL,
    "min_reservation_amount" INTEGER,
    "max_discount_amount" INTEGER,
    "valid_from" TIMESTAMPTZ(6) NOT NULL,
    "valid_until" TIMESTAMPTZ(6),
    "usage_limit" INTEGER,
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "can_combine_with_duration_discount" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inquiries" (
    "id" UUID NOT NULL,
    "receipt_number" VARCHAR(20) NOT NULL,
    "name" VARCHAR(101) NOT NULL,
    "company_name" VARCHAR(100),
    "customer_type" "customer_type",
    "email" VARCHAR(254) NOT NULL,
    "phone_number" VARCHAR(30),
    "subject" VARCHAR(200) NOT NULL,
    "message" TEXT NOT NULL,
    "status" "inquiry_status" NOT NULL DEFAULT 'NEW',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "assignee_id" UUID,
    "sla_expires_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),
    "anonymized_at" TIMESTAMPTZ(6),
    "anonymized_reason" VARCHAR(50),
    "customer_id" UUID,

    CONSTRAINT "inquiries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inquiry_replies" (
    "id" UUID NOT NULL,
    "inquiry_id" UUID NOT NULL,
    "author_type" "inquiry_reply_author_type" NOT NULL,
    "author_id" UUID,
    "author_customer_id" UUID,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "inquiry_replies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inquiry_status_history" (
    "id" UUID NOT NULL,
    "inquiry_id" UUID NOT NULL,
    "from_status" "inquiry_status",
    "to_status" "inquiry_status" NOT NULL,
    "changed_by_id" UUID,
    "reason" VARCHAR(200),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inquiry_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inquiry_attachments" (
    "id" UUID NOT NULL,
    "inquiry_id" UUID NOT NULL,
    "reply_id" UUID,
    "r2_key" TEXT NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "uploaded_by_id" UUID,
    "uploaded_by_customer_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inquiry_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inquiry_internal_notes" (
    "id" UUID NOT NULL,
    "inquiry_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "inquiry_internal_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inquiry_tags" (
    "id" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "color" VARCHAR(20),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "inquiry_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inquiry_tag_on_inquiries" (
    "inquiry_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inquiry_tag_on_inquiries_pkey" PRIMARY KEY ("inquiry_id","tag_id")
);

-- CreateTable
CREATE TABLE "news" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content_html" TEXT NOT NULL,
    "content_json" JSONB,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMPTZ(6),
    "content_width" "layout_width",
    "content_width_custom" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "meta_description" TEXT,
    "meta_keywords" TEXT,
    "ogp_title" TEXT,
    "ogp_description" TEXT,
    "ogp_image_url" TEXT,

    CONSTRAINT "news_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcement_bars" (
    "id" UUID NOT NULL,
    "message" JSONB NOT NULL DEFAULT '[]',
    "link_url" TEXT,
    "link_text" TEXT,
    "bg_color" TEXT,
    "text_color" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "start_at" TIMESTAMPTZ(6),
    "end_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "announcement_bars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posts" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "content_html" TEXT NOT NULL,
    "content_json" JSONB,
    "thumbnail_url" TEXT NOT NULL,
    "ogp_image_url" TEXT,
    "category_id" UUID NOT NULL,
    "meta_description" TEXT,
    "meta_keywords" TEXT,
    "ogp_title" TEXT,
    "ogp_description" TEXT,
    "published_at" TIMESTAMPTZ(6),
    "status" "post_status" NOT NULL DEFAULT 'DRAFT',
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "author_id" UUID,
    "content_width" "layout_width",
    "content_width_custom" INTEGER,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_tag_on_posts" (
    "post_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,

    CONSTRAINT "post_tag_on_posts_pkey" PRIMARY KEY ("post_id","tag_id")
);

-- CreateTable
CREATE TABLE "post_categories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "meta_title" TEXT,
    "meta_description" TEXT,
    "ogp_image_url" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "post_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_tags" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "meta_title" TEXT,
    "meta_description" TEXT,
    "ogp_image_url" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "post_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pages" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "meta_description" TEXT,
    "meta_keywords" TEXT,
    "ogp_title" TEXT,
    "ogp_description" TEXT,
    "ogp_image_url" TEXT,
    "is_published" BOOLEAN NOT NULL DEFAULT true,
    "published_at" TIMESTAMPTZ(6),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system_page" BOOLEAN NOT NULL DEFAULT false,
    "template" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sections" (
    "id" UUID NOT NULL,
    "page_id" UUID NOT NULL,
    "type" VARCHAR(64) NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "navigation_items" (
    "id" UUID NOT NULL,
    "type" "navigation_type" NOT NULL,
    "parent_id" UUID,
    "label" JSONB NOT NULL,
    "url" TEXT NOT NULL,
    "is_external" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "navigation_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_links" (
    "id" UUID NOT NULL,
    "platform" "social_platform" NOT NULL,
    "url" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "show_on_desktop" BOOLEAN NOT NULL DEFAULT true,
    "show_on_mobile" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

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
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "faq_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faq_items" (
    "id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "is_published" BOOLEAN NOT NULL DEFAULT true,
    "published_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "last_viewed_at" TIMESTAMPTZ(6),
    "helpful_count" INTEGER NOT NULL DEFAULT 0,
    "not_helpful_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "faq_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_announcement_carousel" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "animation" "announcement_bar_animation" NOT NULL DEFAULT 'FADE',
    "duration" INTEGER NOT NULL DEFAULT 5000,
    "auto_play" BOOLEAN NOT NULL DEFAULT true,
    "pause_on_hover" BOOLEAN NOT NULL DEFAULT true,
    "show_arrows" BOOLEAN NOT NULL DEFAULT true,
    "show_indicator" BOOLEAN NOT NULL DEFAULT true,
    "design_style" "announcement_bar_design_style" NOT NULL DEFAULT 'SOLID',
    "bg_color" TEXT,
    "text_color" TEXT,
    "stripe_color" TEXT,
    "stripe_animation" BOOLEAN NOT NULL DEFAULT false,
    "gradient_animation" BOOLEAN NOT NULL DEFAULT false,
    "glass_animation" BOOLEAN NOT NULL DEFAULT false,
    "sticky" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "settings_announcement_carousel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_system" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "maintenance_mode" BOOLEAN NOT NULL DEFAULT false,
    "maintenance_message" TEXT,
    "cookie_consent_enabled" BOOLEAN NOT NULL DEFAULT false,
    "cookie_consent_message" TEXT,
    "cookie_consent_accept_text" TEXT,
    "cookie_consent_reject_text" TEXT,
    "cookie_consent_policy_url" TEXT,

    CONSTRAINT "settings_system_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_seo" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "site_name" TEXT,
    "site_description" TEXT,
    "favicon_url" TEXT NOT NULL DEFAULT '',
    "default_ogp_image_url" TEXT,
    "header_logo_url" TEXT,
    "footer_logo_url" TEXT,
    "footer_copyright" TEXT,
    "use_header_logo" BOOLEAN NOT NULL DEFAULT true,
    "use_footer_logo" BOOLEAN NOT NULL DEFAULT true,
    "default_meta_description" TEXT,
    "default_meta_keywords" TEXT,
    "default_ogp_title" TEXT,
    "default_ogp_description" TEXT,

    CONSTRAINT "settings_seo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_analytics" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "analytics_type" "analytics_type",
    "google_analytics_id" TEXT,
    "google_tag_manager_id" TEXT,
    "google_search_console_id" TEXT,
    "bing_webmaster_tools_id" TEXT,
    "ga_property_id" TEXT,
    "microsoft_clarity_id" TEXT,

    CONSTRAINT "settings_analytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_layout" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "container_width" "layout_width",
    "container_width_custom" INTEGER,
    "content_width" "layout_width",
    "content_width_custom" INTEGER,
    "header_scroll_behavior" "header_scroll_behavior" NOT NULL DEFAULT 'ALWAYS_VISIBLE',
    "header_background_mode" "header_background_mode" NOT NULL DEFAULT 'SOLID',
    "theme_color" TEXT NOT NULL DEFAULT '#fafafa',
    "footer_tagline" TEXT,
    "footer_navigation_label" TEXT NOT NULL DEFAULT 'Navigation',
    "footer_contact_label" TEXT NOT NULL DEFAULT 'Contact',
    "footer_hours_label" TEXT NOT NULL DEFAULT 'Hours',
    "footer_show_social_links" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "settings_layout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_sidebar" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "sidebar_enabled" BOOLEAN NOT NULL DEFAULT true,
    "sidebar_widgets" JSONB NOT NULL DEFAULT '[{"type":"search","enabled":true},{"type":"recent","enabled":true,"layout":"compact"},{"type":"popular","enabled":true,"layout":"compact","showRanking":true},{"type":"categories","enabled":true},{"type":"tags","enabled":true}]',
    "sidebar_recent_count" INTEGER NOT NULL DEFAULT 5,
    "sidebar_popular_count" INTEGER NOT NULL DEFAULT 5,
    "sidebar_toc_enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "settings_sidebar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_organization" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "business_name" TEXT,
    "business_name_kana" TEXT,
    "representative_name" TEXT,
    "established_date" DATE,
    "registration_number" TEXT,
    "invoice_number" TEXT,
    "business_description" TEXT,
    "phone_number" VARCHAR(30),
    "fax_number" VARCHAR(30),
    "email" VARCHAR(254),
    "postal_code" VARCHAR(10),
    "prefecture" VARCHAR(20),
    "city" VARCHAR(100),
    "street_address" VARCHAR(200),
    "building_name" VARCHAR(200),
    "business_hours" JSONB,
    "holiday_notice" TEXT,
    "transfer_guidance" TEXT,
    "sender_email" VARCHAR(254),
    "sender_name" TEXT,
    "reply_to_email" VARCHAR(254),

    CONSTRAINT "settings_organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_commerce" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "duration_discount_enabled" BOOLEAN NOT NULL DEFAULT false,
    "duration_discount_rules" JSONB NOT NULL DEFAULT '[]',
    "discount_combination_mode" "discount_combination_mode" NOT NULL DEFAULT 'BEST',
    "show_original_price" BOOLEAN NOT NULL DEFAULT true,
    "tax_standard_rate" INTEGER NOT NULL DEFAULT 10,
    "tax_reduced_rate" INTEGER NOT NULL DEFAULT 8,
    "tax_display_mode_public" "tax_display_mode" NOT NULL DEFAULT 'TAX_INCLUDED',
    "refund_policy" JSONB,

    CONSTRAINT "settings_commerce_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_notification" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "notify_new_reservation" BOOLEAN NOT NULL DEFAULT true,
    "notify_reservation_change" BOOLEAN NOT NULL DEFAULT true,
    "notify_reservation_cancel" BOOLEAN NOT NULL DEFAULT true,
    "notify_new_inquiry" BOOLEAN NOT NULL DEFAULT true,
    "notify_inquiry_customer_reply" BOOLEAN NOT NULL DEFAULT true,
    "notify_event_registration" BOOLEAN NOT NULL DEFAULT true,
    "notify_event_waitlist_registration" BOOLEAN NOT NULL DEFAULT true,
    "notify_event_cancellation" BOOLEAN NOT NULL DEFAULT true,
    "notify_event_reminder" BOOLEAN NOT NULL DEFAULT false,
    "notification_staff_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notification_email_addresses" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "settings_notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_reservation" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "default_time_slot" INTEGER NOT NULL DEFAULT 60,
    "min_reservation_duration" INTEGER NOT NULL DEFAULT 60,
    "max_reservation_duration" INTEGER NOT NULL DEFAULT 480,
    "send_reservation_confirmation_email" BOOLEAN NOT NULL DEFAULT true,
    "max_recurrence_instances" INTEGER NOT NULL DEFAULT 26,
    "customer_can_cancel_series_in_full" BOOLEAN NOT NULL DEFAULT false,
    "cancellation_deadline_hours" INTEGER NOT NULL DEFAULT 24,
    "modification_deadline_hours" INTEGER NOT NULL DEFAULT 24,

    CONSTRAINT "settings_reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_stripe" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "stripe_publishable_key" TEXT,
    "stripe_secret_key" TEXT,
    "stripe_webhook_secret" TEXT,
    "stripe_account_id" TEXT,
    "stripe_currency" TEXT NOT NULL DEFAULT 'jpy',
    "stripe_payment_method_types" TEXT[] DEFAULT ARRAY['card']::TEXT[],
    "stripe_last_tested_at" TIMESTAMPTZ(6),
    "stripe_connection_status" "connection_status",

    CONSTRAINT "settings_stripe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_resend" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "resend_api_key" TEXT,
    "resend_webhook_secret" TEXT,
    "resend_last_tested_at" TIMESTAMPTZ(6),
    "resend_connection_status" "connection_status",

    CONSTRAINT "settings_resend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_turnstile" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "turnstile_site_key" TEXT,
    "turnstile_secret_key" TEXT,
    "turnstile_last_tested_at" TIMESTAMPTZ(6),
    "turnstile_connection_status" "connection_status",

    CONSTRAINT "settings_turnstile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_google_maps" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "google_maps_api_key" TEXT,
    "google_maps_last_tested_at" TIMESTAMPTZ(6),
    "google_maps_connection_status" "connection_status",

    CONSTRAINT "settings_google_maps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_google_calendar" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "google_calendar_enabled" BOOLEAN NOT NULL DEFAULT false,
    "google_calendar_service_account_json" TEXT,
    "google_calendar_id" TEXT,
    "google_calendar_last_tested_at" TIMESTAMPTZ(6),
    "google_calendar_connection_status" "connection_status",
    "google_calendar_reminder_minutes" INTEGER,
    "ical_attachment_enabled" BOOLEAN NOT NULL DEFAULT true,
    "add_to_calendar_links_enabled" BOOLEAN NOT NULL DEFAULT true,
    "google_calendar_two_way_sync_enabled" BOOLEAN NOT NULL DEFAULT false,
    "google_calendar_sync_method" "calendar_sync_method" NOT NULL DEFAULT 'POLLING',
    "google_calendar_sync_token" TEXT,
    "google_calendar_last_synced_at" TIMESTAMPTZ(6),
    "event_import_enabled" BOOLEAN NOT NULL DEFAULT false,
    "event_import_sync_token" TEXT,
    "google_calendar_webhook_channel_id" TEXT,
    "google_calendar_webhook_resource_id" TEXT,
    "google_calendar_webhook_expiration" TIMESTAMPTZ(6),
    "google_calendar_webhook_token" TEXT,

    CONSTRAINT "settings_google_calendar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_google_business_profile" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "google_business_profile_enabled" BOOLEAN NOT NULL DEFAULT false,
    "google_business_profile_auth" JSONB,

    CONSTRAINT "settings_google_business_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_instagram" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "instagram_access_token" TEXT,
    "instagram_token_expires_at" TIMESTAMPTZ(6),
    "instagram_user_id" TEXT,
    "instagram_username" TEXT,
    "instagram_account_type" TEXT,

    CONSTRAINT "settings_instagram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_switchbot" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "switchbot_enabled" BOOLEAN NOT NULL DEFAULT false,
    "switchbot_open_token" TEXT,
    "switchbot_secret_key" TEXT,
    "switchbot_connection_status" "connection_status",
    "switchbot_last_tested_at" TIMESTAMPTZ(6),
    "switchbot_passcode_buffer_minutes" INTEGER NOT NULL DEFAULT 15,
    "switchbot_webhook_path_token" TEXT,

    CONSTRAINT "settings_switchbot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_features" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "feature_modules" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "settings_features_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_data_retention" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "data_retention" JSONB NOT NULL DEFAULT '{"sessionMonths":6,"verificationMonths":6,"reservationGuestMonths":12,"inquiryMonths":36,"customerInactiveMonths":84}',

    CONSTRAINT "settings_data_retention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instagram_posts" (
    "id" UUID NOT NULL,
    "post_id" TEXT NOT NULL,
    "post_url" TEXT NOT NULL,
    "media_url" TEXT,
    "thumbnail_url" TEXT,
    "caption" TEXT,
    "media_type" "instagram_media_type" NOT NULL,
    "permalink" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "instagram_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "sequence" BIGINT NOT NULL,
    "previous_hash" CHAR(64) NOT NULL,
    "entry_hash" CHAR(64) NOT NULL,
    "hash_algorithm" VARCHAR(32) NOT NULL DEFAULT 'HMAC-SHA256',
    "hash_key_id" VARCHAR(32) NOT NULL DEFAULT 'v1',
    "chain_version" INTEGER NOT NULL DEFAULT 1,
    "user_id" UUID,
    "action" "audit_action" NOT NULL,
    "resource" TEXT NOT NULL,
    "resource_id" TEXT,
    "old_value" JSONB,
    "new_value" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media" (
    "id" UUID NOT NULL,
    "filename" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "type" "media_type" NOT NULL,
    "usage" "media_usage" NOT NULL DEFAULT 'GENERAL',
    "alt" TEXT,
    "title" TEXT,
    "description" TEXT,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "uploaded_by" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terms_documents" (
    "id" UUID NOT NULL,
    "type" VARCHAR(64) NOT NULL,
    "slug" VARCHAR(50) NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "content_json" JSONB NOT NULL,
    "content_html" TEXT NOT NULL,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMPTZ(6),
    "scopes" "terms_scope"[],
    "changelog" TEXT,
    "show_in_footer" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "terms_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terms_agreements" (
    "id" UUID NOT NULL,
    "terms_id" UUID NOT NULL,
    "customer_id" UUID,
    "guest_email" VARCHAR(254),
    "content_snapshot" TEXT NOT NULL,
    "content_hash" VARCHAR(64) NOT NULL,
    "agreed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scope" "terms_scope" NOT NULL,
    "resource_id" TEXT,
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,

    CONSTRAINT "terms_agreements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "editor_comment_threads" (
    "id" UUID NOT NULL,
    "mark_id" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "content_id" UUID NOT NULL,
    "quoted_text" TEXT NOT NULL,
    "status" "editor_comment_status" NOT NULL DEFAULT 'ACTIVE',
    "resolved_at" TIMESTAMPTZ(6),
    "resolved_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "editor_comment_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "editor_comments" (
    "id" UUID NOT NULL,
    "thread_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMPTZ(6),
    "deleted_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "editor_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "block_templates" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "node_json" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "block_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "space_reviews" (
    "id" UUID NOT NULL,
    "space_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "reservation_id" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "title" VARCHAR(100),
    "comment" VARCHAR(1000),
    "is_published" BOOLEAN NOT NULL DEFAULT true,
    "reply_body" VARCHAR(1000),
    "replied_at" TIMESTAMPTZ(6),
    "replied_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "space_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_time_slots" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "start_at" TIMESTAMPTZ(6) NOT NULL,
    "end_at" TIMESTAMPTZ(6) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "google_calendar_event_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "event_time_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_categories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "color" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "event_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "description_json" JSONB NOT NULL,
    "description_html" TEXT NOT NULL,
    "description_plain_text" TEXT NOT NULL,
    "thumbnail_url" TEXT,
    "ogp_image_url" TEXT,
    "ogp_title" TEXT,
    "ogp_description" TEXT,
    "meta_description" TEXT,
    "meta_keywords" TEXT,
    "address_detail" VARCHAR(200),
    "location_id" UUID,
    "space_id" UUID,
    "status" "event_status" NOT NULL DEFAULT 'DRAFT',
    "schedule_mode" "event_schedule_mode" NOT NULL,
    "registration_open" BOOLEAN NOT NULL DEFAULT true,
    "registration_deadline" TIMESTAMPTZ(6),
    "published_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),
    "deleted_by_id" UUID,
    "gallery" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "first_slot_start_at" TIMESTAMPTZ(6),
    "last_slot_end_at" TIMESTAMPTZ(6),
    "format" "event_format" NOT NULL DEFAULT 'OFFLINE',
    "meeting_url" VARCHAR(500),
    "meeting_provider" "meeting_provider" NOT NULL DEFAULT 'MANUAL',
    "calendar_sync_error" TEXT,
    "category_id" UUID NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_tickets" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "price" INTEGER NOT NULL,
    "capacity" INTEGER,
    "unit_size" INTEGER NOT NULL DEFAULT 1,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "event_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_registrations" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "slot_id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(254),
    "phone" VARCHAR(30),
    "note" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "status" "registration_status" NOT NULL DEFAULT 'CONFIRMED',
    "customer_id" UUID,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancelled_by_type" "cancelled_by",
    "attended_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "ics_sequence" INTEGER NOT NULL DEFAULT 0,
    "waitlisted_at" TIMESTAMPTZ(6),
    "offered_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "reminder_sent_at" TIMESTAMPTZ(6),
    "payment_status" "payment_status" NOT NULL DEFAULT 'UNPAID',
    "stripe_checkout_session_id" TEXT,
    "stripe_payment_intent_id" TEXT,
    "paid_amount" INTEGER,
    "tax_rate" INTEGER,
    "paid_at" TIMESTAMPTZ(6),

    CONSTRAINT "event_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" UUID NOT NULL,
    "reservation_id" UUID,
    "event_registration_id" UUID,
    "amount" INTEGER NOT NULL,
    "reason" TEXT,
    "stripe_refund_id" TEXT NOT NULL,
    "refunded_by_type" "refunded_by_type" NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'succeeded',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipts" (
    "id" UUID NOT NULL,
    "serial_no" VARCHAR(20) NOT NULL,
    "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reservation_id" UUID,
    "event_registration_id" UUID,
    "recipient_name" TEXT NOT NULL,
    "subject" TEXT NOT NULL DEFAULT 'スペース利用料として',
    "amount" INTEGER NOT NULL,
    "tax_amount" INTEGER NOT NULL DEFAULT 0,
    "tax_rate" INTEGER NOT NULL,
    "issuer_snapshot" JSONB NOT NULL,
    "reissued_from_id" UUID,
    "reissued_reason" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt_sequences" (
    "year" INTEGER NOT NULL,
    "next_no" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "receipt_sequences_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "admin_notifications" (
    "id" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "message" VARCHAR(500) NOT NULL,
    "resource_type" VARCHAR(50),
    "resource_id" VARCHAR(36),
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smart_lock_devices" (
    "id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "device_id" TEXT NOT NULL,
    "device_name" TEXT NOT NULL,
    "device_type" "smart_lock_device_type" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "paired_lock_device_id" UUID,
    "last_lock_state" TEXT,
    "last_door_state" TEXT,
    "last_battery" INTEGER,
    "last_state_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "smart_lock_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smart_lock_passcodes" (
    "id" UUID NOT NULL,
    "reservation_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "status" "smart_lock_passcode_status" NOT NULL DEFAULT 'PENDING',
    "passcode_ciphertext" TEXT NOT NULL,
    "switchbot_command_id" TEXT,
    "switchbot_delete_command_id" TEXT,
    "switchbot_key_id" TEXT,
    "start_time" TIMESTAMPTZ(6) NOT NULL,
    "end_time" TIMESTAMPTZ(6) NOT NULL,
    "failure_reason" TEXT,
    "confirmed_at" TIMESTAMPTZ(6),
    "revoke_requested_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "smart_lock_passcodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stripe_events" (
    "id" VARCHAR(80) NOT NULL,
    "type" VARCHAR(80) NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(6),

    CONSTRAINT "stripe_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfer_accounts" (
    "id" UUID NOT NULL,
    "label" VARCHAR(50) NOT NULL,
    "bank_name" VARCHAR(50) NOT NULL,
    "branch_name" VARCHAR(50) NOT NULL,
    "account_type" "transfer_account_type" NOT NULL,
    "account_number" VARCHAR(20) NOT NULL,
    "account_holder_name" VARCHAR(100) NOT NULL,
    "note" VARCHAR(200),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "transfer_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_name_idx" ON "users"("name");

-- CreateIndex
CREATE INDEX "user_page_assignments_page_id_idx" ON "user_page_assignments"("page_id");

-- CreateIndex
CREATE INDEX "accounts_user_id_idx" ON "accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "verifications_identifier_idx" ON "verifications"("identifier");

-- CreateIndex
CREATE INDEX "locations_is_published_is_active_idx" ON "locations"("is_published", "is_active");

-- CreateIndex
CREATE INDEX "locations_sort_order_idx" ON "locations"("sort_order");

-- CreateIndex
CREATE INDEX "locations_gbp_sync_error_idx" ON "locations"("gbp_sync_error");

-- CreateIndex
CREATE INDEX "locations_default_smart_lock_device_id_idx" ON "locations"("default_smart_lock_device_id");

-- CreateIndex
CREATE INDEX "locations_name_trgm_idx" ON "locations" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "locations_address_trgm_idx" ON "locations" USING GIN ("address" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "locations_active_sort_order_key" ON "locations"("sort_order") WHERE ("is_active" = true);

-- CreateIndex
CREATE UNIQUE INDEX "locations_slug_active_key" ON "locations"("slug") WHERE ("is_active" = true);

-- CreateIndex
CREATE UNIQUE INDEX "locations_name_active_key" ON "locations"("name") WHERE ("is_active" = true);

-- CreateIndex
CREATE UNIQUE INDEX "space_categories_name_active_key" ON "space_categories"("name") WHERE ("is_active" = true);

-- CreateIndex
CREATE UNIQUE INDEX "space_categories_sort_order_key" ON "space_categories"("sort_order");

-- CreateIndex
CREATE INDEX "spaces_name_idx" ON "spaces"("name");

-- CreateIndex
CREATE INDEX "spaces_address_detail_idx" ON "spaces"("address_detail");

-- CreateIndex
CREATE INDEX "spaces_is_published_is_active_idx" ON "spaces"("is_published", "is_active");

-- CreateIndex
CREATE INDEX "spaces_published_at_is_active_idx" ON "spaces"("published_at", "is_active");

-- CreateIndex
CREATE INDEX "spaces_location_id_idx" ON "spaces"("location_id");

-- CreateIndex
CREATE INDEX "spaces_category_id_idx" ON "spaces"("category_id");

-- CreateIndex
CREATE INDEX "spaces_smart_lock_device_id_idx" ON "spaces"("smart_lock_device_id");

-- CreateIndex
CREATE INDEX "spaces_name_trgm_idx" ON "spaces" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "spaces_slug_trgm_idx" ON "spaces" USING GIN ("slug" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "spaces_slug_active_key" ON "spaces"("slug") WHERE ("is_active" = true);

-- CreateIndex
CREATE INDEX "space_rate_plans_space_id_updated_at_idx" ON "space_rate_plans"("space_id", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "blocked_dates_scope_start_date_end_date_idx" ON "blocked_dates"("scope", "start_date", "end_date");

-- CreateIndex
CREATE INDEX "blocked_dates_space_id_start_date_end_date_idx" ON "blocked_dates"("space_id", "start_date", "end_date");

-- CreateIndex
CREATE INDEX "blocked_dates_location_id_start_date_end_date_idx" ON "blocked_dates"("location_id", "start_date", "end_date");

-- CreateIndex
CREATE INDEX "blocked_dates_created_by_idx" ON "blocked_dates"("created_by");

-- CreateIndex
CREATE INDEX "reservation_series_space_id_dtstart_idx" ON "reservation_series"("space_id", "dtstart");

-- CreateIndex
CREATE INDEX "reservation_series_customer_id_idx" ON "reservation_series"("customer_id");

-- CreateIndex
CREATE INDEX "reservation_series_created_at_idx" ON "reservation_series"("created_at");

-- CreateIndex
CREATE INDEX "reservation_series_deleted_at_idx" ON "reservation_series"("deleted_at");

-- CreateIndex
CREATE INDEX "reservation_series_deleted_by_id_idx" ON "reservation_series"("deleted_by_id") WHERE ("deleted_by_id" IS NOT NULL);

-- CreateIndex
CREATE INDEX "reservation_series_coupon_id_idx" ON "reservation_series"("coupon_id") WHERE ("coupon_id" IS NOT NULL);

-- CreateIndex
CREATE UNIQUE INDEX "reservation_series_space_dtstart_active_unique" ON "reservation_series"("space_id", "dtstart") WHERE ("deleted_at" IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "reservations_stripe_checkout_session_id_key" ON "reservations"("stripe_checkout_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_stripe_payment_intent_id_key" ON "reservations"("stripe_payment_intent_id");

-- CreateIndex
CREATE INDEX "reservations_user_id_idx" ON "reservations"("user_id");

-- CreateIndex
CREATE INDEX "reservations_start_time_idx" ON "reservations"("start_time");

-- CreateIndex
CREATE INDEX "reservations_end_time_idx" ON "reservations"("end_time");

-- CreateIndex
CREATE INDEX "reservations_status_idx" ON "reservations"("status");

-- CreateIndex
CREATE INDEX "reservations_created_at_idx" ON "reservations"("created_at");

-- CreateIndex
CREATE INDEX "reservations_space_id_start_time_end_time_idx" ON "reservations"("space_id", "start_time", "end_time");

-- CreateIndex
CREATE INDEX "reservations_customer_id_start_time_idx" ON "reservations"("customer_id", "start_time");

-- CreateIndex
CREATE INDEX "reservations_coupon_id_idx" ON "reservations"("coupon_id");

-- CreateIndex
CREATE INDEX "reservations_deleted_at_idx" ON "reservations"("deleted_at");

-- CreateIndex
CREATE INDEX "reservations_payment_status_idx" ON "reservations"("payment_status");

-- CreateIndex
CREATE INDEX "reservations_series_id_recurrence_instance_index_idx" ON "reservations"("series_id", "recurrence_instance_index");

-- CreateIndex
CREATE INDEX "reservations_deleted_by_id_idx" ON "reservations"("deleted_by_id") WHERE ("deleted_by_id" IS NOT NULL);

-- CreateIndex
CREATE INDEX "reservations_price_overridden_by_id_idx" ON "reservations"("price_overridden_by_id") WHERE ("price_overridden_by_id" IS NOT NULL);

-- CreateIndex
CREATE UNIQUE INDEX "customers_user_id_key" ON "customers"("user_id");

-- CreateIndex
CREATE INDEX "customers_first_name_idx" ON "customers"("first_name");

-- CreateIndex
CREATE INDEX "customers_phone_number_idx" ON "customers"("phone_number");

-- CreateIndex
CREATE INDEX "customers_status_idx" ON "customers"("status");

-- CreateIndex
CREATE INDEX "customers_customer_type_idx" ON "customers"("customer_type");

-- CreateIndex
CREATE INDEX "customers_email_canonical_user_id_idx" ON "customers"("email_canonical", "user_id");

-- CreateIndex
CREATE INDEX "customers_is_active_idx" ON "customers"("is_active");

-- CreateIndex
CREATE INDEX "customers_last_reservation_at_idx" ON "customers"("last_reservation_at");

-- CreateIndex
CREATE INDEX "customers_last_name_first_name_idx" ON "customers"("last_name", "first_name");

-- CreateIndex
CREATE INDEX "customers_email_delivery_status_idx" ON "customers"("email_delivery_status");

-- CreateIndex
CREATE INDEX "customers_flagged_for_review_at_idx" ON "customers"("flagged_for_review_at");

-- CreateIndex
CREATE INDEX "customers_last_name_trgm_idx" ON "customers" USING GIN ("last_name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "customers_first_name_trgm_idx" ON "customers" USING GIN ("first_name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "customers_email_trgm_idx" ON "customers" USING GIN ("email" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "customers_company_name_trgm_idx" ON "customers" USING GIN ("company_name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "customers_suppressed_email_hash_idx" ON "customers"("suppressed_email_hash") WHERE ("suppressed_email_hash" IS NOT NULL);

-- CreateIndex
CREATE INDEX "customers_created_at_idx" ON "customers"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "pending_customer_email_changes_token_hash_key" ON "pending_customer_email_changes"("token_hash");

-- CreateIndex
CREATE INDEX "pending_customer_email_changes_customer_id_idx" ON "pending_customer_email_changes"("customer_id");

-- CreateIndex
CREATE INDEX "pending_customer_email_changes_expires_at_idx" ON "pending_customer_email_changes"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "pending_customer_merges_token_hash_key" ON "pending_customer_merges"("token_hash");

-- CreateIndex
CREATE INDEX "pending_customer_merges_target_customer_id_idx" ON "pending_customer_merges"("target_customer_id");

-- CreateIndex
CREATE INDEX "pending_customer_merges_expires_at_idx" ON "pending_customer_merges"("expires_at");

-- CreateIndex
CREATE INDEX "pending_customer_merges_source_customer_id_idx" ON "pending_customer_merges"("source_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "coupons_code_key" ON "coupons"("code");

-- CreateIndex
CREATE INDEX "coupons_valid_from_valid_until_idx" ON "coupons"("valid_from", "valid_until");

-- CreateIndex
CREATE INDEX "coupons_is_active_idx" ON "coupons"("is_active");

-- CreateIndex
CREATE INDEX "coupons_code_trgm_idx" ON "coupons" USING GIN ("code" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "coupons_name_trgm_idx" ON "coupons" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "inquiries_receipt_number_key" ON "inquiries"("receipt_number");

-- CreateIndex
CREATE INDEX "inquiries_email_idx" ON "inquiries"("email");

-- CreateIndex
CREATE INDEX "inquiries_status_idx" ON "inquiries"("status");

-- CreateIndex
CREATE INDEX "inquiries_created_at_status_idx" ON "inquiries"("created_at", "status");

-- CreateIndex
CREATE INDEX "inquiries_customer_id_created_at_idx" ON "inquiries"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "inquiries_customer_id_status_idx" ON "inquiries"("customer_id", "status");

-- CreateIndex
CREATE INDEX "inquiries_assignee_id_idx" ON "inquiries"("assignee_id");

-- CreateIndex
CREATE INDEX "inquiries_deleted_at_idx" ON "inquiries"("deleted_at");

-- CreateIndex
CREATE INDEX "inquiries_sla_expires_at_idx" ON "inquiries"("sla_expires_at");

-- CreateIndex
CREATE INDEX "inquiries_anonymized_at_idx" ON "inquiries"("anonymized_at");

-- CreateIndex
CREATE INDEX "inquiries_name_trgm_idx" ON "inquiries" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "inquiries_email_trgm_idx" ON "inquiries" USING GIN ("email" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "inquiries_subject_trgm_idx" ON "inquiries" USING GIN ("subject" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "inquiry_replies_inquiry_id_created_at_idx" ON "inquiry_replies"("inquiry_id", "created_at");

-- CreateIndex
CREATE INDEX "inquiry_replies_author_id_idx" ON "inquiry_replies"("author_id");

-- CreateIndex
CREATE INDEX "inquiry_replies_author_customer_id_idx" ON "inquiry_replies"("author_customer_id");

-- CreateIndex
CREATE INDEX "inquiry_status_history_inquiry_id_created_at_idx" ON "inquiry_status_history"("inquiry_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "inquiry_attachments_r2_key_key" ON "inquiry_attachments"("r2_key");

-- CreateIndex
CREATE INDEX "inquiry_attachments_inquiry_id_created_at_idx" ON "inquiry_attachments"("inquiry_id", "created_at");

-- CreateIndex
CREATE INDEX "inquiry_attachments_reply_id_idx" ON "inquiry_attachments"("reply_id");

-- CreateIndex
CREATE INDEX "inquiry_attachments_uploaded_by_id_idx" ON "inquiry_attachments"("uploaded_by_id") WHERE ("uploaded_by_id" IS NOT NULL);

-- CreateIndex
CREATE INDEX "inquiry_attachments_uploaded_by_customer_id_idx" ON "inquiry_attachments"("uploaded_by_customer_id") WHERE ("uploaded_by_customer_id" IS NOT NULL);

-- CreateIndex
CREATE INDEX "inquiry_internal_notes_inquiry_id_created_at_idx" ON "inquiry_internal_notes"("inquiry_id", "created_at");

-- CreateIndex
CREATE INDEX "inquiry_internal_notes_author_id_idx" ON "inquiry_internal_notes"("author_id");

-- CreateIndex
CREATE UNIQUE INDEX "inquiry_tags_name_key" ON "inquiry_tags"("name");

-- CreateIndex
CREATE INDEX "inquiry_tag_on_inquiries_tag_id_idx" ON "inquiry_tag_on_inquiries"("tag_id");

-- CreateIndex
CREATE UNIQUE INDEX "news_slug_key" ON "news"("slug");

-- CreateIndex
CREATE INDEX "news_title_idx" ON "news"("title");

-- CreateIndex
CREATE INDEX "news_is_published_published_at_idx" ON "news"("is_published", "published_at");

-- CreateIndex
CREATE INDEX "news_created_at_idx" ON "news"("created_at");

-- CreateIndex
CREATE INDEX "news_title_trgm_idx" ON "news" USING GIN ("title" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "news_slug_trgm_idx" ON "news" USING GIN ("slug" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "announcement_bars_is_active_display_order_idx" ON "announcement_bars"("is_active", "display_order");

-- CreateIndex
CREATE INDEX "announcement_bars_start_at_end_at_idx" ON "announcement_bars"("start_at", "end_at");

-- CreateIndex
CREATE UNIQUE INDEX "announcement_bars_display_order_key" ON "announcement_bars"("display_order");

-- CreateIndex
CREATE INDEX "posts_title_idx" ON "posts"("title");

-- CreateIndex
CREATE INDEX "posts_author_id_idx" ON "posts"("author_id");

-- CreateIndex
CREATE INDEX "posts_status_published_at_idx" ON "posts"("status", "published_at");

-- CreateIndex
CREATE INDEX "posts_category_id_status_published_at_idx" ON "posts"("category_id", "status", "published_at");

-- CreateIndex
CREATE INDEX "posts_view_count_idx" ON "posts"("view_count");

-- CreateIndex
CREATE INDEX "posts_status_view_count_idx" ON "posts"("status", "view_count");

-- CreateIndex
CREATE INDEX "posts_deleted_at_idx" ON "posts"("deleted_at");

-- CreateIndex
CREATE INDEX "posts_title_trgm_idx" ON "posts" USING GIN ("title" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "posts_slug_trgm_idx" ON "posts" USING GIN ("slug" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "posts_created_at_alive_idx" ON "posts"("created_at") WHERE ("deleted_at" IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "posts_slug_active_key" ON "posts"("slug") WHERE ("deleted_at" IS NULL);

-- CreateIndex
CREATE INDEX "post_tag_on_posts_tag_id_idx" ON "post_tag_on_posts"("tag_id");

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
CREATE INDEX "pages_is_published_is_active_idx" ON "pages"("is_published", "is_active");

-- CreateIndex
CREATE INDEX "pages_is_system_page_idx" ON "pages"("is_system_page");

-- CreateIndex
CREATE INDEX "pages_title_trgm_idx" ON "pages" USING GIN ("title" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "pages_slug_trgm_idx" ON "pages" USING GIN ("slug" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "sections_page_id_order_is_active_idx" ON "sections"("page_id", "order", "is_active");

-- CreateIndex
CREATE INDEX "sections_type_idx" ON "sections"("type");

-- CreateIndex
CREATE UNIQUE INDEX "sections_page_id_order_key" ON "sections"("page_id", "order");

-- CreateIndex
CREATE INDEX "navigation_items_parent_id_idx" ON "navigation_items"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "navigation_items_type_order_key" ON "navigation_items"("type", "order");

-- CreateIndex
CREATE UNIQUE INDEX "social_links_order_key" ON "social_links"("order");

-- CreateIndex
CREATE INDEX "faq_categories_order_idx" ON "faq_categories"("order");

-- CreateIndex
CREATE INDEX "faq_categories_is_active_order_idx" ON "faq_categories"("is_active", "order");

-- CreateIndex
CREATE INDEX "faq_categories_deleted_at_idx" ON "faq_categories"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "faq_categories_slug_active_key" ON "faq_categories"("slug") WHERE ("deleted_at" IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "faq_categories_order_active_key" ON "faq_categories"("order") WHERE ("deleted_at" IS NULL);

-- CreateIndex
CREATE INDEX "faq_items_category_id_order_idx" ON "faq_items"("category_id", "order");

-- CreateIndex
CREATE INDEX "faq_items_category_id_is_published_order_idx" ON "faq_items"("category_id", "is_published", "order");

-- CreateIndex
CREATE INDEX "faq_items_is_published_idx" ON "faq_items"("is_published");

-- CreateIndex
CREATE INDEX "faq_items_deleted_at_idx" ON "faq_items"("deleted_at");

-- CreateIndex
CREATE INDEX "faq_items_updated_at_idx" ON "faq_items"("updated_at");

-- CreateIndex
CREATE INDEX "faq_items_view_count_idx" ON "faq_items"("view_count");

-- CreateIndex
CREATE INDEX "faq_items_question_trgm_idx" ON "faq_items" USING GIN ("question" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "faq_items_answer_trgm_idx" ON "faq_items" USING GIN ("answer" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "faq_items_category_id_order_active_key" ON "faq_items"("category_id", "order") WHERE ("deleted_at" IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "instagram_posts_post_id_key" ON "instagram_posts"("post_id");

-- CreateIndex
CREATE UNIQUE INDEX "instagram_posts_sort_order_key" ON "instagram_posts"("sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "audit_logs_sequence_key" ON "audit_logs"("sequence");

-- CreateIndex
CREATE INDEX "audit_logs_resource_resource_id_idx" ON "audit_logs"("resource", "resource_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_hash_key_id_sequence_idx" ON "audit_logs"("hash_key_id", "sequence");

-- CreateIndex
CREATE INDEX "media_type_usage_idx" ON "media"("type", "usage");

-- CreateIndex
CREATE INDEX "media_uploaded_by_idx" ON "media"("uploaded_by");

-- CreateIndex
CREATE INDEX "media_is_active_created_at_idx" ON "media"("is_active", "created_at");

-- CreateIndex
CREATE INDEX "media_mime_type_idx" ON "media"("mime_type");

-- CreateIndex
CREATE INDEX "terms_documents_type_idx" ON "terms_documents"("type");

-- CreateIndex
CREATE INDEX "terms_documents_deleted_at_is_published_idx" ON "terms_documents"("deleted_at", "is_published");

-- CreateIndex
CREATE INDEX "terms_documents_show_in_footer_is_published_display_order_idx" ON "terms_documents"("show_in_footer", "is_published", "display_order");

-- CreateIndex
CREATE UNIQUE INDEX "terms_documents_slug_active_key" ON "terms_documents"("slug") WHERE ("deleted_at" IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "terms_documents_display_order_active_key" ON "terms_documents"("display_order") WHERE ("deleted_at" IS NULL);

-- CreateIndex
CREATE INDEX "terms_agreements_terms_id_idx" ON "terms_agreements"("terms_id");

-- CreateIndex
CREATE INDEX "terms_agreements_customer_id_idx" ON "terms_agreements"("customer_id");

-- CreateIndex
CREATE INDEX "terms_agreements_resource_id_idx" ON "terms_agreements"("resource_id");

-- CreateIndex
CREATE INDEX "terms_agreements_agreed_at_idx" ON "terms_agreements"("agreed_at");

-- CreateIndex
CREATE INDEX "terms_agreements_scope_agreed_at_idx" ON "terms_agreements"("scope", "agreed_at");

-- CreateIndex
CREATE INDEX "terms_agreements_guest_email_trgm_idx" ON "terms_agreements" USING GIN ("guest_email" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "editor_comment_threads_content_type_content_id_status_idx" ON "editor_comment_threads"("content_type", "content_id", "status");

-- CreateIndex
CREATE INDEX "editor_comment_threads_created_by_idx" ON "editor_comment_threads"("created_by");

-- CreateIndex
CREATE INDEX "editor_comment_threads_status_created_at_idx" ON "editor_comment_threads"("status", "created_at");

-- CreateIndex
CREATE INDEX "editor_comment_threads_resolved_by_idx" ON "editor_comment_threads"("resolved_by") WHERE ("resolved_by" IS NOT NULL);

-- CreateIndex
CREATE UNIQUE INDEX "editor_comment_threads_mark_id_content_type_content_id_key" ON "editor_comment_threads"("mark_id", "content_type", "content_id");

-- CreateIndex
CREATE INDEX "editor_comments_thread_id_created_at_idx" ON "editor_comments"("thread_id", "created_at");

-- CreateIndex
CREATE INDEX "editor_comments_created_by_idx" ON "editor_comments"("created_by");

-- CreateIndex
CREATE INDEX "editor_comments_is_deleted_idx" ON "editor_comments"("is_deleted");

-- CreateIndex
CREATE INDEX "editor_comments_deleted_by_idx" ON "editor_comments"("deleted_by") WHERE ("deleted_by" IS NOT NULL);

-- CreateIndex
CREATE INDEX "block_templates_created_by_idx" ON "block_templates"("created_by");

-- CreateIndex
CREATE INDEX "block_templates_created_at_idx" ON "block_templates"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "space_reviews_reservation_id_key" ON "space_reviews"("reservation_id");

-- CreateIndex
CREATE INDEX "space_reviews_space_id_is_published_created_at_idx" ON "space_reviews"("space_id", "is_published", "created_at" DESC);

-- CreateIndex
CREATE INDEX "space_reviews_customer_id_idx" ON "space_reviews"("customer_id");

-- CreateIndex
CREATE INDEX "space_reviews_replied_by_id_idx" ON "space_reviews"("replied_by_id");

-- CreateIndex
CREATE INDEX "event_time_slots_time_range_idx" ON "event_time_slots"("start_at", "end_at");

-- CreateIndex
CREATE UNIQUE INDEX "event_time_slots_event_id_start_at_key" ON "event_time_slots"("event_id", "start_at");

-- CreateIndex
CREATE UNIQUE INDEX "event_categories_name_active_key" ON "event_categories"("name") WHERE ("is_active" = true);

-- CreateIndex
CREATE UNIQUE INDEX "event_categories_sort_order_key" ON "event_categories"("sort_order");

-- CreateIndex
CREATE INDEX "events_status_idx" ON "events"("status");

-- CreateIndex
CREATE INDEX "events_category_id_idx" ON "events"("category_id");

-- CreateIndex
CREATE INDEX "events_location_id_idx" ON "events"("location_id");

-- CreateIndex
CREATE INDEX "events_space_id_idx" ON "events"("space_id");

-- CreateIndex
CREATE INDEX "events_deleted_at_idx" ON "events"("deleted_at");

-- CreateIndex
CREATE INDEX "events_first_slot_start_at_idx" ON "events"("first_slot_start_at");

-- CreateIndex
CREATE INDEX "events_last_slot_end_at_idx" ON "events"("last_slot_end_at");

-- CreateIndex
CREATE INDEX "events_title_trgm_idx" ON "events" USING GIN ("title" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "events_slug_trgm_idx" ON "events" USING GIN ("slug" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "events_space_id_alive_idx" ON "events"("space_id") WHERE ("deleted_at" IS NULL AND "space_id" IS NOT NULL);

-- CreateIndex
CREATE INDEX "events_deleted_by_id_idx" ON "events"("deleted_by_id") WHERE ("deleted_by_id" IS NOT NULL);

-- CreateIndex
CREATE UNIQUE INDEX "events_slug_active_key" ON "events"("slug") WHERE ("deleted_at" IS NULL);

-- CreateIndex
CREATE INDEX "event_tickets_event_id_is_available_idx" ON "event_tickets"("event_id", "is_available");

-- CreateIndex
CREATE UNIQUE INDEX "event_tickets_event_id_sort_order_key" ON "event_tickets"("event_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "event_registrations_stripe_checkout_session_id_key" ON "event_registrations"("stripe_checkout_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_registrations_stripe_payment_intent_id_key" ON "event_registrations"("stripe_payment_intent_id");

-- CreateIndex
CREATE INDEX "event_registrations_slot_id_status_idx" ON "event_registrations"("slot_id", "status");

-- CreateIndex
CREATE INDEX "event_registrations_ticket_id_idx" ON "event_registrations"("ticket_id");

-- CreateIndex
CREATE INDEX "event_registrations_customer_id_idx" ON "event_registrations"("customer_id");

-- CreateIndex
CREATE INDEX "event_registrations_event_id_status_created_at_idx" ON "event_registrations"("event_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "event_registrations_event_id_attended_at_idx" ON "event_registrations"("event_id", "attended_at");

-- CreateIndex
CREATE INDEX "event_registrations_payment_status_idx" ON "event_registrations"("payment_status");

-- CreateIndex
CREATE INDEX "event_registrations_slot_id_ticket_id_status_waitlisted_at_idx" ON "event_registrations"("slot_id", "ticket_id", "status", "waitlisted_at");

-- CreateIndex
CREATE INDEX "event_registrations_status_expires_at_idx" ON "event_registrations"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_stripe_refund_id_key" ON "refunds"("stripe_refund_id");

-- CreateIndex
CREATE INDEX "refunds_reservation_id_idx" ON "refunds"("reservation_id");

-- CreateIndex
CREATE INDEX "refunds_event_registration_id_idx" ON "refunds"("event_registration_id");

-- CreateIndex
CREATE INDEX "refunds_created_at_idx" ON "refunds"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_serial_no_key" ON "receipts"("serial_no");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_reservation_id_key" ON "receipts"("reservation_id");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_event_registration_id_key" ON "receipts"("event_registration_id");

-- CreateIndex
CREATE INDEX "receipts_issued_at_idx" ON "receipts"("issued_at");

-- CreateIndex
CREATE INDEX "receipts_reissued_from_id_idx" ON "receipts"("reissued_from_id") WHERE ("reissued_from_id" IS NOT NULL);

-- CreateIndex
CREATE INDEX "admin_notifications_is_read_created_at_idx" ON "admin_notifications"("is_read", "created_at" DESC);

-- CreateIndex
CREATE INDEX "admin_notifications_type_idx" ON "admin_notifications"("type");

-- CreateIndex
CREATE INDEX "admin_notifications_created_at_idx" ON "admin_notifications"("created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "smart_lock_devices_device_id_key" ON "smart_lock_devices"("device_id");

-- CreateIndex
CREATE INDEX "smart_lock_devices_location_id_idx" ON "smart_lock_devices"("location_id");

-- CreateIndex
CREATE INDEX "smart_lock_devices_paired_lock_device_id_idx" ON "smart_lock_devices"("paired_lock_device_id") WHERE ("paired_lock_device_id" IS NOT NULL);

-- CreateIndex
CREATE INDEX "smart_lock_passcodes_status_end_time_idx" ON "smart_lock_passcodes"("status", "end_time");

-- CreateIndex
CREATE INDEX "smart_lock_passcodes_status_revoke_requested_at_idx" ON "smart_lock_passcodes"("status", "revoke_requested_at");

-- CreateIndex
CREATE INDEX "smart_lock_passcodes_device_id_idx" ON "smart_lock_passcodes"("device_id");

-- CreateIndex
CREATE UNIQUE INDEX "smart_lock_passcodes_reservation_id_device_id_key" ON "smart_lock_passcodes"("reservation_id", "device_id");

-- CreateIndex
CREATE INDEX "stripe_events_received_at_idx" ON "stripe_events"("received_at");

-- CreateIndex
CREATE INDEX "transfer_accounts_is_active_sort_order_idx" ON "transfer_accounts"("is_active", "sort_order");

-- AddForeignKey
ALTER TABLE "user_page_assignments" ADD CONSTRAINT "user_page_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_page_assignments" ADD CONSTRAINT "user_page_assignments_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_default_smart_lock_device_id_fkey" FOREIGN KEY ("default_smart_lock_device_id") REFERENCES "smart_lock_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "space_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_smart_lock_device_id_fkey" FOREIGN KEY ("smart_lock_device_id") REFERENCES "smart_lock_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "space_rate_plans" ADD CONSTRAINT "space_rate_plans_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocked_dates" ADD CONSTRAINT "blocked_dates_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocked_dates" ADD CONSTRAINT "blocked_dates_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocked_dates" ADD CONSTRAINT "blocked_dates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_series" ADD CONSTRAINT "reservation_series_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_series" ADD CONSTRAINT "reservation_series_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_series" ADD CONSTRAINT "reservation_series_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_series" ADD CONSTRAINT "reservation_series_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_price_overridden_by_id_fkey" FOREIGN KEY ("price_overridden_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "reservation_series"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_customer_email_changes" ADD CONSTRAINT "pending_customer_email_changes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_customer_merges" ADD CONSTRAINT "pending_customer_merges_target_customer_id_fkey" FOREIGN KEY ("target_customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_customer_merges" ADD CONSTRAINT "pending_customer_merges_source_customer_id_fkey" FOREIGN KEY ("source_customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiry_replies" ADD CONSTRAINT "inquiry_replies_inquiry_id_fkey" FOREIGN KEY ("inquiry_id") REFERENCES "inquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiry_replies" ADD CONSTRAINT "inquiry_replies_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiry_replies" ADD CONSTRAINT "inquiry_replies_author_customer_id_fkey" FOREIGN KEY ("author_customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiry_status_history" ADD CONSTRAINT "inquiry_status_history_inquiry_id_fkey" FOREIGN KEY ("inquiry_id") REFERENCES "inquiries"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "inquiry_attachments" ADD CONSTRAINT "inquiry_attachments_inquiry_id_fkey" FOREIGN KEY ("inquiry_id") REFERENCES "inquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiry_attachments" ADD CONSTRAINT "inquiry_attachments_reply_id_fkey" FOREIGN KEY ("reply_id") REFERENCES "inquiry_replies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiry_attachments" ADD CONSTRAINT "inquiry_attachments_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiry_attachments" ADD CONSTRAINT "inquiry_attachments_uploaded_by_customer_id_fkey" FOREIGN KEY ("uploaded_by_customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiry_internal_notes" ADD CONSTRAINT "inquiry_internal_notes_inquiry_id_fkey" FOREIGN KEY ("inquiry_id") REFERENCES "inquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiry_internal_notes" ADD CONSTRAINT "inquiry_internal_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiry_tag_on_inquiries" ADD CONSTRAINT "inquiry_tag_on_inquiries_inquiry_id_fkey" FOREIGN KEY ("inquiry_id") REFERENCES "inquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiry_tag_on_inquiries" ADD CONSTRAINT "inquiry_tag_on_inquiries_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "inquiry_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "post_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_tag_on_posts" ADD CONSTRAINT "post_tag_on_posts_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_tag_on_posts" ADD CONSTRAINT "post_tag_on_posts_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "post_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "navigation_items" ADD CONSTRAINT "navigation_items_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "navigation_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faq_items" ADD CONSTRAINT "faq_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "faq_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terms_agreements" ADD CONSTRAINT "terms_agreements_terms_id_fkey" FOREIGN KEY ("terms_id") REFERENCES "terms_documents"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "editor_comment_threads" ADD CONSTRAINT "editor_comment_threads_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "editor_comment_threads" ADD CONSTRAINT "editor_comment_threads_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "editor_comments" ADD CONSTRAINT "editor_comments_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "editor_comment_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "editor_comments" ADD CONSTRAINT "editor_comments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "editor_comments" ADD CONSTRAINT "editor_comments_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "block_templates" ADD CONSTRAINT "block_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "space_reviews" ADD CONSTRAINT "space_reviews_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "space_reviews" ADD CONSTRAINT "space_reviews_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "space_reviews" ADD CONSTRAINT "space_reviews_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "space_reviews" ADD CONSTRAINT "space_reviews_replied_by_id_fkey" FOREIGN KEY ("replied_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_time_slots" ADD CONSTRAINT "event_time_slots_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "event_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_tickets" ADD CONSTRAINT "event_tickets_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "event_time_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "event_tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_event_registration_id_fkey" FOREIGN KEY ("event_registration_id") REFERENCES "event_registrations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_event_registration_id_fkey" FOREIGN KEY ("event_registration_id") REFERENCES "event_registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_reissued_from_id_fkey" FOREIGN KEY ("reissued_from_id") REFERENCES "receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smart_lock_devices" ADD CONSTRAINT "smart_lock_devices_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smart_lock_devices" ADD CONSTRAINT "smart_lock_devices_paired_lock_device_id_fkey" FOREIGN KEY ("paired_lock_device_id") REFERENCES "smart_lock_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smart_lock_passcodes" ADD CONSTRAINT "smart_lock_passcodes_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smart_lock_passcodes" ADD CONSTRAINT "smart_lock_passcodes_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "smart_lock_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- baseline invariants — Prisma DSL で表現できない不変条件
-- ============================================================================
--
-- **このファイルは生成物。手で編集しない。**
--   bun scripts/build-baseline-invariants.ts --url <全 migration 適用済み DB> --force
--
-- `prisma migrate diff --from-empty --to-schema` が出す DDL には CHECK 制約・
-- EXCLUDE 制約・plpgsql 関数・trigger が一切含まれない（Prisma のスキーマ言語が
-- それらを表現できないため）。migration 履歴を 1 本の baseline へ畳むと黙って消える。
--
-- `scripts/build-baseline-migration.ts` が生成 DDL の**後ろ**に連結する。extension だけは
-- GIN index より前に要るので別ファイル（`extensions.sql`）で prelude として先に流す。
--
-- ## 順序
--
-- NOT NULL → CHECK → 関数 → EXCLUDE → trigger。trigger は関数が先に無いと作れない。
-- ============================================================================


-- ===== スカラー配列列の NOT NULL (3) =====
--
-- Prisma は `String[]` に NOT NULL を出さない（Prisma 側の型が非 null なので
-- クライアントが null を書かない前提）。落とすと Prisma 経由以外の書込で null が
-- 入る余地が開く。

ALTER TABLE "settings_notification" ALTER COLUMN "notification_email_addresses" SET NOT NULL;
ALTER TABLE "settings_notification" ALTER COLUMN "notification_staff_ids" SET NOT NULL;
ALTER TABLE "settings_stripe" ALTER COLUMN "stripe_payment_method_types" SET NOT NULL;

-- ===== CHECK 制約 (155) =====

ALTER TABLE "announcement_bars" ADD CONSTRAINT "announcement_bars_display_order_position_check" CHECK (((display_order >= 0) OR (display_order <= '-1000000'::integer)));
ALTER TABLE "announcement_bars" ADD CONSTRAINT "announcement_bars_message_array_check" CHECK (((message IS NULL) OR (jsonb_typeof(message) = 'array'::text)));
ALTER TABLE "announcement_bars" ADD CONSTRAINT "announcement_bars_period_order_check" CHECK (((start_at IS NULL) OR (end_at IS NULL) OR (start_at <= end_at)));
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_chain_version_check" CHECK ((chain_version = 1));
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_entry_hash_hex_check" CHECK ((entry_hash ~ '^[0-9a-f]{64}$'::text));
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_hash_algorithm_check" CHECK (((hash_algorithm)::text = 'HMAC-SHA256'::text));
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_hash_key_id_check" CHECK (((hash_key_id)::text ~ '^[A-Za-z0-9_-]{1,32}$'::text));
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_metadata_object_check" CHECK (((metadata IS NULL) OR (jsonb_typeof(metadata) = 'object'::text)));
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_previous_hash_hex_check" CHECK ((previous_hash ~ '^[0-9a-f]{64}$'::text));
ALTER TABLE "block_templates" ADD CONSTRAINT "block_templates_node_json_object_check" CHECK ((jsonb_typeof(node_json) = 'object'::text));
ALTER TABLE "blocked_dates" ADD CONSTRAINT "blocked_dates_date_order_check" CHECK ((start_date <= end_date));
ALTER TABLE "blocked_dates" ADD CONSTRAINT "blocked_dates_scope_target_check" CHECK (((((scope)::text = 'SPACE'::text) AND (space_id IS NOT NULL) AND (location_id IS NULL)) OR (((scope)::text = 'LOCATION'::text) AND (location_id IS NOT NULL) AND (space_id IS NULL)) OR (((scope)::text = 'GLOBAL'::text) AND (space_id IS NULL) AND (location_id IS NULL))));
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_amount_bounds_check" CHECK ((((max_discount_amount IS NULL) OR (max_discount_amount > 0)) AND ((min_reservation_amount IS NULL) OR (min_reservation_amount >= 0))));
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_discount_value_range_check" CHECK (((discount_value > 0) AND ((type <> 'PERCENTAGE'::coupon_type) OR (discount_value <= 100))));
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_usage_range_check" CHECK (((usage_count >= 0) AND ((usage_limit IS NULL) OR (usage_limit >= 1))));
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_validity_order_check" CHECK (((valid_until IS NULL) OR (valid_from <= valid_until)));
ALTER TABLE "customers" ADD CONSTRAINT "customers_email_canonical_not_empty_check" CHECK ((btrim((email_canonical)::text) <> ''::text));
ALTER TABLE "customers" ADD CONSTRAINT "customers_total_reservations_non_negative_check" CHECK ((total_reservations >= 0));
ALTER TABLE "customers" ADD CONSTRAINT "customers_total_spent_non_negative_check" CHECK ((total_spent >= 0));
ALTER TABLE "event_categories" ADD CONSTRAINT "event_categories_sort_order_position_check" CHECK (((sort_order >= 0) OR (sort_order <= '-1000000'::integer)));
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_ics_sequence_non_negative_check" CHECK ((ics_sequence >= 0));
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_paid_amount_non_negative_check" CHECK ((paid_amount >= 0));
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_quantity_positive" CHECK ((quantity >= 1));
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_tax_rate_range_check" CHECK (((tax_rate IS NULL) OR ((tax_rate >= 0) AND (tax_rate <= 100))));
ALTER TABLE "event_tickets" ADD CONSTRAINT "event_tickets_capacity_positive_or_null" CHECK (((capacity IS NULL) OR (capacity >= 1)));
ALTER TABLE "event_tickets" ADD CONSTRAINT "event_tickets_price_non_negative" CHECK ((price >= 0));
ALTER TABLE "event_tickets" ADD CONSTRAINT "event_tickets_sort_order_position_check" CHECK (((sort_order >= 0) OR (sort_order <= '-1000000'::integer)));
ALTER TABLE "event_tickets" ADD CONSTRAINT "event_tickets_unit_size_positive" CHECK ((unit_size >= 1));
ALTER TABLE "event_time_slots" ADD CONSTRAINT "event_time_slots_capacity_positive" CHECK ((capacity >= 1));
ALTER TABLE "event_time_slots" ADD CONSTRAINT "event_time_slots_time_order" CHECK ((start_at < end_at));
ALTER TABLE "events" ADD CONSTRAINT "event_online_meeting_url_required" CHECK (((format = 'OFFLINE'::event_format) OR (meeting_provider = 'GOOGLE_MEET'::meeting_provider) OR ((meeting_url IS NOT NULL) AND ((meeting_url)::text ~ '^https://'::text))));
ALTER TABLE "events" ADD CONSTRAINT "events_description_json_object_check" CHECK ((jsonb_typeof(description_json) = 'object'::text));
ALTER TABLE "events" ADD CONSTRAINT "events_gallery_array_check" CHECK (((gallery IS NULL) OR (jsonb_typeof(gallery) = 'array'::text)));
ALTER TABLE "events" ADD CONSTRAINT "events_slot_span_order_check" CHECK (((first_slot_start_at IS NULL) OR (last_slot_end_at IS NULL) OR (first_slot_start_at <= last_slot_end_at)));
ALTER TABLE "faq_categories" ADD CONSTRAINT "faq_categories_order_position_check" CHECK ((("order" >= 0) OR ("order" <= '-1000000'::integer)));
ALTER TABLE "faq_items" ADD CONSTRAINT "faq_items_helpful_count_non_negative_check" CHECK ((helpful_count >= 0));
ALTER TABLE "faq_items" ADD CONSTRAINT "faq_items_not_helpful_count_non_negative_check" CHECK ((not_helpful_count >= 0));
ALTER TABLE "faq_items" ADD CONSTRAINT "faq_items_order_position_check" CHECK ((("order" >= 0) OR ("order" <= '-1000000'::integer)));
ALTER TABLE "faq_items" ADD CONSTRAINT "faq_items_view_count_non_negative_check" CHECK ((view_count >= 0));
ALTER TABLE "inquiry_attachments" ADD CONSTRAINT "inquiry_attachments_size_bytes_non_negative_check" CHECK ((size_bytes >= 0));
ALTER TABLE "inquiry_attachments" ADD CONSTRAINT "inquiry_attachments_uploader_side_check" CHECK ((((uploaded_by_id IS NOT NULL) AND (uploaded_by_customer_id IS NULL)) OR ((uploaded_by_customer_id IS NOT NULL) AND (uploaded_by_id IS NULL))));
ALTER TABLE "inquiry_replies" ADD CONSTRAINT "inquiry_replies_author_side_check" CHECK ((((author_type = 'STAFF'::inquiry_reply_author_type) AND (author_id IS NOT NULL) AND (author_customer_id IS NULL)) OR ((author_type = 'CUSTOMER'::inquiry_reply_author_type) AND (author_customer_id IS NOT NULL) AND (author_id IS NULL))));
ALTER TABLE "instagram_posts" ADD CONSTRAINT "instagram_posts_sort_order_position_check" CHECK (((sort_order >= 0) OR (sort_order <= '-1000000'::integer)));
ALTER TABLE "locations" ADD CONSTRAINT "locations_access_lines_array_check" CHECK (((access_lines IS NULL) OR (jsonb_typeof(access_lines) = 'array'::text)));
ALTER TABLE "locations" ADD CONSTRAINT "locations_amenities_object_check" CHECK ((jsonb_typeof(amenities) = 'object'::text));
ALTER TABLE "locations" ADD CONSTRAINT "locations_business_hours_object_check" CHECK (((business_hours IS NULL) OR (jsonb_typeof(business_hours) = 'object'::text)));
ALTER TABLE "locations" ADD CONSTRAINT "locations_image_urls_array_check" CHECK (((image_urls IS NULL) OR (jsonb_typeof(image_urls) = 'array'::text)));
ALTER TABLE "locations" ADD CONSTRAINT "locations_latitude_range_check" CHECK (((latitude >= ('-90'::integer)::double precision) AND (latitude <= (90)::double precision)));
ALTER TABLE "locations" ADD CONSTRAINT "locations_longitude_range_check" CHECK (((longitude >= ('-180'::integer)::double precision) AND (longitude <= (180)::double precision)));
ALTER TABLE "locations" ADD CONSTRAINT "locations_sort_order_position_check" CHECK (((sort_order >= 0) OR (sort_order <= '-1000000'::integer)));
ALTER TABLE "media" ADD CONSTRAINT "media_height_non_negative_check" CHECK ((height >= 0));
ALTER TABLE "media" ADD CONSTRAINT "media_size_non_negative_check" CHECK ((size >= 0));
ALTER TABLE "media" ADD CONSTRAINT "media_tags_array_check" CHECK (((tags IS NULL) OR (jsonb_typeof(tags) = 'array'::text)));
ALTER TABLE "media" ADD CONSTRAINT "media_width_non_negative_check" CHECK ((width >= 0));
ALTER TABLE "navigation_items" ADD CONSTRAINT "navigation_items_label_array_check" CHECK ((jsonb_typeof(label) = 'array'::text));
ALTER TABLE "navigation_items" ADD CONSTRAINT "navigation_items_order_position_check" CHECK ((("order" >= 0) OR ("order" <= '-1000000'::integer)));
ALTER TABLE "news" ADD CONSTRAINT "news_content_json_object_check" CHECK (((content_json IS NULL) OR (jsonb_typeof(content_json) = 'object'::text)));
ALTER TABLE "news" ADD CONSTRAINT "news_content_width_custom_positive_check" CHECK ((content_width_custom > 0));
ALTER TABLE "post_categories" ADD CONSTRAINT "post_categories_order_position_check" CHECK ((("order" >= 0) OR ("order" <= '-1000000'::integer)));
ALTER TABLE "posts" ADD CONSTRAINT "posts_content_json_object_check" CHECK (((content_json IS NULL) OR (jsonb_typeof(content_json) = 'object'::text)));
ALTER TABLE "posts" ADD CONSTRAINT "posts_content_width_custom_positive_check" CHECK ((content_width_custom > 0));
ALTER TABLE "posts" ADD CONSTRAINT "posts_view_count_non_negative_check" CHECK ((view_count >= 0));
ALTER TABLE "receipt_sequences" ADD CONSTRAINT "receipt_sequences_next_no_positive_check" CHECK ((next_no > 0));
ALTER TABLE "receipt_sequences" ADD CONSTRAINT "receipt_sequences_year_range_check" CHECK (((year >= 2000) AND (year <= 9999)));
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_issuer_snapshot_object_check" CHECK ((jsonb_typeof(issuer_snapshot) = 'object'::text));
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_money_non_negative_check" CHECK (((amount >= 0) AND (tax_amount >= 0)));
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_revision_non_negative_check" CHECK ((revision >= 0));
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_target_exclusive_check" CHECK ((NOT ((reservation_id IS NOT NULL) AND (event_registration_id IS NOT NULL))));
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_tax_rate_range_check" CHECK (((tax_rate >= 0) AND (tax_rate <= 100)));
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_tax_within_amount_check" CHECK ((tax_amount <= amount));
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_amount_positive_check" CHECK ((amount >= 1));
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_status_check" CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('requires_action'::character varying)::text, ('succeeded'::character varying)::text, ('failed'::character varying)::text, ('canceled'::character varying)::text])));
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_target_check" CHECK ((((reservation_id IS NOT NULL) AND (event_registration_id IS NULL)) OR ((reservation_id IS NULL) AND (event_registration_id IS NOT NULL))));
ALTER TABLE "reservation_series" ADD CONSTRAINT "reservation_series_agreement_snapshot_array_check" CHECK ((jsonb_typeof(agreement_snapshot) = 'array'::text));
ALTER TABLE "reservation_series" ADD CONSTRAINT "reservation_series_duration_positive_check" CHECK ((duration > 0));
ALTER TABLE "reservation_series" ADD CONSTRAINT "reservation_series_instance_count_positive_check" CHECK ((instance_count > 0));
ALTER TABLE "reservation_series" ADD CONSTRAINT "reservation_series_template_data_object_check" CHECK ((jsonb_typeof(template_data) = 'object'::text));
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_ics_sequence_non_negative_check" CHECK ((ics_sequence >= 0));
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_money_non_negative_check" CHECK (((base_price >= 0) AND (total_price >= 0) AND (tax_amount >= 0) AND (total_price_with_tax >= 0) AND ((coupon_discount_amount IS NULL) OR (coupon_discount_amount >= 0)) AND ((duration_discount_amount IS NULL) OR (duration_discount_amount >= 0)) AND ((space_discount_amount IS NULL) OR (space_discount_amount >= 0))));
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_number_of_guests_positive_check" CHECK (((number_of_guests IS NULL) OR (number_of_guests >= 1)));
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_rate_breakdown_object_check" CHECK ((jsonb_typeof(rate_breakdown_json) = 'object'::text));
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_recurrence_instance_index_non_negative_check" CHECK ((recurrence_instance_index >= 0));
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_tax_amount_derivation_check" CHECK (((tax_amount)::numeric = round((((total_price)::numeric * (tax_rate)::numeric) / (100)::numeric))));
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_tax_rate_range_check" CHECK (((tax_rate >= 0) AND (tax_rate <= 100)));
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_tax_total_derivation_check" CHECK ((total_price_with_tax = (total_price + tax_amount)));
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_time_order_check" CHECK ((start_time < end_time));
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_total_price_breakdown_check" CHECK ((total_price = (GREATEST(0, (((base_price - COALESCE(coupon_discount_amount, 0)) - COALESCE(duration_discount_amount, 0)) - COALESCE(space_discount_amount, 0))) + COALESCE(manual_adjustment_amount, 0))));
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_version_non_negative_check" CHECK ((version >= 0));
ALTER TABLE "sections" ADD CONSTRAINT "sections_config_object_check" CHECK ((jsonb_typeof(config) = 'object'::text));
ALTER TABLE "sections" ADD CONSTRAINT "sections_order_position_check" CHECK ((("order" >= '-1'::integer) OR ("order" <= '-1000000'::integer)));
ALTER TABLE "settings_analytics" ADD CONSTRAINT "settings_analytics_singleton_check" CHECK ((id = 'singleton'::text));
ALTER TABLE "settings_announcement_carousel" ADD CONSTRAINT "settings_announcement_carousel_duration_positive_check" CHECK ((duration > 0));
ALTER TABLE "settings_announcement_carousel" ADD CONSTRAINT "settings_announcement_carousel_singleton_check" CHECK ((id = 'singleton'::text));
ALTER TABLE "settings_commerce" ADD CONSTRAINT "settings_commerce_duration_discount_rules_array_check" CHECK ((jsonb_typeof(duration_discount_rules) = 'array'::text));
ALTER TABLE "settings_commerce" ADD CONSTRAINT "settings_commerce_refund_policy_object_check" CHECK (((refund_policy IS NULL) OR (jsonb_typeof(refund_policy) = 'object'::text)));
ALTER TABLE "settings_commerce" ADD CONSTRAINT "settings_commerce_singleton_check" CHECK ((id = 'singleton'::text));
ALTER TABLE "settings_commerce" ADD CONSTRAINT "settings_commerce_tax_reduced_rate_range_check" CHECK (((tax_reduced_rate >= 0) AND (tax_reduced_rate <= 100)));
ALTER TABLE "settings_commerce" ADD CONSTRAINT "settings_commerce_tax_standard_rate_range_check" CHECK (((tax_standard_rate >= 0) AND (tax_standard_rate <= 100)));
ALTER TABLE "settings_data_retention" ADD CONSTRAINT "settings_data_retention_object_check" CHECK ((jsonb_typeof(data_retention) = 'object'::text));
ALTER TABLE "settings_data_retention" ADD CONSTRAINT "settings_data_retention_singleton_check" CHECK ((id = 'singleton'::text));
ALTER TABLE "settings_features" ADD CONSTRAINT "settings_features_modules_object_check" CHECK ((jsonb_typeof(feature_modules) = 'object'::text));
ALTER TABLE "settings_features" ADD CONSTRAINT "settings_features_singleton_check" CHECK ((id = 'singleton'::text));
ALTER TABLE "settings_google_business_profile" ADD CONSTRAINT "settings_gbp_auth_object_check" CHECK (((google_business_profile_auth IS NULL) OR (jsonb_typeof(google_business_profile_auth) = 'object'::text)));
ALTER TABLE "settings_google_business_profile" ADD CONSTRAINT "settings_google_business_profile_singleton_check" CHECK ((id = 'singleton'::text));
ALTER TABLE "settings_google_calendar" ADD CONSTRAINT "settings_google_calendar_reminder_minutes_non_negative_check" CHECK ((google_calendar_reminder_minutes >= 0));
ALTER TABLE "settings_google_calendar" ADD CONSTRAINT "settings_google_calendar_singleton_check" CHECK ((id = 'singleton'::text));
ALTER TABLE "settings_google_maps" ADD CONSTRAINT "settings_google_maps_singleton_check" CHECK ((id = 'singleton'::text));
ALTER TABLE "settings_instagram" ADD CONSTRAINT "settings_instagram_singleton_check" CHECK ((id = 'singleton'::text));
ALTER TABLE "settings_layout" ADD CONSTRAINT "settings_layout_container_width_custom_positive_check" CHECK ((container_width_custom > 0));
ALTER TABLE "settings_layout" ADD CONSTRAINT "settings_layout_content_width_custom_positive_check" CHECK ((content_width_custom > 0));
ALTER TABLE "settings_layout" ADD CONSTRAINT "settings_layout_singleton_check" CHECK ((id = 'singleton'::text));
ALTER TABLE "settings_notification" ADD CONSTRAINT "settings_notification_email_addresses_text_array_check" CHECK (((array_position(notification_email_addresses, NULL::text) IS NULL) AND (array_position(notification_email_addresses, ''::text) IS NULL)));
ALTER TABLE "settings_notification" ADD CONSTRAINT "settings_notification_singleton_check" CHECK ((id = 'singleton'::text));
ALTER TABLE "settings_notification" ADD CONSTRAINT "settings_notification_staff_ids_text_array_check" CHECK (((array_position(notification_staff_ids, NULL::text) IS NULL) AND (array_position(notification_staff_ids, ''::text) IS NULL)));
ALTER TABLE "settings_organization" ADD CONSTRAINT "settings_organization_business_hours_object_check" CHECK (((business_hours IS NULL) OR (jsonb_typeof(business_hours) = 'object'::text)));
ALTER TABLE "settings_organization" ADD CONSTRAINT "settings_organization_singleton_check" CHECK ((id = 'singleton'::text));
ALTER TABLE "settings_resend" ADD CONSTRAINT "settings_resend_singleton_check" CHECK ((id = 'singleton'::text));
ALTER TABLE "settings_reservation" ADD CONSTRAINT "settings_reservation_cancellation_deadline_hours_positive_check" CHECK ((cancellation_deadline_hours > 0));
ALTER TABLE "settings_reservation" ADD CONSTRAINT "settings_reservation_default_time_slot_positive_check" CHECK ((default_time_slot > 0));
ALTER TABLE "settings_reservation" ADD CONSTRAINT "settings_reservation_max_recurrence_instances_positive_check" CHECK ((max_recurrence_instances > 0));
ALTER TABLE "settings_reservation" ADD CONSTRAINT "settings_reservation_max_reservation_duration_positive_check" CHECK ((max_reservation_duration > 0));
ALTER TABLE "settings_reservation" ADD CONSTRAINT "settings_reservation_min_reservation_duration_positive_check" CHECK ((min_reservation_duration > 0));
ALTER TABLE "settings_reservation" ADD CONSTRAINT "settings_reservation_modification_deadline_hours_positive_check" CHECK ((modification_deadline_hours > 0));
ALTER TABLE "settings_reservation" ADD CONSTRAINT "settings_reservation_singleton_check" CHECK ((id = 'singleton'::text));
ALTER TABLE "settings_seo" ADD CONSTRAINT "settings_seo_singleton_check" CHECK ((id = 'singleton'::text));
ALTER TABLE "settings_sidebar" ADD CONSTRAINT "settings_sidebar_sidebar_popular_count_positive_check" CHECK ((sidebar_popular_count > 0));
ALTER TABLE "settings_sidebar" ADD CONSTRAINT "settings_sidebar_sidebar_recent_count_positive_check" CHECK ((sidebar_recent_count > 0));
ALTER TABLE "settings_sidebar" ADD CONSTRAINT "settings_sidebar_singleton_check" CHECK ((id = 'singleton'::text));
ALTER TABLE "settings_sidebar" ADD CONSTRAINT "settings_sidebar_widgets_array_check" CHECK ((jsonb_typeof(sidebar_widgets) = 'array'::text));
ALTER TABLE "settings_stripe" ADD CONSTRAINT "settings_stripe_singleton_check" CHECK ((id = 'singleton'::text));
ALTER TABLE "settings_switchbot" ADD CONSTRAINT "settings_switchbot_passcode_buffer_minutes_non_negative_check" CHECK ((switchbot_passcode_buffer_minutes >= 0));
ALTER TABLE "settings_switchbot" ADD CONSTRAINT "settings_switchbot_singleton_check" CHECK ((id = 'singleton'::text));
ALTER TABLE "settings_system" ADD CONSTRAINT "settings_system_singleton_check" CHECK ((id = 'singleton'::text));
ALTER TABLE "settings_turnstile" ADD CONSTRAINT "settings_turnstile_singleton_check" CHECK ((id = 'singleton'::text));
ALTER TABLE "smart_lock_devices" ADD CONSTRAINT "smart_lock_devices_last_battery_range_check" CHECK (((last_battery >= 0) AND (last_battery <= 100)));
ALTER TABLE "smart_lock_passcodes" ADD CONSTRAINT "smart_lock_passcodes_window_order_check" CHECK ((start_time <= end_time));
ALTER TABLE "social_links" ADD CONSTRAINT "social_links_order_position_check" CHECK ((("order" >= 0) OR ("order" <= '-1000000'::integer)));
ALTER TABLE "space_categories" ADD CONSTRAINT "space_categories_sort_order_position_check" CHECK (((sort_order >= 0) OR (sort_order <= '-1000000'::integer)));
ALTER TABLE "space_rate_plans" ADD CONSTRAINT "space_rate_plans_effective_range_check" CHECK (((effective_from IS NULL) OR (effective_to IS NULL) OR (effective_from <= effective_to)));
ALTER TABLE "space_rate_plans" ADD CONSTRAINT "space_rate_plans_end_time_format_check" CHECK (((end_time IS NULL) OR ((end_time)::text ~ '^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$'::text)));
ALTER TABLE "space_rate_plans" ADD CONSTRAINT "space_rate_plans_hourly_price_non_negative_check" CHECK (((hourly_price)::numeric >= (0)::numeric));
ALTER TABLE "space_rate_plans" ADD CONSTRAINT "space_rate_plans_start_time_format_check" CHECK (((start_time IS NULL) OR ((start_time)::text ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'::text)));
ALTER TABLE "space_rate_plans" ADD CONSTRAINT "space_rate_plans_time_of_day_order_check" CHECK (((start_time IS NULL) OR (end_time IS NULL) OR ((start_time)::text < (end_time)::text)));
ALTER TABLE "space_reviews" ADD CONSTRAINT "space_reviews_rating_range_check" CHECK (((rating >= 1) AND (rating <= 5)));
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_area_positive_check" CHECK (((area IS NULL) OR (area > 0)));
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_business_hours_object_check" CHECK (((business_hours IS NULL) OR (jsonb_typeof(business_hours) = 'object'::text)));
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_capacity_positive_check" CHECK ((capacity >= 1));
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_description_json_object_check" CHECK ((jsonb_typeof(description_json) = 'object'::text));
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_discount_value_range_check" CHECK (((discount_value IS NULL) OR ((discount_value >= 0) AND ((discount_type <> 'PERCENTAGE'::discount_type) OR (discount_value <= 100)))));
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_facilities_array_check" CHECK (((facilities IS NULL) OR (jsonb_typeof(facilities) = 'array'::text)));
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_gallery_array_check" CHECK (((gallery IS NULL) OR (jsonb_typeof(gallery) = 'array'::text)));
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_hourly_price_non_negative_check" CHECK ((hourly_price >= 0));
ALTER TABLE "terms_documents" ADD CONSTRAINT "terms_documents_content_json_object_check" CHECK ((jsonb_typeof(content_json) = 'object'::text));
ALTER TABLE "terms_documents" ADD CONSTRAINT "terms_documents_display_order_position_check" CHECK (((display_order >= 0) OR (display_order <= '-1000000'::integer)));
ALTER TABLE "transfer_accounts" ADD CONSTRAINT "transfer_accounts_sort_order_position_check" CHECK (((sort_order >= 0) OR (sort_order <= '-1000000'::integer)));

-- ===== plpgsql 関数 (16) =====
--
-- trigger 関数と、その本体から呼ばれる検査関数。**本体はテキスト**なので、
-- 列や型を rename しても自動追随しない（rename する migration 側で作り直す）。

CREATE OR REPLACE FUNCTION public.assert_event_capacity_not_exceeded(target_slot_id uuid, target_ticket_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  slot_capacity INTEGER;
  slot_confirmed INTEGER;
  ticket_capacity INTEGER;
  ticket_confirmed INTEGER;
BEGIN
  SELECT capacity INTO slot_capacity
  FROM event_time_slots WHERE id = target_slot_id;

  -- 枠が消えている（親イベントの cascade 削除中など）なら見るものが無い。
  IF slot_capacity IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO slot_confirmed
  FROM event_registrations
  WHERE slot_id = target_slot_id AND status = 'CONFIRMED';

  IF slot_confirmed > slot_capacity THEN
    RAISE EXCEPTION
      'EventTimeSlot % capacity exceeded: confirmed % > capacity %',
      target_slot_id, slot_confirmed, slot_capacity
      USING ERRCODE = 'check_violation';
  END IF;

  IF target_ticket_id IS NULL THEN
    RETURN;
  END IF;

  SELECT capacity INTO ticket_capacity
  FROM event_tickets WHERE id = target_ticket_id;

  -- capacity NULL = 枚数無制限（枠の定員だけが効く）。
  IF ticket_capacity IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO ticket_confirmed
  FROM event_registrations
  WHERE slot_id = target_slot_id
    AND ticket_id = target_ticket_id
    AND status = 'CONFIRMED';

  IF ticket_confirmed > ticket_capacity THEN
    RAISE EXCEPTION
      'EventTicket % capacity exceeded on slot %: confirmed % > capacity %',
      target_ticket_id, target_slot_id, ticket_confirmed, ticket_capacity
      USING ERRCODE = 'check_violation';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.assert_refund_total_within_paid()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  paid INTEGER;
  refunded INTEGER;
BEGIN
  IF NEW.status IN ('failed', 'canceled') THEN
    RETURN NEW;
  END IF;

  IF NEW.reservation_id IS NOT NULL THEN
    SELECT total_price_with_tax INTO paid FROM reservations WHERE id = NEW.reservation_id;
    SELECT COALESCE(SUM(amount), 0) INTO refunded FROM refunds
      WHERE reservation_id = NEW.reservation_id AND status NOT IN ('failed', 'canceled');
  ELSIF NEW.event_registration_id IS NOT NULL THEN
    SELECT paid_amount INTO paid FROM event_registrations WHERE id = NEW.event_registration_id;
    SELECT COALESCE(SUM(amount), 0) INTO refunded FROM refunds
      WHERE event_registration_id = NEW.event_registration_id AND status NOT IN ('failed', 'canceled');
  ELSE
    RETURN NEW;
  END IF;

  IF paid IS NOT NULL AND refunded > paid THEN
    RAISE EXCEPTION 'refund total % exceeds paid amount % (refund %)', refunded, paid, NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_event_registration_capacity()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM assert_event_capacity_not_exceeded(NEW.slot_id, NEW.ticket_id);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_event_schedule_integrity("targetEventId" uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  current_mode event_schedule_mode;
  current_deadline timestamp with time zone;
  slot_count integer;
  first_slot_start timestamp with time zone;
BEGIN
  SELECT schedule_mode, registration_deadline
  INTO current_mode, current_deadline
  FROM "events"
  WHERE "id" = "targetEventId"
    AND deleted_at IS NULL;

  IF current_mode IS NULL THEN
    RETURN;
  END IF;

  SELECT COUNT(*), MIN(start_at)
  INTO slot_count, first_slot_start
  FROM "event_time_slots"
  WHERE event_id = "targetEventId";

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
    target_event_id := OLD.event_id;
    PERFORM "check_event_schedule_integrity"(target_event_id);
    RETURN OLD;
  END IF;

  target_event_id := NEW.event_id;
  PERFORM "check_event_schedule_integrity"(target_event_id);

  IF TG_OP = 'UPDATE' AND OLD.event_id <> NEW.event_id THEN
    PERFORM "check_event_schedule_integrity"(OLD.event_id);
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_event_slot_capacity_not_exceeded()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM assert_event_capacity_not_exceeded(NEW.id, NULL);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_event_slot_space_is_free()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  event_space_id UUID;
  event_status TEXT;
  event_deleted_at TIMESTAMPTZ;
  conflict_kind TEXT;
  conflicting_id UUID;
BEGIN
  SELECT space_id, status::text, deleted_at
    INTO event_space_id, event_status, event_deleted_at
  FROM events
  WHERE id = NEW.event_id;

  -- space_id null (外部会場) / soft-deleted event / 非 active status は Space を占有しない
  IF event_space_id IS NULL
     OR event_deleted_at IS NOT NULL
     OR event_status NOT IN ('DRAFT', 'PUBLISHED') THEN
    RETURN NEW;
  END IF;

  SELECT kind, id INTO conflict_kind, conflicting_id
  FROM (
    SELECT 'reservation' AS kind, r.id AS id
    FROM reservations r
    WHERE r.space_id = event_space_id
      AND r.deleted_at IS NULL
      AND r.status IN ('PENDING', 'CONFIRMED')
      AND r.start_time < NEW.end_at
      AND r.end_time > NEW.start_at
    UNION ALL
    -- 自分自身だけを外す。同じイベントの他の枠は外さない —
    -- 同一イベント内の重なりも、同じ部屋の二重押さえであることに変わりはない。
    SELECT 'event slot' AS kind, other.id AS id
    FROM event_time_slots other
    JOIN events other_event ON other_event.id = other.event_id
    WHERE other.id <> NEW.id
      AND other_event.space_id = event_space_id
      AND other_event.deleted_at IS NULL
      AND other_event.status IN ('DRAFT', 'PUBLISHED')
      AND other.start_at < NEW.end_at
      AND other.end_at > NEW.start_at
  ) AS occupancies
  LIMIT 1;

  IF conflicting_id IS NOT NULL THEN
    RAISE EXCEPTION 'EventTimeSlot % overlaps with % % on space %',
      NEW.id, conflict_kind, conflicting_id, event_space_id
      USING ERRCODE = 'exclusion_violation';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_event_space_is_free()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  own_slot_id UUID;
  conflict_kind TEXT;
  conflicting_id UUID;
BEGIN
  IF NEW.space_id IS NULL
     OR NEW.deleted_at IS NOT NULL
     OR NEW.status NOT IN ('DRAFT', 'PUBLISHED') THEN
    RETURN NEW;
  END IF;

  SELECT slot_id, kind, id INTO own_slot_id, conflict_kind, conflicting_id
  FROM (
    SELECT ets.id AS slot_id, 'reservation' AS kind, r.id AS id
    FROM event_time_slots ets
    JOIN reservations r
      ON r.space_id = NEW.space_id
     AND r.deleted_at IS NULL
     AND r.status IN ('PENDING', 'CONFIRMED')
     AND ets.start_at < r.end_time
     AND ets.end_at > r.start_time
    WHERE ets.event_id = NEW.id
    UNION ALL
    -- other_event が NEW 自身のこともある（AFTER trigger なので events は既に新しい値）。
    -- そのとき拾うのは「自イベント配下の枠どうしの重なり」で、
    -- space_id が NULL のあいだに作られた並行トラックに Space を割り当てた場合がこれ。
    SELECT ets.id AS slot_id, 'event slot' AS kind, other.id AS id
    FROM event_time_slots ets
    JOIN event_time_slots other
      ON other.id <> ets.id
     AND other.start_at < ets.end_at
     AND other.end_at > ets.start_at
    JOIN events other_event
      ON other_event.id = other.event_id
     AND other_event.space_id = NEW.space_id
     AND other_event.deleted_at IS NULL
     AND other_event.status IN ('DRAFT', 'PUBLISHED')
    WHERE ets.event_id = NEW.id
  ) AS occupancies
  LIMIT 1;

  IF conflicting_id IS NOT NULL THEN
    RAISE EXCEPTION 'EventTimeSlot % overlaps with % % on space %',
      own_slot_id, conflict_kind, conflicting_id, NEW.space_id
      USING ERRCODE = 'exclusion_violation';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_event_ticket_capacity_not_exceeded()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  affected_slot_id UUID;
BEGIN
  FOR affected_slot_id IN
    SELECT DISTINCT slot_id FROM event_registrations
    WHERE ticket_id = NEW.id AND status = 'CONFIRMED'
  LOOP
    PERFORM assert_event_capacity_not_exceeded(affected_slot_id, NEW.id);
  END LOOP;
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
  IF NEW.deleted_at IS NOT NULL
     OR NEW.status NOT IN ('PENDING', 'CONFIRMED') THEN
    RETURN NEW;
  END IF;

  SELECT ets.id INTO conflicting_slot_id
  FROM event_time_slots ets
  JOIN events e ON e.id = ets.event_id
  WHERE e.space_id = NEW.space_id
    AND e.deleted_at IS NULL
    AND e.status IN ('DRAFT', 'PUBLISHED')
    AND ets.start_at < NEW.end_time
    AND ets.end_at > NEW.start_time
  LIMIT 1;

  IF conflicting_slot_id IS NOT NULL THEN
    RAISE EXCEPTION 'Reservation time overlaps with EventTimeSlot % on space %',
      conflicting_slot_id, NEW.space_id
      USING ERRCODE = 'exclusion_violation';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_append_only_truncate()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION '% is append-only; TRUNCATE is not allowed', TG_TABLE_NAME
    USING ERRCODE = 'integrity_constraint_violation';
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
     AND NEW.reservation_id IS NOT DISTINCT FROM OLD.reservation_id
     AND NEW.event_registration_id IS NOT DISTINCT FROM OLD.event_registration_id
     AND NEW.amount = OLD.amount
     AND NEW.reason IS NOT DISTINCT FROM OLD.reason
     AND NEW.stripe_refund_id = OLD.stripe_refund_id
     AND NEW.refunded_by_type = OLD.refunded_by_type
     AND NEW.created_at = OLD.created_at
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


-- ===== EXCLUDE 制約 (1) =====

ALTER TABLE "reservations" ADD CONSTRAINT "reservations_no_active_time_overlap_excl" EXCLUDE USING gist (space_id WITH =, tstzrange(start_time, end_time, '[)'::text) WITH &&) WHERE (((deleted_at IS NULL) AND (status = ANY (ARRAY['PENDING'::reservation_status, 'CONFIRMED'::reservation_status]))));

-- ===== trigger (21) =====

CREATE TRIGGER audit_logs_no_delete BEFORE DELETE ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION prevent_audit_logs_mutation();
CREATE TRIGGER audit_logs_no_truncate BEFORE TRUNCATE ON public.audit_logs FOR EACH STATEMENT EXECUTE FUNCTION prevent_append_only_truncate();
CREATE TRIGGER audit_logs_no_update BEFORE UPDATE ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION prevent_audit_logs_mutation();
CREATE CONSTRAINT TRIGGER event_registrations_capacity_check AFTER INSERT OR UPDATE OF slot_id, ticket_id, status, quantity ON public.event_registrations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_event_registration_capacity();
CREATE CONSTRAINT TRIGGER event_tickets_capacity_check AFTER UPDATE OF capacity ON public.event_tickets DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_event_ticket_capacity_not_exceeded();
CREATE CONSTRAINT TRIGGER event_time_slots_capacity_check AFTER UPDATE OF capacity ON public.event_time_slots DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_event_slot_capacity_not_exceeded();
CREATE CONSTRAINT TRIGGER event_time_slots_schedule_integrity_check AFTER INSERT OR DELETE OR UPDATE OF event_id, start_at ON public.event_time_slots DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_event_schedule_integrity_from_slot();
CREATE CONSTRAINT TRIGGER event_time_slots_space_is_free_check AFTER INSERT OR UPDATE OF event_id, start_at, end_at ON public.event_time_slots DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_event_slot_space_is_free();
CREATE CONSTRAINT TRIGGER events_schedule_integrity_check AFTER INSERT OR UPDATE OF schedule_mode, deleted_at, registration_deadline ON public.events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_event_schedule_integrity_from_event();
CREATE CONSTRAINT TRIGGER events_space_is_free_check AFTER INSERT OR UPDATE OF space_id, status, deleted_at ON public.events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_event_space_is_free();
CREATE TRIGGER inquiry_status_history_no_delete BEFORE DELETE ON public.inquiry_status_history FOR EACH ROW EXECUTE FUNCTION prevent_inquiry_status_history_mutation();
CREATE TRIGGER inquiry_status_history_no_truncate BEFORE TRUNCATE ON public.inquiry_status_history FOR EACH STATEMENT EXECUTE FUNCTION prevent_append_only_truncate();
CREATE TRIGGER inquiry_status_history_no_update BEFORE UPDATE ON public.inquiry_status_history FOR EACH ROW EXECUTE FUNCTION prevent_inquiry_status_history_mutation();
CREATE TRIGGER refunds_no_delete BEFORE DELETE ON public.refunds FOR EACH ROW EXECUTE FUNCTION prevent_refunds_mutation();
CREATE TRIGGER refunds_no_truncate BEFORE TRUNCATE ON public.refunds FOR EACH STATEMENT EXECUTE FUNCTION prevent_append_only_truncate();
CREATE TRIGGER refunds_no_update BEFORE UPDATE ON public.refunds FOR EACH ROW EXECUTE FUNCTION prevent_refunds_mutation();
CREATE CONSTRAINT TRIGGER refunds_total_within_paid_check AFTER INSERT OR UPDATE OF amount, status, reservation_id, event_registration_id ON public.refunds DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_refund_total_within_paid();
CREATE CONSTRAINT TRIGGER reservations_no_event_slot_overlap_check AFTER INSERT OR UPDATE OF space_id, start_time, end_time, status, deleted_at ON public.reservations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_reservation_no_event_slot_overlap();
CREATE TRIGGER terms_agreements_no_delete BEFORE DELETE ON public.terms_agreements FOR EACH ROW EXECUTE FUNCTION prevent_terms_agreements_mutation();
CREATE TRIGGER terms_agreements_no_truncate BEFORE TRUNCATE ON public.terms_agreements FOR EACH STATEMENT EXECUTE FUNCTION prevent_append_only_truncate();
CREATE TRIGGER terms_agreements_no_update BEFORE UPDATE ON public.terms_agreements FOR EACH ROW EXECUTE FUNCTION prevent_terms_agreements_mutation();
