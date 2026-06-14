-- 後方互換を壊す破壊的変更（旧コードが unknown column → 500）。
-- ゲートはこれを検出して CI を落とすべき（self-test: 非ゼロ exit を期待）。
ALTER TABLE "settings" DROP COLUMN "legacyFlag";
