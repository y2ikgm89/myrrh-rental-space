-- task #9 PR#5: Settings.refundPolicy JSON カラム追加 (schema-only、後方互換な additive migration)。
--
-- Policy schema: `{ tiers: Array<{ hoursBefore: number; refundRate: number (0-100) }>, defaultRefundRate: number (0-100) }`
-- 例: 7 日前まで 100% / 3 日前まで 50% / それ以降 0%
--   {"tiers": [{"hoursBefore": 168, "refundRate": 100}, {"hoursBefore": 72, "refundRate": 50}], "defaultRefundRate": 0}
--
-- NULL 許容: policy 未設定なら現状の「auto refund は残額全額」動作を維持 (後方互換)。
-- policy 計算 helper + admin settings UI + cancellation-side-effects の適用は本 PR 後の
-- 続 PR で実装 (task #9 PR#5 の domain / UI 部分)。本 migration は schema-only。

ALTER TABLE "settings" ADD COLUMN "refundPolicy" JSONB;
