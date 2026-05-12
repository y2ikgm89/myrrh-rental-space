-- Backfill `sectionLabel` for existing hero section records.
--
-- Adds an English eyebrow label above the heading (gold-line SectionLabel pattern)
-- consistent with section-list / news-list / post-list / etc. on the same page.
-- Mapping derives from the parent pages.slug. Custom pages get the page title fallback.
-- Records that already have `sectionLabel` (admin-edited) are preserved.

UPDATE sections s
SET config = jsonb_set(
  s.config,
  '{sectionLabel}',
  to_jsonb(
    CASE p.slug
      WHEN 'spaces' THEN 'Spaces'
      WHEN 'events' THEN 'Events'
      WHEN 'news' THEN 'News'
      WHEN 'posts' THEN 'Blog'
      WHEN 'faq' THEN 'FAQ'
      WHEN 'access' THEN 'Access'
      WHEN 'contact' THEN 'Contact'
      WHEN 'about' THEN 'About'
      WHEN 'reservation' THEN 'Reserve'
      ELSE COALESCE(p.title, '')
    END
  ),
  true
)
FROM pages p
WHERE s."pageId" = p.id
  AND s.type = 'hero'
  AND NOT (s.config ? 'sectionLabel');
