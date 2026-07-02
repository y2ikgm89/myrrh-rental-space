-- Risk 1 では additive migration のみ（旧コードを壊さない）。
-- ただし「除外したはずの lock / style rule」が誤って有効化されると発火する内容を
-- 意図的に含め、.squawk.toml の excluded_rules 回帰を self-test で検出する。
-- self-test: ゼロ exit（違反なし）を期待。

-- nullable 列の追加
ALTER TABLE "settings" ADD COLUMN "note" TEXT;

-- 非 CONCURRENT な index（require-concurrent-index-creation が除外漏れだと発火）
CREATE INDEX "settings_note_idx" ON "settings" ("note");

-- TIMESTAMP（prefer-timestamptz が除外漏れだと発火）
ALTER TABLE "settings" ADD COLUMN "syncedAt" TIMESTAMP(3);

-- INTEGER（prefer-bigint-over-int が除外漏れだと発火）
ALTER TABLE "settings" ADD COLUMN "retryCount" INTEGER;
