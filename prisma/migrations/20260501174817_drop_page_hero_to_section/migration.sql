-- Phase G: Page.pageHero Json 列を Section テーブルに移行 + DROP COLUMN
-- Phase F で TS caller は全削除済み

-- 1) ホームページ等の pageHero JSON を Section に挿入
--    既に page-hero section が存在する場合（Phase E3 seed の結果）は skip（NOT EXISTS guard）
INSERT INTO sections (id, "pageId", "type", "config", "order", "isActive", "createdAt", "updatedAt")
SELECT
  gen_random_uuid(),
  p.id,
  'page-hero',
  p."pageHero",
  -1,
  TRUE,
  now(),
  now()
FROM pages p
WHERE p."pageHero" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM sections s
    WHERE s."pageId" = p.id AND s."type" = 'page-hero'
  );

-- 2) Page.pageHero 列を削除
ALTER TABLE pages DROP COLUMN "pageHero";
