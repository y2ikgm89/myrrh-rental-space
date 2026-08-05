-- squawk-ignore-file changing-column-type
--
-- 設立日を timestamptz から date へ。
--
-- 設立日は**瞬間ではなく暦日**で、入力も `<input type="date">` +
-- `z.iso.date()`（日付だけ）。それを timestamptz で持つと「どの時点か」まで
-- 保持してしまい、**読む側のタイムゾーン次第で 1 日ずれる**余地が残る。
-- 同じ性質の列（`blocked_dates.start_date` / `space_rate_plans.effective_from`）は
-- 既に date なので、この 1 本だけが揃っていなかった。
--
-- ## 今ずれているわけではない
--
-- 現状の書込は `new Date("YYYY-MM-DD")`（= UTC 深夜）で、読み出しも
-- `toISOString()` と先頭 10 文字の切り出しなので、**往復は今のところ正しい**。
-- 正しさが「全員が UTC で読む」という書かれていない約束に依存していることが
-- 問題で、この migration はその依存を型で消す。
--
-- ## 変換は UTC 基準で行う
--
-- `timestamptz::date` は**セッションの TimeZone に依存する**。既存値は上記のとおり
-- UTC 深夜として書かれているので、`AT TIME ZONE 'UTC'` を明示して固定する。
-- 省略すると、実行環境の TimeZone 次第で前日になりうる。
--
-- ## 破壊的 DDL であること
--
-- `ALTER COLUMN ... TYPE` は deploy-production.yml の破壊的 DDL 判定に合致し、
-- 計画ダウンタイムが自動で付く（意図どおり）。squawk 免除が破壊的判定と
-- 一致していることは migration-squawk-ignore-is-breaking.test.ts が機械強制する。

BEGIN;

ALTER TABLE "settings_organization"
  ALTER COLUMN "established_date" TYPE date
  USING ("established_date" AT TIME ZONE 'UTC')::date;

COMMIT;
