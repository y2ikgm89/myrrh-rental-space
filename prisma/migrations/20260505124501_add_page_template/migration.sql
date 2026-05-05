-- Add Page.template column with slug-based default values
ALTER TABLE "pages" ADD COLUMN "template" VARCHAR(64);

-- Assign template per slug (clean-break: 既存 11 page slug を全網羅)
UPDATE "pages" SET "template" = 'home' WHERE "slug" = 'home';
UPDATE "pages" SET "template" = 'content' WHERE "slug" = 'about';
UPDATE "pages" SET "template" = 'access' WHERE "slug" = 'access';
UPDATE "pages" SET "template" = 'contact' WHERE "slug" = 'contact';
UPDATE "pages" SET "template" = 'faq' WHERE "slug" = 'faq';
UPDATE "pages" SET "template" = 'news-archive' WHERE "slug" = 'news';
UPDATE "pages" SET "template" = 'blog-archive' WHERE "slug" = 'posts';
UPDATE "pages" SET "template" = 'events-archive' WHERE "slug" = 'events';
UPDATE "pages" SET "template" = 'spaces-archive' WHERE "slug" = 'spaces';
UPDATE "pages" SET "template" = 'reservation' WHERE "slug" = 'reservation';
UPDATE "pages" SET "template" = 'custom' WHERE "template" IS NULL;

-- Enforce NOT NULL
ALTER TABLE "pages" ALTER COLUMN "template" SET NOT NULL;
