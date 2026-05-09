-- Phase 4 Task 2: Section textarea fields -> PortableTextBlock[] migration
-- 14 fields x 11 sections の string -> blocks 一括変換
-- 改行で分割し、空行を除いて各行を 1 block に変換
-- 空文字列 / null は [] にフォールバック

CREATE OR REPLACE FUNCTION public.text_to_portable_blocks(input text)
RETURNS jsonb LANGUAGE plpgsql AS $func$
DECLARE
  result jsonb := '[]'::jsonb;
  line text;
BEGIN
  IF input IS NULL OR length(trim(input)) = 0 THEN
    RETURN '[]'::jsonb;
  END IF;
  FOR line IN SELECT unnest(string_to_array(input, E'\n'))
  LOOP
    IF length(trim(line)) > 0 THEN
      result := result || jsonb_build_array(jsonb_build_object(
        '_key', gen_random_uuid()::text,
        '_type', 'block',
        'style', 'normal',
        'children', jsonb_build_array(jsonb_build_object(
          '_key', gen_random_uuid()::text,
          '_type', 'span',
          'text', line
        ))
      ));
    END IF;
  END LOOP;
  RETURN result;
END;
$func$;

-- root-level fields: contact-form / cta / event-calendar / page-hero / reservation-form (description)
UPDATE sections
SET config = jsonb_set(config, '{description}', public.text_to_portable_blocks(config->>'description'))
WHERE type IN ('contact-form', 'cta', 'event-calendar', 'page-hero', 'reservation-form')
  AND jsonb_typeof(config->'description') = 'string';

-- concept.body
UPDATE sections
SET config = jsonb_set(config, '{body}', public.text_to_portable_blocks(config->>'body'))
WHERE type = 'concept'
  AND jsonb_typeof(config->'body') = 'string';

-- hero / hero-parallax (subtitle)
UPDATE sections
SET config = jsonb_set(config, '{subtitle}', public.text_to_portable_blocks(config->>'subtitle'))
WHERE type IN ('hero', 'hero-parallax')
  AND jsonb_typeof(config->'subtitle') = 'string';

-- map.address
UPDATE sections
SET config = jsonb_set(config, '{address}', public.text_to_portable_blocks(config->>'address'))
WHERE type = 'map'
  AND jsonb_typeof(config->'address') = 'string';

-- items[] inner fields: faq-list.items[].answer / features.items[].description / testimonial.items[].content
DO $items$
DECLARE
  rec RECORD;
  new_items jsonb;
  item jsonb;
BEGIN
  FOR rec IN SELECT id, type, config FROM sections
    WHERE type IN ('faq-list', 'features', 'testimonial')
      AND jsonb_typeof(config->'items') = 'array'
  LOOP
    new_items := '[]'::jsonb;
    FOR item IN SELECT * FROM jsonb_array_elements(rec.config->'items')
    LOOP
      CASE rec.type
        WHEN 'faq-list' THEN
          IF jsonb_typeof(item->'answer') = 'string' THEN
            item := jsonb_set(item, '{answer}', public.text_to_portable_blocks(item->>'answer'));
          END IF;
        WHEN 'features' THEN
          IF jsonb_typeof(item->'description') = 'string' THEN
            item := jsonb_set(item, '{description}', public.text_to_portable_blocks(item->>'description'));
          END IF;
        WHEN 'testimonial' THEN
          IF jsonb_typeof(item->'content') = 'string' THEN
            item := jsonb_set(item, '{content}', public.text_to_portable_blocks(item->>'content'));
          END IF;
      END CASE;
      new_items := new_items || jsonb_build_array(item);
    END LOOP;
    UPDATE sections SET config = jsonb_set(rec.config, '{items}', new_items) WHERE id = rec.id;
  END LOOP;
END;
$items$;

-- Cleanup: drop the helper function (pg_temp prefix would be cleaner but causes search_path interference)
DROP FUNCTION public.text_to_portable_blocks(text);
