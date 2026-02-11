-- =============================================================================
-- Phase 1: Create Enums
-- =============================================================================

CREATE TYPE "AnnouncementBarType" AS ENUM ('info', 'warning', 'promo');
CREATE TYPE "DiscountType" AS ENUM ('none', 'percentage', 'fixed');
CREATE TYPE "DurationDiscountOverride" AS ENUM ('inherit', 'enabled', 'disabled');
CREATE TYPE "TaxRateType" AS ENUM ('standard', 'reduced');
CREATE TYPE "HeaderScrollBehavior" AS ENUM ('auto-hide', 'always-visible', 'hide-on-scroll');
CREATE TYPE "TaxDisplayMode" AS ENUM ('tax_excluded', 'tax_included', 'both');
CREATE TYPE "TaxInputMode" AS ENUM ('tax_excluded', 'tax_included');
CREATE TYPE "CalendarSyncMethod" AS ENUM ('polling', 'webhook', 'both');
CREATE TYPE "AnalyticsType" AS ENUM ('ga4', 'gtm');
CREATE TYPE "DiscountCombinationMode" AS ENUM ('best', 'both');
CREATE TYPE "PostPermalinkStructure" AS ENUM ('post-name', 'date-name', 'category-name');
CREATE TYPE "AnnouncementBarAnimation" AS ENUM ('fade', 'slideX', 'slideY');
CREATE TYPE "AnnouncementBarDesignStyle" AS ENUM ('solid', 'gradient', 'outlined', 'glass', 'minimal', 'striped');
CREATE TYPE "InstagramFeedLayout" AS ENUM ('grid', 'masonry', 'slider');

-- =============================================================================
-- Phase 2: Create junction tables (BEFORE dropping old columns)
-- =============================================================================

CREATE TABLE "user_page_assignments" (
    "userId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    CONSTRAINT "user_page_assignments_pkey" PRIMARY KEY ("userId","pageId")
);

CREATE TABLE "post_tag_on_posts" (
    "postId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    CONSTRAINT "post_tag_on_posts_pkey" PRIMARY KEY ("postId","tagId")
);

CREATE INDEX "user_page_assignments_pageId_idx" ON "user_page_assignments"("pageId");
CREATE INDEX "post_tag_on_posts_tagId_idx" ON "post_tag_on_posts"("tagId");

-- =============================================================================
-- Phase 3: Data Migration - Post.tags JSON → PostTagOnPost junction table
-- =============================================================================

-- Migrate Post.tags (JSON string array) to PostTagOnPost junction table
-- Match tag names from Post.tags JSON to PostTag records by name
INSERT INTO "post_tag_on_posts" ("postId", "tagId")
SELECT p.id, pt.id
FROM "posts" p
CROSS JOIN LATERAL jsonb_array_elements_text(p."tags") AS tag_name
JOIN "post_tags" pt ON pt."name" = tag_name
WHERE p."tags" IS NOT NULL
  AND p."tags" != '[]'::jsonb
ON CONFLICT DO NOTHING;

-- =============================================================================
-- Phase 4: Data Migration - User.assignedPages JSON → UserPageAssignment
-- =============================================================================

-- Migrate User.assignedPages (JSON string array of page IDs) to UserPageAssignment
INSERT INTO "user_page_assignments" ("userId", "pageId")
SELECT u.id, page_id::text
FROM "user" u
CROSS JOIN LATERAL jsonb_array_elements_text(u."assignedPages") AS page_id
WHERE u."assignedPages" IS NOT NULL
  AND u."assignedPages" != '[]'::jsonb
  -- Only insert if the page actually exists (FK constraint protection)
  AND EXISTS (SELECT 1 FROM "pages" WHERE "pages".id = page_id::text)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- Phase 5: Drop old JSON columns (data already migrated)
-- =============================================================================

ALTER TABLE "posts" DROP COLUMN "tags";
ALTER TABLE "user" DROP COLUMN "assignedPages";

-- =============================================================================
-- Phase 6: Remove legacy fields
-- =============================================================================

ALTER TABLE "settings" DROP COLUMN "defaultBusinessHours";
ALTER TABLE "reservations" DROP COLUMN "termsAgreedAt";

-- =============================================================================
-- Phase 7: Remove redundant indexes (unique constraints auto-create indexes)
-- =============================================================================

DROP INDEX IF EXISTS "coupons_code_idx";
DROP INDEX IF EXISTS "ical_tokens_token_idx";
DROP INDEX IF EXISTS "login_tokens_token_idx";
DROP INDEX IF EXISTS "staff_invitations_token_idx";
DROP INDEX IF EXISTS "terms_slug_idx";

-- =============================================================================
-- Phase 8: Add missing indexes
-- =============================================================================

CREATE INDEX "faq_items_categoryId_isPublished_order_idx" ON "faq_items"("categoryId", "isPublished", "order");
CREATE INDEX "navigation_items_parentId_idx" ON "navigation_items"("parentId");
CREATE INDEX "news_createdAt_idx" ON "news"("createdAt");
CREATE INDEX "reservations_createdAt_idx" ON "reservations"("createdAt");

-- =============================================================================
-- Phase 9: Convert String columns to Enum types (preserving data with USING)
-- NOTE: Must DROP DEFAULT before type change, then SET DEFAULT with enum value
-- =============================================================================

-- AnnouncementBar.type: String → AnnouncementBarType
ALTER TABLE "announcement_bars"
  ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "announcement_bars"
  ALTER COLUMN "type" TYPE "AnnouncementBarType" USING "type"::"AnnouncementBarType";
ALTER TABLE "announcement_bars"
  ALTER COLUMN "type" SET DEFAULT 'info'::"AnnouncementBarType";

-- Space enum conversions
ALTER TABLE "spaces" ALTER COLUMN "discountType" DROP DEFAULT;
ALTER TABLE "spaces" ALTER COLUMN "durationDiscountOverride" DROP DEFAULT;
ALTER TABLE "spaces" ALTER COLUMN "taxRateType" DROP DEFAULT;

ALTER TABLE "spaces"
  ALTER COLUMN "discountType" TYPE "DiscountType" USING "discountType"::"DiscountType",
  ALTER COLUMN "durationDiscountOverride" TYPE "DurationDiscountOverride" USING "durationDiscountOverride"::"DurationDiscountOverride",
  ALTER COLUMN "taxRateType" TYPE "TaxRateType" USING "taxRateType"::"TaxRateType";

ALTER TABLE "spaces" ALTER COLUMN "discountType" SET DEFAULT 'none'::"DiscountType";
ALTER TABLE "spaces" ALTER COLUMN "durationDiscountOverride" SET DEFAULT 'inherit'::"DurationDiscountOverride";
ALTER TABLE "spaces" ALTER COLUMN "taxRateType" SET DEFAULT 'standard'::"TaxRateType";

-- Settings enum conversions: drop all defaults first
ALTER TABLE "settings" ALTER COLUMN "headerScrollBehavior" DROP DEFAULT;
ALTER TABLE "settings" ALTER COLUMN "taxDisplayModeAdmin" DROP DEFAULT;
ALTER TABLE "settings" ALTER COLUMN "taxDisplayModePublic" DROP DEFAULT;
ALTER TABLE "settings" ALTER COLUMN "taxInputMode" DROP DEFAULT;
ALTER TABLE "settings" ALTER COLUMN "googleCalendarSyncMethod" DROP DEFAULT;
ALTER TABLE "settings" ALTER COLUMN "analyticsType" DROP DEFAULT;
ALTER TABLE "settings" ALTER COLUMN "discountCombinationMode" DROP DEFAULT;
ALTER TABLE "settings" ALTER COLUMN "postPermalinkStructure" DROP DEFAULT;
ALTER TABLE "settings" ALTER COLUMN "announcementBarAnimation" DROP DEFAULT;
ALTER TABLE "settings" ALTER COLUMN "announcementBarDesignStyle" DROP DEFAULT;
ALTER TABLE "settings" ALTER COLUMN "instagramFeedLayout" DROP DEFAULT;

-- Settings: convert types
ALTER TABLE "settings"
  ALTER COLUMN "headerScrollBehavior" TYPE "HeaderScrollBehavior" USING "headerScrollBehavior"::"HeaderScrollBehavior";
ALTER TABLE "settings"
  ALTER COLUMN "taxDisplayModeAdmin" TYPE "TaxDisplayMode" USING "taxDisplayModeAdmin"::"TaxDisplayMode";
ALTER TABLE "settings"
  ALTER COLUMN "taxDisplayModePublic" TYPE "TaxDisplayMode" USING "taxDisplayModePublic"::"TaxDisplayMode";
ALTER TABLE "settings"
  ALTER COLUMN "taxInputMode" TYPE "TaxInputMode" USING "taxInputMode"::"TaxInputMode";
ALTER TABLE "settings"
  ALTER COLUMN "googleCalendarSyncMethod" TYPE "CalendarSyncMethod" USING "googleCalendarSyncMethod"::"CalendarSyncMethod";
ALTER TABLE "settings"
  ALTER COLUMN "analyticsType" TYPE "AnalyticsType" USING "analyticsType"::"AnalyticsType";
ALTER TABLE "settings"
  ALTER COLUMN "discountCombinationMode" TYPE "DiscountCombinationMode" USING "discountCombinationMode"::"DiscountCombinationMode";
ALTER TABLE "settings"
  ALTER COLUMN "postPermalinkStructure" TYPE "PostPermalinkStructure" USING "postPermalinkStructure"::"PostPermalinkStructure";
ALTER TABLE "settings"
  ALTER COLUMN "announcementBarAnimation" TYPE "AnnouncementBarAnimation" USING "announcementBarAnimation"::"AnnouncementBarAnimation";
ALTER TABLE "settings"
  ALTER COLUMN "announcementBarDesignStyle" TYPE "AnnouncementBarDesignStyle" USING "announcementBarDesignStyle"::"AnnouncementBarDesignStyle";
ALTER TABLE "settings"
  ALTER COLUMN "instagramFeedLayout" TYPE "InstagramFeedLayout" USING "instagramFeedLayout"::"InstagramFeedLayout";

-- Settings: restore defaults with enum types
ALTER TABLE "settings" ALTER COLUMN "headerScrollBehavior" SET DEFAULT 'always-visible'::"HeaderScrollBehavior";
ALTER TABLE "settings" ALTER COLUMN "taxDisplayModeAdmin" SET DEFAULT 'both'::"TaxDisplayMode";
ALTER TABLE "settings" ALTER COLUMN "taxDisplayModePublic" SET DEFAULT 'tax_included'::"TaxDisplayMode";
ALTER TABLE "settings" ALTER COLUMN "taxInputMode" SET DEFAULT 'tax_excluded'::"TaxInputMode";
ALTER TABLE "settings" ALTER COLUMN "googleCalendarSyncMethod" SET DEFAULT 'polling'::"CalendarSyncMethod";
ALTER TABLE "settings" ALTER COLUMN "discountCombinationMode" SET DEFAULT 'best'::"DiscountCombinationMode";
ALTER TABLE "settings" ALTER COLUMN "postPermalinkStructure" SET DEFAULT 'post-name'::"PostPermalinkStructure";
ALTER TABLE "settings" ALTER COLUMN "announcementBarAnimation" SET DEFAULT 'fade'::"AnnouncementBarAnimation";
ALTER TABLE "settings" ALTER COLUMN "announcementBarDesignStyle" SET DEFAULT 'solid'::"AnnouncementBarDesignStyle";
ALTER TABLE "settings" ALTER COLUMN "instagramFeedLayout" SET DEFAULT 'grid'::"InstagramFeedLayout";

-- =============================================================================
-- Phase 10: FK changes - Post.author nullable + onDelete
-- =============================================================================

-- Drop existing FK and re-create with onDelete: SetNull
ALTER TABLE "posts" DROP CONSTRAINT "posts_authorId_fkey";
ALTER TABLE "posts" ALTER COLUMN "authorId" DROP NOT NULL;
ALTER TABLE "posts" ADD CONSTRAINT "posts_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Post.category: onDelete Restrict
ALTER TABLE "posts" DROP CONSTRAINT "posts_categoryId_fkey";
ALTER TABLE "posts" ADD CONSTRAINT "posts_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "post_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =============================================================================
-- Phase 11: FK constraints for createdBy / resolvedBy / deletedBy fields
-- =============================================================================

-- Make createdBy nullable where required
ALTER TABLE "editor_comment_threads" ALTER COLUMN "createdBy" DROP NOT NULL;
ALTER TABLE "editor_comments" ALTER COLUMN "createdBy" DROP NOT NULL;
ALTER TABLE "login_tokens" ALTER COLUMN "createdBy" DROP NOT NULL;
ALTER TABLE "staff_invitations" ALTER COLUMN "createdBy" DROP NOT NULL;
ALTER TABLE "terms_versions" ALTER COLUMN "createdBy" DROP NOT NULL;

-- NewsVersion.createdBy FK (nullable - already nullable in current schema, just add FK)
ALTER TABLE "news_versions" ADD CONSTRAINT "news_versions_createdBy_fkey"
  FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- PostVersion.createdBy FK
ALTER TABLE "post_versions" ADD CONSTRAINT "post_versions_createdBy_fkey"
  FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- EditorCommentThread.createdBy + resolvedBy FKs
ALTER TABLE "editor_comment_threads" ADD CONSTRAINT "editor_comment_threads_createdBy_fkey"
  FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "editor_comment_threads" ADD CONSTRAINT "editor_comment_threads_resolvedBy_fkey"
  FOREIGN KEY ("resolvedBy") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- EditorComment.createdBy + deletedBy FKs
ALTER TABLE "editor_comments" ADD CONSTRAINT "editor_comments_createdBy_fkey"
  FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "editor_comments" ADD CONSTRAINT "editor_comments_deletedBy_fkey"
  FOREIGN KEY ("deletedBy") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- PostComment.deletedBy FK
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_deletedBy_fkey"
  FOREIGN KEY ("deletedBy") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- TermsVersion.createdBy + publishedBy FKs
ALTER TABLE "terms_versions" ADD CONSTRAINT "terms_versions_createdBy_fkey"
  FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "terms_versions" ADD CONSTRAINT "terms_versions_publishedBy_fkey"
  FOREIGN KEY ("publishedBy") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- LoginToken.createdBy FK
ALTER TABLE "login_tokens" ADD CONSTRAINT "login_tokens_createdBy_fkey"
  FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- StaffInvitation.createdBy FK
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_createdBy_fkey"
  FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- =============================================================================
-- Phase 12: Junction table FK constraints
-- =============================================================================

ALTER TABLE "user_page_assignments" ADD CONSTRAINT "user_page_assignments_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_page_assignments" ADD CONSTRAINT "user_page_assignments_pageId_fkey"
  FOREIGN KEY ("pageId") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "post_tag_on_posts" ADD CONSTRAINT "post_tag_on_posts_postId_fkey"
  FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "post_tag_on_posts" ADD CONSTRAINT "post_tag_on_posts_tagId_fkey"
  FOREIGN KEY ("tagId") REFERENCES "post_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
