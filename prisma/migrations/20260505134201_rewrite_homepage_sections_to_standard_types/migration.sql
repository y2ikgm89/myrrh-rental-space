-- Migration: Rewrite homepage-* section types to standard types
-- homepage-how-it-works -> features
-- homepage-features -> features  
-- homepage-spaces -> space-showcase
-- homepage-cta -> cta

-- Step 1: homepage-how-it-works -> features
-- Transform: label -> sectionLabel, steps -> items (add icon:null), drop valueProps, add columns/itemLayout
UPDATE sections
SET
  type = 'features',
  config = jsonb_build_object(
    'sectionLabel', COALESCE(config->>'label', 'Features'),
    'title', COALESCE(config->>'title', 'Features'),
    'items', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'icon', NULL,
            'title', step->>'title',
            'description', step->>'description'
          )
        )
        FROM jsonb_array_elements(config->'steps') AS step
      ),
      '[]'::jsonb
    ),
    'columns', 3,
    'itemLayout', 'hero-first',
    'layout', COALESCE(config->>'layout', NULL)
  )
WHERE type = 'homepage-how-it-works';

-- Step 2: homepage-features -> features
-- Transform: label -> sectionLabel, items get icon:null added, add columns/itemLayout
UPDATE sections
SET
  type = 'features',
  config = jsonb_build_object(
    'sectionLabel', COALESCE(config->>'label', 'Features'),
    'title', COALESCE(config->>'title', 'Features'),
    'items', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'icon', NULL,
            'title', item->>'title',
            'description', item->>'description'
          )
        )
        FROM jsonb_array_elements(config->'items') AS item
      ),
      '[]'::jsonb
    ),
    'columns', 3,
    'itemLayout', 'hero-first',
    'layout', COALESCE(config->'layout', '{}'::jsonb)
  )
WHERE type = 'homepage-features';

-- Step 3: homepage-spaces -> space-showcase
-- Transform: label -> sectionLabel, count -> maxItems, drop autoPlayInterval, add new fields
UPDATE sections
SET
  type = 'space-showcase',
  config = jsonb_build_object(
    'sectionLabel', COALESCE(config->>'label', 'Spaces'),
    'title', COALESCE(config->>'title', 'Our Spaces'),
    'maxItems', COALESCE((config->>'count')::int, 3),
    'showOnlyPublished', true,
    'columns', 3,
    'cardStyle', 'bordered',
    'imageAspect', '4:3',
    'layout', COALESCE(config->'layout', '{}'::jsonb)
  )
WHERE type = 'homepage-spaces';

-- Step 4: homepage-cta -> cta
-- Transform: label -> sectionLabel, add backgroundColor/variant
UPDATE sections
SET
  type = 'cta',
  config = jsonb_build_object(
    'sectionLabel', COALESCE(config->>'label', 'Ready to Begin?'),
    'title', COALESCE(config->>'title', ''),
    'description', COALESCE(config->>'description', ''),
    'buttons', COALESCE(config->'buttons', '[]'::jsonb),
    'backgroundColor', NULL,
    'variant', 'default',
    'layout', COALESCE(config->'layout', '{}'::jsonb)
  )
WHERE type = 'homepage-cta';
