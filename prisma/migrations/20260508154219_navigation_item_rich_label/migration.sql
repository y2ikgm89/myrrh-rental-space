-- NavigationItem rich label migration
-- 旧: { label: VARCHAR, iconName: VARCHAR? }
-- 新: { label: JSONB }（ButtonLabelToken[]）
--
-- 既存の prefix 配置 (icon 前置) を維持しつつ token 配列形式へ変換。
-- iconName カラムは削除（クリーンブレーク）。

-- 1. label を JSONB token 配列へ変換
ALTER TABLE "navigation_items"
  ALTER COLUMN "label" TYPE JSONB USING (
    CASE
      WHEN "iconName" IS NOT NULL AND "iconName" <> ''
        THEN jsonb_build_array(
          jsonb_build_object('type', 'icon', 'name', "iconName"),
          jsonb_build_object('type', 'text', 'value', "label")
        )
      ELSE jsonb_build_array(
        jsonb_build_object('type', 'text', 'value', "label")
      )
    END
  );

-- 2. iconName カラム削除
ALTER TABLE "navigation_items" DROP COLUMN "iconName";
