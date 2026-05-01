-- Phase 2A: Legacy ctaPrimary / ctaSecondary を buttons[] に変換 + フィールド削除
--
-- 対象: hero / cta セクションの config に ctaPrimary または ctaSecondary が残っている場合、
-- buttons[] (新 SSoT) に統合してから legacy フィールドを削除する。
--
-- buttons 既存配列がある場合は legacy 取り込み (concat) せず、legacy フィールド削除のみ行う
-- (jsonb_build_array は ctaPrimary/Secondary が未指定だと空配列になり || で no-op となる)。
-- iconName / size / openInNewTab はデフォルト値 ("" / "lg" / false) を埋める。

UPDATE sections SET config = jsonb_set(
  config - 'ctaPrimary' - 'ctaSecondary',
  '{buttons}',
  COALESCE(config->'buttons', '[]'::jsonb) ||
    CASE
      WHEN config->'ctaPrimary'->>'text' IS NOT NULL AND config->'ctaPrimary'->>'url' IS NOT NULL
      THEN jsonb_build_array(jsonb_build_object(
        'text', config->'ctaPrimary'->>'text',
        'url', config->'ctaPrimary'->>'url',
        'variant', 'primary',
        'size', 'lg',
        'iconName', '',
        'openInNewTab', false
      ))
      ELSE '[]'::jsonb
    END ||
    CASE
      WHEN config->'ctaSecondary'->>'text' IS NOT NULL AND config->'ctaSecondary'->>'url' IS NOT NULL
      THEN jsonb_build_array(jsonb_build_object(
        'text', config->'ctaSecondary'->>'text',
        'url', config->'ctaSecondary'->>'url',
        'variant', 'secondary',
        'size', 'lg',
        'iconName', '',
        'openInNewTab', false
      ))
      ELSE '[]'::jsonb
    END
) WHERE type IN ('hero', 'cta')
  AND (config ? 'ctaPrimary' OR config ? 'ctaSecondary');
