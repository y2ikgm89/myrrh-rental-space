-- discountWarningEnabled: 割引警告UIが未実装で価格計算の warnings[] も showWarning（直値）で gate され
--   本設定を一切参照しない死に設定だった。
-- taxDisplayModeAdmin: 管理画面の価格描画は formatCurrency/formatPrice の素フォーマットを使い displayMode を
--   渡さず本設定を一切参照しない死に設定だった（公開版 taxDisplayModePublic は TaxSettingsProvider→
--   useFormatPrice→formatPriceWithTax で wired のため残す）。
-- 両者とも設定面（列・管理UI・スキーマ・型・マッピング・テスト）を同一 PR で全除去済み。
-- pre-release・単一インスタンスのため big-bang DROP。enum TaxDisplayMode は taxDisplayModePublic で使用継続のため残置。
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "discountWarningEnabled";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "taxDisplayModeAdmin";
