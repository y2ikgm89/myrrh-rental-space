-- Step 1: Add a temporary VARCHAR column
ALTER TABLE "sections" ADD COLUMN "type_new" VARCHAR(64);

-- Step 2: Convert existing enum values to kebab-case strings
UPDATE "sections" SET "type_new" = 'hero' WHERE "type" = 'HERO';
UPDATE "sections" SET "type_new" = 'hero-parallax' WHERE "type" = 'HERO_PARALLAX';
UPDATE "sections" SET "type_new" = 'custom' WHERE "type" = 'CUSTOM';
UPDATE "sections" SET "type_new" = 'concept' WHERE "type" = 'CONCEPT';
UPDATE "sections" SET "type_new" = 'space-list' WHERE "type" = 'SPACE_LIST';
UPDATE "sections" SET "type_new" = 'space-showcase' WHERE "type" = 'SPACE_SHOWCASE';
UPDATE "sections" SET "type_new" = 'news-list' WHERE "type" = 'NEWS_LIST';
UPDATE "sections" SET "type_new" = 'post-list' WHERE "type" = 'POST_LIST';
UPDATE "sections" SET "type_new" = 'faq-list' WHERE "type" = 'FAQ_LIST';
UPDATE "sections" SET "type_new" = 'features' WHERE "type" = 'FEATURES';
UPDATE "sections" SET "type_new" = 'testimonial' WHERE "type" = 'TESTIMONIAL';
UPDATE "sections" SET "type_new" = 'gallery' WHERE "type" = 'GALLERY';
UPDATE "sections" SET "type_new" = 'cta' WHERE "type" = 'CTA';
UPDATE "sections" SET "type_new" = 'contact-form' WHERE "type" = 'CONTACT_FORM';
UPDATE "sections" SET "type_new" = 'map' WHERE "type" = 'MAP';
UPDATE "sections" SET "type_new" = 'embed' WHERE "type" = 'EMBED';
UPDATE "sections" SET "type_new" = 'instagram' WHERE "type" = 'INSTAGRAM';

-- Step 3: Drop the old enum column
ALTER TABLE "sections" DROP COLUMN "type";

-- Step 4: Rename the new column
ALTER TABLE "sections" RENAME COLUMN "type_new" TO "type";

-- Step 5: Set NOT NULL constraint
ALTER TABLE "sections" ALTER COLUMN "type" SET NOT NULL;

-- Step 6: Recreate index on type
DROP INDEX IF EXISTS "sections_type_idx";
CREATE INDEX "sections_type_idx" ON "sections"("type");

-- Step 7: Drop the SectionType enum
DROP TYPE "SectionType";

-- Step 8: Drop the page_contents table
DROP TABLE "page_contents";
