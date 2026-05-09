-- Phase 3: Section リンク/ボタンテキスト string -> PortableTextSpan[]
-- 対象:
--   contact-form.submitButtonText
--   faq-list.viewAllText / news-list.viewAllText / post-list.viewAllText / space-list.viewAllText

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION wrap_string_to_portable_span_v3(value TEXT)
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
  field_keys TEXT[];
  k TEXT;
BEGIN
  FOR sec IN SELECT id, type, config FROM sections LOOP
    field_keys := CASE sec.type
      WHEN 'contact-form' THEN ARRAY['submitButtonText']
      WHEN 'faq-list' THEN ARRAY['viewAllText']
      WHEN 'news-list' THEN ARRAY['viewAllText']
      WHEN 'post-list' THEN ARRAY['viewAllText']
      WHEN 'space-list' THEN ARRAY['viewAllText']
      ELSE ARRAY[]::TEXT[]
    END;

    IF array_length(field_keys, 1) IS NULL THEN
      CONTINUE;
    END IF;

    FOREACH k IN ARRAY field_keys LOOP
      IF jsonb_typeof(sec.config -> k) = 'string' THEN
        UPDATE sections
        SET config = jsonb_set(
          config,
          ARRAY[k],
          wrap_string_to_portable_span_v3(config ->> k)
        )
        WHERE id = sec.id;
      END IF;
    END LOOP;
  END LOOP;
END $do$;

DROP FUNCTION wrap_string_to_portable_span_v3(TEXT);
