-- Rebuild value-props sections to the new editorial hairline strip schema.
--
-- Breaking change (no backward compat):
--   - Remove `sectionLabel`, `title`, `iconStyle` from config (no longer in schema)
--   - Add `eyebrow` to each item (serif italic English label)
--   - Default `layout.padding` to "none" (border-y is the section's own visual marker)
--
-- The eyebrow is mapped from the well-known seed `title` values
-- (Speed / Flexibility / Connectivity / Payment) — unmatched titles fall back to "".
-- Items are clamped to first 4 (schema enforces max:4); rows with <2 items are
-- left as-is for admin to fix manually.

UPDATE "sections"
SET config = jsonb_build_object(
  'items', (
    SELECT jsonb_agg(
      CASE
        WHEN item->>'title' = '最短1時間から' THEN
          jsonb_build_object(
            'icon', COALESCE(item->>'icon', 'IconClock'),
            'eyebrow', 'Speed',
            'title', item->>'title'
          )
        WHEN item->>'title' = '当日予約OK' THEN
          jsonb_build_object(
            'icon', COALESCE(item->>'icon', 'IconCalendarCheck'),
            'eyebrow', 'Flexibility',
            'title', item->>'title'
          )
        WHEN item->>'title' = 'Wi-Fi完備' THEN
          jsonb_build_object(
            'icon', COALESCE(item->>'icon', 'IconWifi'),
            'eyebrow', 'Connectivity',
            'title', item->>'title'
          )
        WHEN item->>'title' = 'オンライン決済' THEN
          jsonb_build_object(
            'icon', COALESCE(item->>'icon', 'IconCreditCard'),
            'eyebrow', 'Payment',
            'title', item->>'title'
          )
        ELSE
          jsonb_build_object(
            'icon', COALESCE(item->>'icon', ''),
            'eyebrow', '',
            'title', COALESCE(item->>'title', '')
          )
      END
      ORDER BY ord
    )
    FROM jsonb_array_elements(config->'items') WITH ORDINALITY AS arr(item, ord)
    WHERE ord <= 4
  ),
  'layout', jsonb_build_object(
    'padding', 'none',
    'containerWidth', COALESCE(config->'layout'->>'containerWidth', 'lg'),
    'animateOnScroll', COALESCE(config->'layout'->>'animateOnScroll', 'fade-up'),
    'hideOnMobile', COALESCE((config->'layout'->>'hideOnMobile')::boolean, false),
    'hideOnDesktop', COALESCE((config->'layout'->>'hideOnDesktop')::boolean, false)
  )
)
WHERE type = 'value-props'
  AND jsonb_typeof(config->'items') = 'array';
