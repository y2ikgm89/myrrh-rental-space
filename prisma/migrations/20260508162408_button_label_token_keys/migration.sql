-- Add _key UUID to all existing ButtonLabelToken[] tokens
-- (Sanity Portable Text 互換 stable identity for React reconciliation)
--
-- 対象:
-- 1. sections.config.buttons[].label[] (全 buttons[] section の token 配列)
-- 2. navigation_items.label[] (header/footer ナビメニューの token 配列)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. sections.config.buttons[].label[] に _key を付与
DO $sections$
DECLARE
  rec RECORD;
  new_buttons jsonb;
  btn jsonb;
  new_label jsonb;
  token jsonb;
BEGIN
  FOR rec IN
    SELECT id, config FROM "sections"
    WHERE config ? 'buttons' AND jsonb_typeof(config->'buttons') = 'array'
  LOOP
    new_buttons := '[]'::jsonb;
    FOR btn IN SELECT * FROM jsonb_array_elements(rec.config->'buttons')
    LOOP
      new_label := '[]'::jsonb;
      IF btn ? 'label' AND jsonb_typeof(btn->'label') = 'array' THEN
        FOR token IN SELECT * FROM jsonb_array_elements(btn->'label')
        LOOP
          IF NOT (token ? '_key') THEN
            token := token || jsonb_build_object('_key', gen_random_uuid()::text);
          END IF;
          new_label := new_label || token;
        END LOOP;
      END IF;
      new_buttons := new_buttons || (btn || jsonb_build_object('label', new_label));
    END LOOP;
    UPDATE "sections"
    SET config = jsonb_set(rec.config, '{buttons}', new_buttons)
    WHERE id = rec.id;
  END LOOP;
END
$sections$;

-- 2. navigation_items.label[] に _key を付与
DO $navs$
DECLARE
  rec RECORD;
  new_label jsonb;
  token jsonb;
BEGIN
  FOR rec IN
    SELECT id, label FROM "navigation_items"
    WHERE jsonb_typeof(label) = 'array'
  LOOP
    new_label := '[]'::jsonb;
    FOR token IN SELECT * FROM jsonb_array_elements(rec.label)
    LOOP
      IF NOT (token ? '_key') THEN
        token := token || jsonb_build_object('_key', gen_random_uuid()::text);
      END IF;
      new_label := new_label || token;
    END LOOP;
    UPDATE "navigation_items" SET label = new_label WHERE id = rec.id;
  END LOOP;
END
$navs$;
