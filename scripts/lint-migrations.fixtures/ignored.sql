-- 意図的な破壊的 migration（旧コードからの参照ゼロを確認の上）。
-- 直前行の squawk-ignore で当該 rule のみ抑止する（ゲートの正規の escape hatch）。
-- self-test: ゼロ exit（抑止が効く）を期待。
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "legacyFlag";
