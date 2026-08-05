-- 期間を表す列の組に「開始 <= 終了」を持たせる。
--
-- ## 何が守られていなかったか
--
-- 逆転した期間は**保存できるのに一度も効かない**。範囲判定が
-- `start <= target AND end >= target` の形なので、start > end だと常に false になる:
--
--   | 表 | 逆転すると |
--   | --- | --- |
--   | blocked_dates | 全社休業日を入れても **その日に予約が入る**（一覧には出るので気づけない） |
--   | coupons | クーポンが **永久に使えない**。顧客はコードを入れても「無効」と言われ続ける |
--   | announcement_bars | 告知が **一度も表示されない** |
--   | smart_lock_passcodes | 発行済みの暗証番号が **一度も解錠できない**（顧客は現地で入れない） |
--
-- どれも管理者の画面上は「保存できた」ように見えるので、報告が上がるまで分からない。
--
-- ## 非対称だった
--
-- 同じ形の期間を持つ `reservations`（`start_time < end_time`）、
-- `event_time_slots`（`start_at < end_at`）、
-- `space_rate_plans`（`effective_from <= effective_to`）には既に制約があり、
-- **この 3 つだけが抜けていた**。「順序制約はある」という主張を検証するゲートが
-- 無かったので、非対称に誰も気づけなかった。ゲートは
-- `__tests__/unit/architecture/temporal-order-constraints.test.ts` で足す。
--
-- ## 等号の有無
--
-- 日付（`date`）と表示期間は**同日・同時刻を許す**ので `<=`。
-- 予約とイベント枠だけが `<`（長さ 0 の予約は意味を成さない）で、既存の定義を変えない。
--
-- ## events の導出列
--
-- `first_slot_start_at` / `last_slot_end_at` は slots からの非正規化キャッシュ。
-- 人が入力しないが、逆転していたら導出が壊れている証拠なので同じ制約を置く。
--
-- ## 既存データ
--
-- アプリ側（Zod の `superRefine`）が 3 つとも既に逆転を弾いているので、
-- 違反行があるとすれば別経路（seed / 生 SQL）由来。migration 内でデータを直すのは
-- 禁止なので、違反があればここで落ちる。適用前に本番で流す確認クエリ:
--
--   SELECT 'blocked_dates' AS t, count(*) FROM blocked_dates WHERE start_date > end_date
--   UNION ALL SELECT 'coupons', count(*) FROM coupons WHERE valid_until IS NOT NULL AND valid_from > valid_until
--   UNION ALL SELECT 'announcement_bars', count(*) FROM announcement_bars WHERE start_at IS NOT NULL AND end_at IS NOT NULL AND start_at > end_at
--   UNION ALL SELECT 'events', count(*) FROM events WHERE first_slot_start_at IS NOT NULL AND last_slot_end_at IS NOT NULL AND first_slot_start_at > last_slot_end_at
--   UNION ALL SELECT 'smart_lock_passcodes', count(*) FROM smart_lock_passcodes WHERE start_time > end_time;

BEGIN;

ALTER TABLE "blocked_dates"
  ADD CONSTRAINT "blocked_dates_date_order_check"
  CHECK ("start_date" <= "end_date");

ALTER TABLE "coupons"
  ADD CONSTRAINT "coupons_validity_order_check"
  CHECK ("valid_until" IS NULL OR "valid_from" <= "valid_until");

ALTER TABLE "announcement_bars"
  ADD CONSTRAINT "announcement_bars_period_order_check"
  CHECK ("start_at" IS NULL OR "end_at" IS NULL OR "start_at" <= "end_at");

-- 有効時刻の窓。`customer-passcode-queries.ts` が
-- `t >= start_time && t <= end_time` で判定するので、逆転は「常に解錠不可」になる。
ALTER TABLE "smart_lock_passcodes"
  ADD CONSTRAINT "smart_lock_passcodes_window_order_check"
  CHECK ("start_time" <= "end_time");

ALTER TABLE "events"
  ADD CONSTRAINT "events_slot_span_order_check"
  CHECK ("first_slot_start_at" IS NULL OR "last_slot_end_at" IS NULL OR "first_slot_start_at" <= "last_slot_end_at");

COMMIT;
