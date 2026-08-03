-- イベント系 4 モデルと SpaceRatePlan の ID を cuid(varchar 30) から uuid へ統一する。
--
-- Prisma の自動生成は DROP COLUMN + ADD COLUMN（= 行の全損）だったので手で書き直してある。
-- `ALTER COLUMN ... TYPE` なら索引・CHECK 制約・手書き CONSTRAINT TRIGGER が保存され、
-- 行も関連も残る。
--
-- ## 新 ID の作り方
--
-- `md5(旧 id)` を決定的な写像に使う。親と子が同じ式で同じ値になるので、対応表を
-- 作らずに FK の整合が保たれる。
--
-- ただし **md5 をそのまま uuid にしてはいけない**。RFC 4122 の version / variant
-- ニブルが乱数になり、アプリ側の `z.uuid()` が**約半数を拒否する**（実測: Zod 4 の
-- uuid 正規表現は version 1-8 と variant 8/9/a/b を強制する）。13 文字目を '4'、
-- 17 文字目を '8' に上書きして v4 の形に整える。
--
-- ## 適用前に本番で流す確認クエリ
--
-- トランザクションで包んであるため、失敗時の表示は実際の違反ではなく
-- `current transaction is aborted` になる。原因はこちらで特定する。
--
--   -- 1) 影響行数（この migration が書き換える行の総数）
--   SELECT 'events' AS t, count(*) FROM events
--   UNION ALL SELECT 'event_time_slots', count(*) FROM event_time_slots
--   UNION ALL SELECT 'event_tickets', count(*) FROM event_tickets
--   UNION ALL SELECT 'event_registrations', count(*) FROM event_registrations
--   UNION ALL SELECT 'space_rate_plans', count(*) FROM space_rate_plans;
--
--   -- 2) md5 衝突がないこと（各行 0 であること）
--   SELECT count(*) - count(DISTINCT md5(id)) FROM events;
--   SELECT count(*) - count(DISTINCT md5(id)) FROM event_time_slots;
--   SELECT count(*) - count(DISTINCT md5(id)) FROM event_tickets;
--   SELECT count(*) - count(DISTINCT md5(id)) FROM event_registrations;
--   SELECT count(*) - count(DISTINCT md5(id)) FROM space_rate_plans;
--
-- ## 書き換えない参照（意図的）
--
-- `audit_logs.resourceId` / `terms_agreements.resourceId` / `admin_notification.resourceId`
-- と `reservations.rateBreakdownJson` の `ratePlanId` には旧 cuid が残る。前 3 者は
-- append-only の証跡（audit_logs は entryHash の計算対象なので更新すると HMAC chain が
-- 壊れる）、最後は会計スナップショットで、いずれも「その時点の記録」なので書き換えない。
-- どれも polymorphic な text 列なので型は問題にならない。

BEGIN;

-- 1) 型を変える列を参照している FK を一旦外す
ALTER TABLE "event_time_slots" DROP CONSTRAINT "event_time_slots_eventId_fkey";
ALTER TABLE "event_tickets" DROP CONSTRAINT "event_tickets_eventId_fkey";
ALTER TABLE "event_registrations" DROP CONSTRAINT "event_registrations_eventId_fkey";
ALTER TABLE "event_registrations" DROP CONSTRAINT "event_registrations_slotId_fkey";
ALTER TABLE "event_registrations" DROP CONSTRAINT "event_registrations_ticketId_fkey";
ALTER TABLE "receipts" DROP CONSTRAINT "receipts_eventRegistrationId_fkey";
ALTER TABLE "refunds" DROP CONSTRAINT "refunds_eventRegistrationId_fkey";

-- 2) `event_time_slots` の手書き CONSTRAINT TRIGGER 2 本を外す。
-- どちらも `UPDATE OF "eventId"` の列リストを持つため、列が定義に依存していると
-- PostgreSQL が `cannot alter type of a column used in a trigger definition` で拒否する。
-- **これは実測で見つけた**（型変換だけ流したら本番でここで止まっていた）。
-- trigger 自体は 5) で同じ定義に戻す。呼び先の関数は 4) で引数型だけ直す。
DROP TRIGGER "event_time_slots_no_reservation_overlap_check" ON "event_time_slots";
DROP TRIGGER "event_time_slots_schedule_integrity_check" ON "event_time_slots";

-- 3) varchar(30) -> uuid
-- squawk-ignore changing-column-type
ALTER TABLE "space_rate_plans"
  ALTER COLUMN "id" TYPE UUID USING overlay(overlay(md5("id") placing '4' from 13) placing '8' from 17)::uuid;

-- squawk-ignore changing-column-type
ALTER TABLE "events"
  ALTER COLUMN "id" TYPE UUID USING overlay(overlay(md5("id") placing '4' from 13) placing '8' from 17)::uuid;

-- squawk-ignore changing-column-type
ALTER TABLE "event_time_slots"
  ALTER COLUMN "id" TYPE UUID USING overlay(overlay(md5("id") placing '4' from 13) placing '8' from 17)::uuid,
  ALTER COLUMN "eventId" TYPE UUID USING overlay(overlay(md5("eventId") placing '4' from 13) placing '8' from 17)::uuid;

-- squawk-ignore changing-column-type
ALTER TABLE "event_tickets"
  ALTER COLUMN "id" TYPE UUID USING overlay(overlay(md5("id") placing '4' from 13) placing '8' from 17)::uuid,
  ALTER COLUMN "eventId" TYPE UUID USING overlay(overlay(md5("eventId") placing '4' from 13) placing '8' from 17)::uuid;

-- squawk-ignore changing-column-type
ALTER TABLE "event_registrations"
  ALTER COLUMN "id" TYPE UUID USING overlay(overlay(md5("id") placing '4' from 13) placing '8' from 17)::uuid,
  ALTER COLUMN "eventId" TYPE UUID USING overlay(overlay(md5("eventId") placing '4' from 13) placing '8' from 17)::uuid,
  ALTER COLUMN "slotId" TYPE UUID USING overlay(overlay(md5("slotId") placing '4' from 13) placing '8' from 17)::uuid,
  ALTER COLUMN "ticketId" TYPE UUID USING overlay(overlay(md5("ticketId") placing '4' from 13) placing '8' from 17)::uuid;

-- squawk-ignore changing-column-type
ALTER TABLE "receipts"
  ALTER COLUMN "eventRegistrationId" TYPE UUID USING overlay(overlay(md5("eventRegistrationId") placing '4' from 13) placing '8' from 17)::uuid;

-- refunds は append-only trigger（refunds_no_update）を持つが、ALTER COLUMN TYPE は
-- 行トリガーを発火させないので bypass GUC は要らない（実測で確認済み）。
-- squawk-ignore changing-column-type
ALTER TABLE "refunds"
  ALTER COLUMN "eventRegistrationId" TYPE UUID USING overlay(overlay(md5("eventRegistrationId") placing '4' from 13) placing '8' from 17)::uuid;

-- 4) trigger 関数の引数・変数型を uuid に合わせる。
--
-- `check_event_schedule_integrity` は `text` 引数で宣言されており、uuid になった
-- `events.id` / `event_time_slots."eventId"` を渡すと
-- `function check_event_schedule_integrity(uuid) does not exist` で落ちる
-- （PostgreSQL は uuid → text の暗黙キャストを持たない）。**実測で見つけた**:
-- 型変換だけ流すと、イベント作成・スロット変更の全経路がこの例外で死ぬ。
--
-- `CREATE OR REPLACE` は引数型を変えられない（別関数になる）ので DROP して作り直す。
-- 本体は既存の定義（pg_get_functiondef の出力）をそのまま移し、引数型だけ変える。
DROP FUNCTION "check_event_schedule_integrity"(text);

CREATE FUNCTION "check_event_schedule_integrity"("targetEventId" uuid)
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  current_mode "EventScheduleMode";
  current_deadline timestamp with time zone;
  slot_count integer;
  first_slot_start timestamp with time zone;
BEGIN
  SELECT "scheduleMode", "registrationDeadline"
  INTO current_mode, current_deadline
  FROM "events"
  WHERE "id" = "targetEventId"
    AND "deletedAt" IS NULL;

  IF current_mode IS NULL THEN
    RETURN;
  END IF;

  SELECT COUNT(*), MIN("startAt")
  INTO slot_count, first_slot_start
  FROM "event_time_slots"
  WHERE "eventId" = "targetEventId";

  IF current_mode = 'SINGLE_OCCURRENCE' AND slot_count <> 1 THEN
    RAISE EXCEPTION
      'SINGLE_OCCURRENCE events must have exactly one EventTimeSlot; eventId=%, slot_count=%',
      "targetEventId",
      slot_count
      USING ERRCODE = '23514';
  END IF;

  IF current_mode = 'TIMED_ENTRY' AND slot_count < 2 THEN
    RAISE EXCEPTION
      'TIMED_ENTRY events must have at least two EventTimeSlot rows; eventId=%, slot_count=%',
      "targetEventId",
      slot_count
      USING ERRCODE = '23514';
  END IF;

  IF current_deadline IS NOT NULL
    AND first_slot_start IS NOT NULL
    AND current_deadline > first_slot_start THEN
    RAISE EXCEPTION
      'Event registrationDeadline must be on or before the first slot start; eventId=%',
      "targetEventId"
      USING ERRCODE = '23514';
  END IF;
END;
$function$;

-- slot 側の trigger 関数はローカル変数を `text` で宣言しているので、そちらも uuid にする。
CREATE OR REPLACE FUNCTION "check_event_schedule_integrity_from_slot"()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  target_event_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_event_id := OLD."eventId";
    PERFORM "check_event_schedule_integrity"(target_event_id);
    RETURN OLD;
  END IF;

  target_event_id := NEW."eventId";
  PERFORM "check_event_schedule_integrity"(target_event_id);

  IF TG_OP = 'UPDATE' AND OLD."eventId" <> NEW."eventId" THEN
    PERFORM "check_event_schedule_integrity"(OLD."eventId");
  END IF;

  RETURN NEW;
END;
$function$;

-- 5) 手書き CONSTRAINT TRIGGER を同じ定義で戻す（pg_get_triggerdef の出力そのまま）
CREATE CONSTRAINT TRIGGER "event_time_slots_no_reservation_overlap_check"
  AFTER INSERT OR UPDATE OF "eventId", "startAt", "endAt" ON "event_time_slots"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_event_slot_no_reservation_overlap();

CREATE CONSTRAINT TRIGGER "event_time_slots_schedule_integrity_check"
  AFTER INSERT OR DELETE OR UPDATE OF "eventId", "startAt" ON "event_time_slots"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_event_schedule_integrity_from_slot();

-- 6) FK を元の名前・元の動作で戻す
ALTER TABLE "event_time_slots" ADD CONSTRAINT "event_time_slots_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_tickets" ADD CONSTRAINT "event_tickets_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "event_time_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "event_tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_eventRegistrationId_fkey" FOREIGN KEY ("eventRegistrationId") REFERENCES "event_registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_eventRegistrationId_fkey" FOREIGN KEY ("eventRegistrationId") REFERENCES "event_registrations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

COMMIT;
