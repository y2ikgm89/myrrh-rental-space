-- Drop Settings.reviewsEnabledGlobal column.
--
-- Phase 6: `featureModules.reviews` SSoT へ完全統合済み。
-- 旧 column は Phase 1 migration で値を `featureModules.reviews` に複製済みのため
-- ここで安全に DROP できる（ロールバック時は手動で featureModules.reviews を Boolean に戻す手順）。

ALTER TABLE settings DROP COLUMN "reviewsEnabledGlobal";
