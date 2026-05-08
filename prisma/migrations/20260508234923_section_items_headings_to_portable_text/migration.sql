-- Phase 2: Section items[] 内見出し系 string -> PortableTextSpan[]
-- 対象:
--   features.items[].title
--   testimonial.items[].authorName, items[].authorTitle
--   faq-list.items[].question
--   value-props.items[].title

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION wrap_string_to_portable_span_v2(value TEXT)
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
  item_keys TEXT[];
  new_items JSONB;
BEGIN
  FOR sec IN SELECT id, type, config FROM sections WHERE jsonb_typeof(config -> 'items') = 'array' LOOP
    item_keys := CASE sec.type
      WHEN 'features' THEN ARRAY['title']
      WHEN 'testimonial' THEN ARRAY['authorName', 'authorTitle']
      WHEN 'faq-list' THEN ARRAY['question']
      WHEN 'value-props' THEN ARRAY['title']
      ELSE ARRAY[]::TEXT[]
    END;

    IF array_length(item_keys, 1) IS NULL THEN
      CONTINUE;
    END IF;

    SELECT jsonb_agg(
      (
        SELECT jsonb_object_agg(key, value)
        FROM (
          SELECT key,
            CASE
              WHEN key = ANY(item_keys) AND jsonb_typeof(value) = 'string'
                THEN wrap_string_to_portable_span_v2(value #>> '{}')
              ELSE value
            END AS value
          FROM jsonb_each(item)
        ) updated
      )
    ) INTO new_items
    FROM jsonb_array_elements(sec.config -> 'items') item;

    UPDATE sections
    SET config = jsonb_set(config, '{items}', new_items)
    WHERE id = sec.id;
  END LOOP;
END $do$;

DROP FUNCTION wrap_string_to_portable_span_v2(TEXT);
