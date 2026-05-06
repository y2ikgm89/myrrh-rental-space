-- Restore the home page page-hero Section row that was inadvertently
-- removed by 20260506170309_reseed_home_sections_visual_restore.
--
-- Cause: the prior migration ran `DELETE FROM sections WHERE pageId = (home)`
-- without excluding type='page-hero'. The page-hero row (order=-1) is
-- managed by a separate SSoT path (seed.ts idempotent insert,
-- DEFAULT_PAGE_HERO config) and was not meant to be touched. See
-- ssot-singletons.md §PAGE_TEMPLATES.requiredSectionTypes ↔ DEFAULT_PAGE_SECTIONS.
--
-- This migration uses NOT EXISTS for idempotency so a fresh DB seed
-- (which already inserts page-hero via seed.ts) is unaffected.

INSERT INTO "sections" ("id", "pageId", "type", "title", "config", "content", "order", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid(), p."id", 'page-hero', NULL,
  '{"variant":"editorial-split","label":"Volume One — Spring 2026","title":"Where silence works.","description":"静けさが仕事をする場所。Myrrh は光と余白を大切にした、思考のためのレンタルスペースです。","images":[{"url":"https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80","alt":"自然光が差し込む開放的なレンタルスペース"},{"url":"https://images.unsplash.com/photo-1462826303086-329426d1aef5?w=1200&q=80","alt":"木の温もりを感じるミーティングルーム"},{"url":"https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=1200&q=80","alt":"モダンなデザインのコワーキングスペース"}],"transition":"crossfade","buttonText":"Reserve a space","buttonUrl":"/reservation","layout":{"padding":"md","containerWidth":"lg","hideOnMobile":false,"hideOnDesktop":false,"animateOnScroll":"fade-up"}}'::jsonb,
  NULL, -1, true, NOW(), NOW()
FROM "pages" p
WHERE p."slug" = 'home'
  AND NOT EXISTS (
    SELECT 1 FROM "sections" s
    WHERE s."pageId" = p."id" AND s."type" = 'page-hero'
  );
