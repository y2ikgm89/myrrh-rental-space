-- Clean break: section CTA buttons use Portable Text `label` only.
-- Runtime schemas no longer accept legacy `text`, `ctaPrimary`, or `ctaSecondary`.

CREATE OR REPLACE FUNCTION "_section_button_label_from_legacy_text"(button jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN jsonb_typeof(button -> 'label') = 'array' THEN button -> 'label'
    WHEN jsonb_typeof(button -> 'text') = 'string' THEN
      jsonb_build_array(
        jsonb_build_object(
          '_key',
          'migrated-' || md5(button::text),
          '_type',
          'span',
          'text',
          button ->> 'text'
        )
      )
    ELSE '[]'::jsonb
  END;
$$;

CREATE OR REPLACE FUNCTION "_section_canonical_button"(button jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (button - 'text') || jsonb_build_object(
    'label',
    "_section_button_label_from_legacy_text"(button)
  );
$$;

CREATE OR REPLACE FUNCTION "_section_canonical_buttons"(buttons jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    jsonb_agg("_section_canonical_button"(button) ORDER BY ordinality),
    '[]'::jsonb
  )
  FROM jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(buttons) = 'array' THEN buttons
      ELSE '[]'::jsonb
    END
  ) WITH ORDINALITY AS items(button, ordinality)
  WHERE jsonb_typeof(button) = 'object';
$$;

CREATE OR REPLACE FUNCTION "_section_legacy_cta_button"(
  button jsonb,
  fallback_variant text
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN jsonb_typeof(button) = 'object'
      AND jsonb_typeof(button -> 'text') = 'string'
      AND jsonb_typeof(button -> 'url') = 'string'
    THEN jsonb_build_object(
      'label',
      "_section_button_label_from_legacy_text"(button),
      'url',
      button ->> 'url',
      'variant',
      COALESCE(button ->> 'variant', fallback_variant)
    )
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION "_section_legacy_cta_buttons"(
  primary_button jsonb,
  secondary_button jsonb
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(jsonb_agg(button ORDER BY ordinality), '[]'::jsonb)
  FROM (
    VALUES
      (1, "_section_legacy_cta_button"(primary_button, 'primary')),
      (2, "_section_legacy_cta_button"(secondary_button, 'secondary'))
  ) AS legacy(ordinality, button)
  WHERE button IS NOT NULL;
$$;

UPDATE "sections"
SET "config" =
  ("config" - 'ctaPrimary' - 'ctaSecondary')
  || jsonb_build_object(
    'buttons',
    "_section_canonical_buttons"("config" -> 'buttons')
    || "_section_legacy_cta_buttons"(
      "config" -> 'ctaPrimary',
      "config" -> 'ctaSecondary'
    )
  )
WHERE "type" = 'cta'
  AND ("config" ? 'ctaPrimary' OR "config" ? 'ctaSecondary');

UPDATE "sections"
SET "config" = jsonb_set(
  "config",
  '{buttons}',
  "_section_canonical_buttons"("config" -> 'buttons'),
  true
)
WHERE "type" IN ('hero', 'hero-parallax', 'page-hero', 'cta')
  AND jsonb_typeof("config" -> 'buttons') = 'array';

DROP FUNCTION "_section_legacy_cta_buttons"(jsonb, jsonb);
DROP FUNCTION "_section_legacy_cta_button"(jsonb, text);
DROP FUNCTION "_section_canonical_buttons"(jsonb);
DROP FUNCTION "_section_canonical_button"(jsonb);
DROP FUNCTION "_section_button_label_from_legacy_text"(jsonb);
