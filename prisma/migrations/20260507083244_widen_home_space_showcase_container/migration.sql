-- Widen home /space-showcase carousel section to full viewport width
-- Was: containerWidth="xl" (=> --container-editorial 50rem / 800px) clipped distance 2 cards.
-- Now: containerWidth="full" (=> max-w-none) so the center-stage carousel can show 5 visible cards.
UPDATE "sections"
SET "config" = jsonb_set("config", '{layout,containerWidth}', '"full"'::jsonb)
WHERE "type" = 'space-showcase'
  AND "pageId" IN (SELECT id FROM "pages" WHERE "slug" = 'home')
  AND "config"->'layout'->>'containerWidth' = 'xl';
