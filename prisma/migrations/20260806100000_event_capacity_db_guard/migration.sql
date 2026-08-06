-- 定員を超えた確定申込を DB でも受け付けないようにする。
--
-- ## 何が守られていなかったか
--
-- 定員まわりで DB が見ていたのは「値が 1 以上か」だけだった:
--
--   event_time_slots_capacity_positive        capacity >= 1
--   event_tickets_capacity_positive_or_null   capacity IS NULL OR capacity >= 1
--   event_registrations_quantity_positive     quantity >= 1
--
-- 「確定申込の合計が定員を超えない」という不変条件は 1 本も無く、実効的な保証は
-- アプリが advisory lock 728350 を取り、CONFIRMED の quantity 合計で判定することだけに
-- 依存していた。アプリを迂回する書込（seed・運用 SQL・将来ロックを取り忘れる新経路）で
-- 定員超過が黙って成立する。
--
-- 顧客側の見え方: 「残り 3 枠」の表示で申し込み、決済まで完了したうえで当日入場できない。
-- 定員を直接下げる書込（capacity=20 の枠に確定 12 名がいる状態で capacity=5 へ UPDATE）も
-- DB は受理し、公開ページの「残り」は負を 0 にクリップして**満席**に化ける。
-- 既存 12 名は全員が有効な確定申込のまま残る。
--
-- ## 判定はアプリと同じ 2 段
--
--   1. 枠: SUM(quantity) WHERE slot_id = X AND status = 'CONFIRMED' <= slot.capacity
--   2. チケット（capacity が非 NULL のときだけ）:
--      SUM(quantity) WHERE slot_id = X AND ticket_id = Y AND status = 'CONFIRMED'
--        <= ticket.capacity
--
-- チケット定員は**枠ごと**に効く（`registration-create-commands.ts` の集計が
-- slot_id と ticket_id の両方で絞っている。公開ページの残枠計算も同じ）。
--
-- ## 下げる側の書込も塞ぐ
--
-- 申込側の trigger だけでは「定員を下げる UPDATE」を止められない。
-- `event_time_slots.capacity` と `event_tickets.capacity` の UPDATE にも同じ検査を掛ける。
--
-- ## 既存データ
--
-- CONSTRAINT TRIGGER は既存行を走査しないので、超過が残っていても適用は成功して
-- しまう。**コメントの確認クエリは誰も流さない**ので、実行される DO ブロックで止める
-- （`scripts/migration-preconditions.ts` が migrate の前に流して巻き戻す）。

BEGIN;

-- 枠とチケットの定員を、確定申込の合計と突き合わせる。
-- trigger 3 本から呼ぶ共通の検査。
CREATE FUNCTION assert_event_capacity_not_exceeded(
  target_slot_id UUID,
  target_ticket_id UUID
) RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  slot_capacity INTEGER;
  slot_confirmed INTEGER;
  ticket_capacity INTEGER;
  ticket_confirmed INTEGER;
BEGIN
  SELECT capacity INTO slot_capacity
  FROM event_time_slots WHERE id = target_slot_id;

  -- 枠が消えている（親イベントの cascade 削除中など）なら見るものが無い。
  IF slot_capacity IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO slot_confirmed
  FROM event_registrations
  WHERE slot_id = target_slot_id AND status = 'CONFIRMED';

  IF slot_confirmed > slot_capacity THEN
    RAISE EXCEPTION
      'EventTimeSlot % capacity exceeded: confirmed % > capacity %',
      target_slot_id, slot_confirmed, slot_capacity
      USING ERRCODE = 'check_violation';
  END IF;

  IF target_ticket_id IS NULL THEN
    RETURN;
  END IF;

  SELECT capacity INTO ticket_capacity
  FROM event_tickets WHERE id = target_ticket_id;

  -- capacity NULL = 枚数無制限（枠の定員だけが効く）。
  IF ticket_capacity IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO ticket_confirmed
  FROM event_registrations
  WHERE slot_id = target_slot_id
    AND ticket_id = target_ticket_id
    AND status = 'CONFIRMED';

  IF ticket_confirmed > ticket_capacity THEN
    RAISE EXCEPTION
      'EventTicket % capacity exceeded on slot %: confirmed % > capacity %',
      target_ticket_id, target_slot_id, ticket_confirmed, ticket_capacity
      USING ERRCODE = 'check_violation';
  END IF;
END;
$function$;

CREATE FUNCTION check_event_registration_capacity()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM assert_event_capacity_not_exceeded(NEW.slot_id, NEW.ticket_id);
  RETURN NEW;
END;
$function$;

-- 枠の定員を下げる UPDATE 側。チケット定員はこの操作で変わらないので NULL を渡す。
CREATE FUNCTION check_event_slot_capacity_not_exceeded()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM assert_event_capacity_not_exceeded(NEW.id, NULL);
  RETURN NEW;
END;
$function$;

-- チケットの定員を下げる UPDATE 側。そのチケットで確定申込がある枠すべてを見る。
CREATE FUNCTION check_event_ticket_capacity_not_exceeded()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  affected_slot_id UUID;
BEGIN
  FOR affected_slot_id IN
    SELECT DISTINCT slot_id FROM event_registrations
    WHERE ticket_id = NEW.id AND status = 'CONFIRMED'
  LOOP
    PERFORM assert_event_capacity_not_exceeded(affected_slot_id, NEW.id);
  END LOOP;
  RETURN NEW;
END;
$function$;

CREATE CONSTRAINT TRIGGER event_registrations_capacity_check
  AFTER INSERT OR UPDATE OF slot_id, ticket_id, status, quantity
  ON event_registrations
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_event_registration_capacity();

CREATE CONSTRAINT TRIGGER event_time_slots_capacity_check
  AFTER UPDATE OF capacity ON event_time_slots
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_event_slot_capacity_not_exceeded();

CREATE CONSTRAINT TRIGGER event_tickets_capacity_check
  AFTER UPDATE OF capacity ON event_tickets
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_event_ticket_capacity_not_exceeded();

-- 既に超過している枠 / チケットが残っていないこと（trigger は既存行を見ないので、
-- ここで実行される形で確かめる）。
DO $$
DECLARE
  offender RECORD;
BEGIN
  SELECT s.id AS slot_id, s.capacity AS capacity, SUM(r.quantity) AS confirmed
    INTO offender
  FROM event_time_slots s
  JOIN event_registrations r ON r.slot_id = s.id AND r.status = 'CONFIRMED'
  GROUP BY s.id, s.capacity
  HAVING SUM(r.quantity) > s.capacity
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'EventTimeSlot % is already over capacity: confirmed % > capacity % — 申込を整理してから再実行する',
      offender.slot_id, offender.confirmed, offender.capacity
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT t.id AS ticket_id, r.slot_id AS slot_id, t.capacity AS capacity,
         SUM(r.quantity) AS confirmed
    INTO offender
  FROM event_tickets t
  JOIN event_registrations r ON r.ticket_id = t.id AND r.status = 'CONFIRMED'
  WHERE t.capacity IS NOT NULL
  GROUP BY t.id, r.slot_id, t.capacity
  HAVING SUM(r.quantity) > t.capacity
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'EventTicket % is already over capacity on slot %: confirmed % > capacity % — 申込を整理してから再実行する',
      offender.ticket_id, offender.slot_id, offender.confirmed, offender.capacity
      USING ERRCODE = 'check_violation';
  END IF;
END $$;

COMMIT;
