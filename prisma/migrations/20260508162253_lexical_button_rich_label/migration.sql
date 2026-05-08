-- Lexical ButtonNode rich-label migration (Phase 5)
--
-- 旧: { type: "button", text: string, variant: "primary"|"secondary"|"outline", size, alignment, openInNewTab }
-- 新: { type: "button", label: [{_key:string, type:"text", value:string} | {_key:string, type:"icon", name:string}],
--       variant: "primary"|"secondary"|"ghost"|"link"|"editorial", size, alignment, color, openInNewTab }
--
-- 変換:
--   1. text フィールド → label token 配列 (_key UUID 付き) に変換、text フィールド削除
--   2. variant "outline" → "editorial" (clean-break rename)
--   3. color フィールド未設定なら "default" を追加
--
-- 対象: News / NewsVersion / Post / PostVersion / Section / TermsDocument の contentJson
-- Lexical JSON は children を再帰的に持つため、PL/pgSQL 再帰関数で walk
--
-- 注: 並行 migration `20260508162408_button_label_token_keys` は
--     sections.config.buttons[].label[] と navigation_items.label[] の既存 token に
--     _key を付与する役割。本 migration は Lexical 本文中の Button ノードのみを対象。

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- 再帰変換関数
-- ============================================================================

CREATE OR REPLACE FUNCTION migrate_lexical_button_node_v5(node JSONB)
RETURNS JSONB AS $$
DECLARE
  result JSONB := node;
  new_label JSONB;
  old_text TEXT;
  old_variant TEXT;
  children JSONB;
  new_children JSONB;
  i INT;
BEGIN
  -- node が object でなければそのまま返す
  IF jsonb_typeof(node) <> 'object' THEN
    RETURN node;
  END IF;

  -- ButtonNode かどうか
  IF result ? 'type' AND result->>'type' = 'button' THEN
    -- 1. text → label token 配列に変換 (_key UUID 付き)
    IF result ? 'text' AND NOT (result ? 'label') THEN
      old_text := COALESCE(result->>'text', '');
      IF old_text = '' THEN
        new_label := '[]'::JSONB;
      ELSE
        new_label := jsonb_build_array(
          jsonb_build_object(
            '_key', gen_random_uuid()::text,
            'type', 'text',
            'value', old_text
          )
        );
      END IF;
      result := result || jsonb_build_object('label', new_label);
      result := result - 'text';
    END IF;

    -- 2. variant "outline" → "editorial"
    IF result ? 'variant' THEN
      old_variant := result->>'variant';
      IF old_variant = 'outline' THEN
        result := jsonb_set(result, '{variant}', '"editorial"'::JSONB);
      END IF;
    END IF;

    -- 3. color 未設定なら "default"
    IF NOT (result ? 'color') THEN
      result := result || '{"color": "default"}'::JSONB;
    END IF;
  END IF;

  -- 再帰的に children を処理
  IF result ? 'children' AND jsonb_typeof(result->'children') = 'array' THEN
    children := result->'children';
    new_children := '[]'::JSONB;
    FOR i IN 0..jsonb_array_length(children) - 1 LOOP
      new_children := new_children || jsonb_build_array(
        migrate_lexical_button_node_v5(children->i)
      );
    END LOOP;
    result := jsonb_set(result, '{children}', new_children);
  END IF;

  RETURN result;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- ============================================================================
-- 6 テーブルに適用
-- ============================================================================

UPDATE "news"
SET "contentJson" = migrate_lexical_button_node_v5("contentJson")
WHERE "contentJson" IS NOT NULL;

UPDATE "news_versions"
SET "contentJson" = migrate_lexical_button_node_v5("contentJson")
WHERE "contentJson" IS NOT NULL;

UPDATE "posts"
SET "contentJson" = migrate_lexical_button_node_v5("contentJson")
WHERE "contentJson" IS NOT NULL;

UPDATE "post_versions"
SET "contentJson" = migrate_lexical_button_node_v5("contentJson")
WHERE "contentJson" IS NOT NULL;

UPDATE "sections"
SET "contentJson" = migrate_lexical_button_node_v5("contentJson")
WHERE "contentJson" IS NOT NULL;

UPDATE "terms_documents"
SET "contentJson" = migrate_lexical_button_node_v5("contentJson")
WHERE "contentJson" IS NOT NULL;

-- ============================================================================
-- 関数を削除（migration ローカルで使用完了）
-- ============================================================================

DROP FUNCTION migrate_lexical_button_node_v5(JSONB);
