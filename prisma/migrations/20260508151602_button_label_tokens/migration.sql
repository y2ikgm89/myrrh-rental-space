-- Button label token migration
-- 旧: { text: string, iconName: string, ...other }
-- 新: { label: [{type:"text",value:string},{type:"icon",name:string}?], ...other }
--
-- 既存の prefix 配置 (icon 前置) を維持しつつ token 配列形式へ変換。
-- 旧 text / iconName キーは完全削除（クリーンブレーク）。

DO $migration$
DECLARE
  rec RECORD;
  new_buttons jsonb;
  btn jsonb;
  new_btn jsonb;
  tokens jsonb;
  text_val text;
  icon_val text;
BEGIN
  FOR rec IN
    SELECT id, config FROM "sections"
    WHERE config ? 'buttons' AND jsonb_typeof(config->'buttons') = 'array'
  LOOP
    new_buttons := '[]'::jsonb;
    FOR btn IN SELECT * FROM jsonb_array_elements(rec.config->'buttons')
    LOOP
      text_val := COALESCE(btn->>'text', '');
      icon_val := COALESCE(btn->>'iconName', '');
      tokens := '[]'::jsonb;
      IF icon_val <> '' THEN
        tokens := tokens || jsonb_build_object('type', 'icon', 'name', icon_val);
      END IF;
      IF text_val <> '' THEN
        tokens := tokens || jsonb_build_object('type', 'text', 'value', text_val);
      END IF;
      new_btn := (btn - 'text' - 'iconName') || jsonb_build_object('label', tokens);
      new_buttons := new_buttons || new_btn;
    END LOOP;
    UPDATE "sections"
    SET config = jsonb_set(rec.config, '{buttons}', new_buttons)
    WHERE id = rec.id;
  END LOOP;
END
$migration$;
