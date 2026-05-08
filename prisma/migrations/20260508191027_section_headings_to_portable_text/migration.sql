-- Phase 1: Section 見出し系 string -> PortableTextSpan[]
-- 対象: title / heading / tagline / label / overviewHeadline / globalContactHeadline
-- 各セクション type ごとに配列化、idempotent (jsonb_typeof で string チェック)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION wrap_string_to_portable_span_v1(value TEXT)
RETURNS JSONB AS $func$
BEGIN
  IF value IS NULL OR value = '' THEN
    RETURN '[]'::JSONB;
  END IF;
  RETURN jsonb_build_array(
    jsonb_build_object(
      '_key', gen_random_uuid()::text,
      '_type', 'span',
      'text', value
    )
  );
END;
$func$ LANGUAGE plpgsql IMMUTABLE;

DO $do$
DECLARE
  sec RECORD;
  k TEXT;
  field_keys TEXT[];
BEGIN
  FOR sec IN SELECT id, type, config FROM sections LOOP
    field_keys := CASE sec.type
      WHEN 'concept' THEN ARRAY['heading']
      WHEN 'contact-form' THEN ARRAY['title']
      WHEN 'cta' THEN ARRAY['title']
      WHEN 'embed' THEN ARRAY['title']
      WHEN 'event-calendar' THEN ARRAY['title']
      WHEN 'faq-list' THEN ARRAY['title']
      WHEN 'features' THEN ARRAY['title']
      WHEN 'gallery' THEN ARRAY['title']
      WHEN 'hero' THEN ARRAY['title']
      WHEN 'hero-parallax' THEN ARRAY['tagline', 'title']
      WHEN 'instagram' THEN ARRAY['title']
      WHEN 'location-list' THEN ARRAY['title', 'overviewHeadline', 'globalContactHeadline']
      WHEN 'map' THEN ARRAY['title']
      WHEN 'news-list' THEN ARRAY['title']
      WHEN 'page-hero' THEN ARRAY['label', 'title']
      WHEN 'post-list' THEN ARRAY['title']
      WHEN 'reservation-form' THEN ARRAY['title']
      WHEN 'space-list' THEN ARRAY['title']
      WHEN 'space-showcase' THEN ARRAY['title']
      WHEN 'testimonial' THEN ARRAY['title']
      ELSE ARRAY[]::TEXT[]
    END;

    FOREACH k IN ARRAY field_keys LOOP
      IF jsonb_typeof(sec.config -> k) = 'string' THEN
        UPDATE sections
        SET config = jsonb_set(
          config,
          ARRAY[k],
          wrap_string_to_portable_span_v1(config ->> k)
        )
        WHERE id = sec.id;
      END IF;
    END LOOP;
  END LOOP;
END $do$;

DROP FUNCTION wrap_string_to_portable_span_v1(TEXT);
