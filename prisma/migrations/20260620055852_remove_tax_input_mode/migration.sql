-- 価格モデルは全面的に税抜入力前提（calculateTaxIncludedPrice が税抜価格を受け取る）で、
-- taxInputMode は use-format-price 等で常に tax_excluded にハードコードされ、価格計算・表示の
-- どこからも参照されない死に設定だった。税込入力対応は価格保存/表示の大改修が必要なため、
-- 設定面（列・管理UI・フォーム・型・マッピング）を撤去し税抜入力に一本化する。参照は同一 PR で全除去済み。
-- pre-release・単一インスタンスのため big-bang を許容。enum TaxInputMode は将来再利用に備え残置（DROP TYPE しない）。
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "taxInputMode";
