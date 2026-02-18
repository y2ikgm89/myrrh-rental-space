-- Drift resolution: captures schema changes applied via `prisma db push` between migrations.
-- These changes consolidate homepage_sections + page_sections into a unified sections table,
-- add headerScrollBehavior to settings, and create block_templates.
-- NOTE: This migration is already marked as applied on the live database.
-- It only affects shadow database replay for `prisma migrate dev`.

-- =============================================================================
-- Step 1: Add headerScrollBehavior column to settings
--         (schema_improvements will later convert this TEXT to HeaderScrollBehavior enum)
-- =============================================================================

ALTER TABLE "settings" ADD COLUMN "headerScrollBehavior" TEXT NOT NULL DEFAULT 'always-visible';

-- =============================================================================
-- Step 2: Create unified SectionType enum
--         (replaces both HomepageSectionType and PageSectionType)
-- =============================================================================

CREATE TYPE "SectionType" AS ENUM (
  'HERO', 'HERO_PARALLAX', 'CUSTOM', 'CONCEPT',
  'SPACE_LIST', 'SPACE_SHOWCASE', 'NEWS_LIST', 'POST_LIST', 'FAQ_LIST',
  'FEATURES', 'TESTIMONIAL', 'GALLERY',
  'CTA', 'CONTACT_FORM', 'MAP', 'EMBED', 'INSTAGRAM'
);

-- =============================================================================
-- Step 3: Create unified sections table and migrate data
-- =============================================================================

CREATE TABLE "sections" (
    "id" TEXT NOT NULL,
    "pageId" TEXT,
    "type" "SectionType" NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "title" TEXT,
    "content" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "design" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sections_pkey" PRIMARY KEY ("id")
);

-- Migrate homepage_sections → sections (pageId = NULL, map enum values)
INSERT INTO "sections" ("id", "pageId", "type", "order", "isActive", "title", "content", "config", "design", "createdAt", "updatedAt")
SELECT
  "id", NULL,
  (CASE "type"::text
    WHEN 'NEWS' THEN 'NEWS_LIST'
    WHEN 'POST' THEN 'POST_LIST'
    WHEN 'FAQ' THEN 'FAQ_LIST'
    ELSE "type"::text
  END)::"SectionType",
  "order", "isActive", "title", "content", "config", '{}', "createdAt", "updatedAt"
FROM "homepage_sections";

-- Migrate page_sections → sections (with pageId, enum values are 1:1)
INSERT INTO "sections" ("id", "pageId", "type", "order", "isActive", "title", "content", "config", "design", "createdAt", "updatedAt")
SELECT
  "id", "pageId",
  "type"::text::"SectionType",
  "order", "isActive", "title", "content", "config", '{}', "createdAt", "updatedAt"
FROM "page_sections";

-- Drop old tables (cascades indexes and FKs)
DROP TABLE "homepage_sections";
DROP TABLE "page_sections";

-- Drop old enums
DROP TYPE "HomepageSectionType";
DROP TYPE "PageSectionType";

-- Indexes on sections
CREATE INDEX "sections_pageId_order_isActive_idx" ON "sections"("pageId", "order", "isActive");
CREATE INDEX "sections_type_idx" ON "sections"("type");

-- FK: sections.pageId → pages.id
ALTER TABLE "sections" ADD CONSTRAINT "sections_pageId_fkey"
  FOREIGN KEY ("pageId") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- =============================================================================
-- Step 4: Create block_templates table
-- =============================================================================

CREATE TABLE "block_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "nodeJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "block_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "block_templates_createdBy_idx" ON "block_templates"("createdBy");
CREATE INDEX "block_templates_createdAt_idx" ON "block_templates"("createdAt");

ALTER TABLE "block_templates" ADD CONSTRAINT "block_templates_createdBy_fkey"
  FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- =============================================================================
-- Step 5: Additional settings columns (added via db push)
-- =============================================================================

ALTER TABLE "settings" ADD COLUMN "announcementBarSticky" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "settings" ADD COLUMN "googleOAuthClientId" TEXT;
ALTER TABLE "settings" ADD COLUMN "googleOAuthClientSecret" TEXT;
ALTER TABLE "settings" ADD COLUMN "googleOAuthConnectionStatus" TEXT;
ALTER TABLE "settings" ADD COLUMN "googleOAuthLastTestedAt" TIMESTAMP(3);
ALTER TABLE "settings" ADD COLUMN "paymentAccepted" TEXT;

-- =============================================================================
-- Step 6: Additional indexes (added via db push)
-- =============================================================================

CREATE INDEX "inquiries_email_idx" ON "inquiries"("email");
CREATE INDEX "posts_authorId_idx" ON "posts"("authorId");
CREATE INDEX "reservations_userId_idx" ON "reservations"("userId");
