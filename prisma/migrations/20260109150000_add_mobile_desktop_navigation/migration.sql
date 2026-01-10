-- Migration: Add mobile/desktop navigation separation
-- This migration changes NavigationType enum and adds showOnDesktop/showOnMobile to SocialLink

-- PostgreSQL requires a different approach for modifying enums with data
-- We create a new enum type and migrate the data

-- Step 1: Create new enum type with all values
CREATE TYPE "NavigationType_new" AS ENUM ('HEADER_DESKTOP', 'HEADER_MOBILE', 'FOOTER');

-- Step 2: Update the column to use the new type
-- First, convert existing HEADER to HEADER_DESKTOP
ALTER TABLE "navigation_items"
  ALTER COLUMN "type" TYPE "NavigationType_new"
  USING (
    CASE "type"::text
      WHEN 'HEADER' THEN 'HEADER_DESKTOP'::"NavigationType_new"
      WHEN 'FOOTER' THEN 'FOOTER'::"NavigationType_new"
      ELSE 'HEADER_DESKTOP'::"NavigationType_new"
    END
  );

-- Step 3: Drop the old enum type
DROP TYPE "NavigationType";

-- Step 4: Rename the new enum type to the original name
ALTER TYPE "NavigationType_new" RENAME TO "NavigationType";

-- Step 5: Copy existing HEADER_DESKTOP items to create HEADER_MOBILE items
-- This ensures mobile menu starts with the same items as desktop
INSERT INTO "navigation_items" ("id", "type", "parentId", "label", "url", "isExternal", "order", "isActive", "createdAt", "updatedAt")
SELECT
  gen_random_uuid(),
  'HEADER_MOBILE'::"NavigationType",
  NULL,
  "label",
  "url",
  "isExternal",
  "order",
  "isActive",
  NOW(),
  NOW()
FROM "navigation_items"
WHERE "type" = 'HEADER_DESKTOP'::"NavigationType" AND "parentId" IS NULL;

-- Step 6: Add showOnDesktop and showOnMobile columns to social_links
ALTER TABLE "social_links" ADD COLUMN IF NOT EXISTS "showOnDesktop" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "social_links" ADD COLUMN IF NOT EXISTS "showOnMobile" BOOLEAN NOT NULL DEFAULT true;
