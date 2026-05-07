-- Add Settings.featureModules JSONB column for feature toggle SSoT.
--
-- Sanity / Stripe Capabilities / Shopify shop.features 合成パターン:
-- - registry はメタデータのみ（@/shared/lib/features/registry）
-- - DB が SSoT（Record<FeatureModule, boolean>）
-- - registry に implicit default なし — seed/migration が全 module を explicit に設定
--
-- Phase 1 では reviewsEnabledGlobal は保持し、新 column に値を複製のみ行う。
-- Phase 6 で reviewsEnabledGlobal を DROP し featureModules.reviews へ完全移行する。

-- 1. Add column with empty default (DB-level)
ALTER TABLE settings
  ADD COLUMN "featureModules" JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 2. Initialize featureModules for existing singleton row.
--    既存サイトの挙動を保持するため全 9 module を true で起動、reviews のみ既存値を引き継ぐ。
UPDATE settings
SET "featureModules" = jsonb_build_object(
  'spaces', true,
  'reservation', true,
  'events', true,
  'posts', true,
  'news', true,
  'faq', true,
  'access', true,
  'contact', true,
  'reviews', "reviewsEnabledGlobal"
)
WHERE id = 'singleton';
