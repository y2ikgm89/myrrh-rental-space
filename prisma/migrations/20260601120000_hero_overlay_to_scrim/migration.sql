-- hero / page-hero(media) の overlay(bool)+overlayOpacity を scrimTone+scrimOpacity に変換（冪等）。
-- 既存の見た目を維持: hero=白スクリム→"light" / page-hero(media)=黒スクリム→"dark"。
-- overlay=false は scrimOpacity=0。既に scrimTone を持つ行はスキップ（冪等）。
-- Section.config は jsonb。

-- hero: 白スクリム → light
UPDATE "sections"
SET config =
  (config - 'overlay' - 'overlayOpacity')
  || jsonb_build_object(
       'scrimTone', 'light',
       'scrimOpacity',
       CASE
         WHEN (config -> 'overlay') = 'false'::jsonb THEN 0
         ELSE COALESCE((config ->> 'overlayOpacity')::int, 40)
       END
     )
WHERE type = 'hero'
  AND NOT (config ? 'scrimTone');

-- page-hero media variant: 黒スクリム → dark
UPDATE "sections"
SET config =
  (config - 'overlay' - 'overlayOpacity')
  || jsonb_build_object(
       'scrimTone', 'dark',
       'scrimOpacity',
       CASE
         WHEN (config -> 'overlay') = 'false'::jsonb THEN 0
         ELSE COALESCE((config ->> 'overlayOpacity')::int, 40)
       END
     )
WHERE type = 'page-hero'
  AND config ->> 'variant' = 'media'
  AND NOT (config ? 'scrimTone');
