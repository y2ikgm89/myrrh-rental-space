-- Japanize existing hero section h1 titles (日英併記 SSoT pattern).
--
-- Eyebrow (sectionLabel) stays in English uppercase (gold-line),
-- and h1 becomes Japanese — matching the canonical 日英併記 pattern:
-- `frontend/design-config/foundations.md` §ホームページセクション見出しは日英併記.
--
-- Only updates single-span titles that still match the English default
-- ("Spaces" / "Events" / "News" / "Blog" / "FAQ" / "Access" / "Contact" / "About" / "Reserve").
-- Admin-edited titles (multi-span or different text) are preserved.
-- The PortableTextSpan `_key` is preserved; only the `text` field is rewritten.

UPDATE sections s
SET config = jsonb_set(
  s.config,
  '{title,0,text}',
  to_jsonb(
    CASE p.slug
      WHEN 'spaces' THEN 'スペース一覧'
      WHEN 'events' THEN 'イベント'
      WHEN 'news' THEN 'お知らせ'
      WHEN 'posts' THEN 'ブログ'
      WHEN 'faq' THEN 'よくある質問'
      WHEN 'access' THEN 'アクセス'
      WHEN 'contact' THEN 'お問い合わせ'
      WHEN 'about' THEN '会社概要'
      WHEN 'reservation' THEN '予約'
      ELSE COALESCE(p.title, '')
    END
  )
)
FROM pages p
WHERE s."pageId" = p.id
  AND s.type = 'hero'
  AND jsonb_typeof(s.config->'title') = 'array'
  AND jsonb_array_length(s.config->'title') = 1
  AND s.config->'title'->0->>'text' IN (
    'Spaces', 'Events', 'News', 'Blog', 'FAQ', 'Access', 'Contact', 'About', 'Reserve'
  );
