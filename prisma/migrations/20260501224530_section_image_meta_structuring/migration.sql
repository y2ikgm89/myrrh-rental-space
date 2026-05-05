-- Phase 2B: hero / hero-parallax / concept の string image を {url, alt, caption} group に変換
-- testimonial.items[].authorImageUrl は jsonb_path 操作が複雑なため
-- scripts/migrate-testimonial-images.ts (bun script) で別途処理する。

-- hero
UPDATE sections SET config = jsonb_set(
  config - 'backgroundImageUrl',
  '{backgroundImage}',
  jsonb_build_object(
    'url', COALESCE(config->>'backgroundImageUrl', ''),
    'alt', '',
    'caption', ''
  )
) WHERE type = 'hero' AND config ? 'backgroundImageUrl';

-- hero-parallax
UPDATE sections SET config = jsonb_set(
  config - 'backgroundImageUrl',
  '{backgroundImage}',
  jsonb_build_object(
    'url', COALESCE(config->>'backgroundImageUrl', ''),
    'alt', '',
    'caption', ''
  )
) WHERE type = 'hero-parallax' AND config ? 'backgroundImageUrl';

-- concept
UPDATE sections SET config = jsonb_set(
  config - 'imageUrl',
  '{image}',
  jsonb_build_object(
    'url', COALESCE(config->>'imageUrl', ''),
    'alt', '',
    'caption', ''
  )
) WHERE type = 'concept' AND config ? 'imageUrl';
