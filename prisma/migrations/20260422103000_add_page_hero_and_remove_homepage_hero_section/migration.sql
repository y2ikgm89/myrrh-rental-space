-- Page first-class hero (Phase A). Migrates legacy homepage-hero sections into pages.pageHero.

ALTER TABLE "pages" ADD COLUMN "pageHero" JSONB;

UPDATE "pages" p
SET "pageHero" = jsonb_build_object(
  'variant', 'editorial-split',
  'label', COALESCE(s.config->>'label', ''),
  'title', COALESCE(s.config->>'title', ''),
  'description', COALESCE(s.config->>'description', ''),
  'images', COALESCE(s.config->'images', '[]'::jsonb),
  'transition', COALESCE(s.config->>'transition', 'crossfade'),
  'buttonText', COALESCE(s.config->>'buttonText', ''),
  'buttonUrl', COALESCE(s.config->>'buttonUrl', '')
)
FROM "sections" s
WHERE s."pageId" = p.id AND s."type" = 'homepage-hero';

DELETE FROM "sections" WHERE "type" = 'homepage-hero';

WITH "ordered" AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "order" ASC) - 1 AS "new_order"
  FROM "sections"
  WHERE "pageId" = (SELECT "id" FROM "pages" WHERE "slug" = 'home' LIMIT 1)
)
UPDATE "sections" s
SET "order" = o."new_order"
FROM "ordered" o
WHERE s."id" = o."id";
