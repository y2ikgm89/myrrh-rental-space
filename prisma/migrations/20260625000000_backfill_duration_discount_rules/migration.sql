-- Backfill: durationDiscountRules を JSON 文字列スカラーから配列型に正規化
--
-- 背景: 旧 updateDiscountSettings は durationDiscountRules を JSON.stringify して
-- Prisma Json 列に書き込んでいた。Prisma は string を渡すと JSON 文字列スカラーとして
-- 保存するため、読み側 (parseDurationDiscountRules) の Array.isArray が常に false となり
-- durationDiscountEnabled=true でも長時間割引が一切適用されない CRITICAL bug が発生する。
--
-- 既存の本番データに同形式の string が残っている可能性があるため、
-- jsonb_typeof = 'string' の行を ::jsonb 経由で配列に戻す。
-- string 以外 (array / object / null) の行はそのまま。

UPDATE "settings"
SET "durationDiscountRules" = ("durationDiscountRules" #>> '{}')::jsonb
WHERE jsonb_typeof("durationDiscountRules") = 'string';
