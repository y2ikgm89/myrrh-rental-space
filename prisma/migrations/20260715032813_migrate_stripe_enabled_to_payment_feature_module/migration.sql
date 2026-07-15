-- Migrate `Settings.stripeEnabled` (boolean column) → `Settings.featureModules."payment"` (JSONB key).
--
-- Feature Module registry の `payment` module 導入に伴う二層分離。
-- 業務判断 (payment ON/OFF) を Feature Module SSoT に集約し、credentials 列は
-- Stripe 連携 UI の管轄のまま残す (Shopify shop.features / Stripe Capabilities の設計)。
--
-- 契約:
-- - existing install: stripeEnabled=true  → featureModules.payment=true  (現行運用を維持)
-- - existing install: stripeEnabled=false → featureModules.payment=false (fail-closed 維持)
-- - new install: seed.ts が buildInitialFeatureModules 経由で payment=true を書く (dev) /
--   false を書く (production template)。migration 側は既存 install のみをケアする。
--
-- 冪等性: `||` (jsonb merge) は右辺キーで既存値を上書きする。migration 再実行 (baseline
-- reset 経路) では stripeEnabled 列が既に無いため UPDATE 自体がスキップされて安全。

-- Step 1: 既存 install の stripeEnabled 値を featureModules.payment に写経する。
-- to_jsonb(stripeEnabled) は boolean → JSONB boolean へ 1:1 変換 (NULL 不在: 列は NOT NULL DEFAULT false)。
UPDATE "settings"
SET "featureModules" = COALESCE("featureModules", '{}'::jsonb)
  || jsonb_build_object('payment', to_jsonb("stripeEnabled"));

-- Step 2: 旧列を DROP する。この migration は main への merge で計画ダウンタイム deploy を
-- トリガーする (deploy workflow が DROP COLUMN を検知して scaling=0 停止 + 310 秒 drain)。
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "stripeEnabled";
