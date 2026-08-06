-- 料金プランの「開始時刻 < 終了時刻」を DB でも守る。
--
-- ## 何が守られていなかったか
--
-- `space_rate_plans` は `start_time` / `end_time`（`"HH:MM"` の VarChar(5)）で
-- 適用時間帯を持つのに、順序を守る CHECK が 1 本も無かった。同表の CHECK 4 本は
-- `effective_from`/`effective_to`（日付の対）・`hourly_price`・両時刻の**書式**だけ。
--
-- 逆転した時間帯は、他の期間列と同じく**保存できるのに一度も効かない**。
-- `rate-plan-resolver.ts` は `start <= t AND t < end` の形で判定するので、
-- start > end なら常に false = そのプランの料金は永久に適用されない。管理者の
-- 画面には「保存できた」と出るので、顧客が想定と違う金額を提示されるまで
-- 誰も気づかない。
--
-- ## なぜ抜けていたか
--
-- 順序制約のゲート（`__tests__/unit/architecture/temporal-order-constraints.test.ts`）は
-- schema.prisma から**`DateTime` の宣言しか読んでいなかった**。この対は
-- `VarChar(5)` なので母集合に入る余地が構造的に無く、「全部の期間の組を見ている」
-- という主張のまま素通りしていた。ゲート側も同じ PR で型を見ない形に直す。
--
-- ## 辞書順で比べてよい理由
--
-- 書式 CHECK が `HH:MM`（ゼロ埋め 2 桁）を強制しているので、文字列の辞書順が
-- そのまま時刻順になる。`end_time` だけは半開区間の終端センチネル `24:00` を
-- 許すが、`"24:00"` は任意の `"HH:MM"`（HH <= 23）より辞書順で後ろなので整合する。
--
-- アプリ側（`spaceRatePlanFormSchema` の refine）は既に `startTime < endTime` を
-- 要求している。ここで足すのは、そこを通らない書込（seed・運用 SQL）に対する層。
--
-- ## 既存データ
--
-- 適用前に本番で流す確認クエリ:
--
--   SELECT count(*) FROM space_rate_plans
--   WHERE start_time IS NOT NULL AND end_time IS NOT NULL AND start_time >= end_time;
--
-- 0 でなければ、この migration はそこで落ちる（migration 内でのデータ修復は
-- 副作用の迂回になるので行わない）。

BEGIN;

ALTER TABLE "space_rate_plans"
  ADD CONSTRAINT "space_rate_plans_time_of_day_order_check"
  CHECK ("start_time" IS NULL OR "end_time" IS NULL OR "start_time" < "end_time");

COMMIT;
