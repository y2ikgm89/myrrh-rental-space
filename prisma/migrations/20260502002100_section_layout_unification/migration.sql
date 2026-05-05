-- Phase 3: per-section padding/maxWidth/containerWidth -> layout group
--          + inner layout field rename for 8 types

-- ===== Part A: per-section padding/maxWidth/containerWidth -> layout =====

-- custom
UPDATE sections SET config = jsonb_set(
  config - 'padding' - 'maxWidth',
  '{layout}',
  jsonb_build_object(
    'padding', COALESCE(config->>'padding', 'md'),
    'containerWidth', COALESCE(config->>'maxWidth', 'lg'),
    'hideOnMobile', false,
    'hideOnDesktop', false,
    'animateOnScroll', 'fade-up'
  )
) WHERE type = 'custom' AND (config ? 'padding' OR config ? 'maxWidth');

-- embed
UPDATE sections SET config = jsonb_set(
  config - 'maxWidth',
  '{layout}',
  jsonb_build_object(
    'padding', 'md',
    'containerWidth', COALESCE(config->>'maxWidth', 'lg'),
    'hideOnMobile', false,
    'hideOnDesktop', false,
    'animateOnScroll', 'fade-up'
  )
) WHERE type = 'embed' AND config ? 'maxWidth';

-- faq-list
UPDATE sections SET config = jsonb_set(
  config - 'containerWidth',
  '{layout}',
  jsonb_build_object(
    'padding', 'md',
    'containerWidth', COALESCE(config->>'containerWidth', 'lg'),
    'hideOnMobile', false,
    'hideOnDesktop', false,
    'animateOnScroll', 'fade-up'
  )
) WHERE type = 'faq-list' AND config ? 'containerWidth';

-- ===== Part B: inner layout field rename (8 types) =====
-- Existing config.layout (string) is renamed to per-section new field name.
-- If config.layout is already an object (Phase 3 layout group), leave it untouched.

-- concept: layout (string) -> contentLayout
UPDATE sections SET config = jsonb_set(
  config - 'layout',
  '{contentLayout}',
  config->'layout'
) WHERE type = 'concept'
  AND jsonb_typeof(config->'layout') = 'string';

-- features: layout (string) -> itemLayout
UPDATE sections SET config = jsonb_set(
  config - 'layout',
  '{itemLayout}',
  config->'layout'
) WHERE type = 'features'
  AND jsonb_typeof(config->'layout') = 'string';

-- gallery: layout (string) -> gridLayout
UPDATE sections SET config = jsonb_set(
  config - 'layout',
  '{gridLayout}',
  config->'layout'
) WHERE type = 'gallery'
  AND jsonb_typeof(config->'layout') = 'string';

-- testimonial: layout (string) -> displayLayout
UPDATE sections SET config = jsonb_set(
  config - 'layout',
  '{displayLayout}',
  config->'layout'
) WHERE type = 'testimonial'
  AND jsonb_typeof(config->'layout') = 'string';

-- space-list: layout (string) -> displayLayout
UPDATE sections SET config = jsonb_set(
  config - 'layout',
  '{displayLayout}',
  config->'layout'
) WHERE type = 'space-list'
  AND jsonb_typeof(config->'layout') = 'string';

-- news-list: layout (string) -> displayLayout
UPDATE sections SET config = jsonb_set(
  config - 'layout',
  '{displayLayout}',
  config->'layout'
) WHERE type = 'news-list'
  AND jsonb_typeof(config->'layout') = 'string';

-- post-list: layout (string) -> displayLayout
UPDATE sections SET config = jsonb_set(
  config - 'layout',
  '{displayLayout}',
  config->'layout'
) WHERE type = 'post-list'
  AND jsonb_typeof(config->'layout') = 'string';

-- event-calendar: layout (string) -> displayLayout
UPDATE sections SET config = jsonb_set(
  config - 'layout',
  '{displayLayout}',
  config->'layout'
) WHERE type = 'event-calendar'
  AND jsonb_typeof(config->'layout') = 'string';
