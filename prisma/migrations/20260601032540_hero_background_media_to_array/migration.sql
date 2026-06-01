-- hero / page-hero 背景メディア: 単一オブジェクト {url,alt,caption} → 配列 [{...}] へ変換（冪等）
-- 2026-05-31 PR #358 (createMediaArraySchema 配列化クリーンブレイク) の本番データ追従。
-- Section.config は jsonb。jsonb_typeof(...) = 'object' の行のみ対象とするため再実行は no-op。

-- hero セクションの backgroundMedia
UPDATE "sections"
SET config = jsonb_set(
  config,
  '{backgroundMedia}',
  CASE
    WHEN COALESCE(config -> 'backgroundMedia' ->> 'url', '') = '' THEN '[]'::jsonb
    ELSE jsonb_build_array(config -> 'backgroundMedia')
  END
)
WHERE type = 'hero'
  AND jsonb_typeof(config -> 'backgroundMedia') = 'object';

-- page-hero media variant の media
UPDATE "sections"
SET config = jsonb_set(
  config,
  '{media}',
  CASE
    WHEN COALESCE(config -> 'media' ->> 'url', '') = '' THEN '[]'::jsonb
    ELSE jsonb_build_array(config -> 'media')
  END
)
WHERE type = 'page-hero'
  AND jsonb_typeof(config -> 'media') = 'object';
