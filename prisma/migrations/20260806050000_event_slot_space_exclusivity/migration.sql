-- 同じ Space の同じ時刻を、2 つの占有が同時に持てないようにする。
--
-- ## 何が守られていなかったか
--
-- Space は「時間帯 = 排他資源」で、占有するのは 2 種類ある:
--
--   - Reservation … deleted_at IS NULL かつ status ∈ {PENDING, CONFIRMED}
--   - EventTimeSlot … 親 Event が deleted_at IS NULL かつ status ∈ {DRAFT, PUBLISHED}
--                     かつ space_id IS NOT NULL
--
-- 組み合わせは 3 通りあり、DB 側の防衛線は 2 通りしか無かった:
--
--   | 組 | 防衛線 |
--   | --- | --- |
--   | 予約 ↔ 予約 | EXCLUDE 制約 `reservations_no_active_time_overlap_excl` |
--   | 予約 ↔ イベント枠 | CONSTRAINT TRIGGER（双方向 2 本）|
--   | **イベント枠 ↔ イベント枠** | **無し** |
--
-- 抜けている組が起こすこと（同一イベント内でも、別イベント間でも同じ）:
-- 同じ部屋の 10:00-12:00（定員 5）と 11:00-13:00（定員 5）が両方とも公開され、
-- 顧客にはどちらも「残り 5 枠」と見える。11:00-12:00 の実収容 5 名の部屋に
-- 合計 10 名の確定申込が入り、決済も完了する。当日、先着以外は入室できない。
-- 管理画面のイベント一覧は first_slot_start_at / last_slot_end_at（MIN/MAX の
-- 非正規化キャッシュ）を見るので 10:00-13:00 の 1 本に見え、気づく手掛かりも無い。
--
-- ## なぜ EXCLUDE ではなく trigger か
--
-- 排他の単位は Space だが、`event_time_slots` に space_id は無い（親 events が持つ）。
-- EXCLUDE 制約は他テーブルの列を参照できないので、`event_id` だけで排他すると
-- **外部会場のイベント（space_id IS NULL）の並行トラックまで一律禁止**になる。
-- 禁止すべきは「同じ部屋を二重に押さえること」であって「同時刻の枠が 2 つあること」
-- ではない。判定に events を読む必要があるため、既存 2 本と同じ
-- DEFERRABLE CONSTRAINT TRIGGER で揃える。
--
-- ## 関数と trigger を rename する
--
-- 検査対象に「他のイベント枠」が加わるので、`..._no_reservation_overlap` という
-- 名前は事実と違うものになる。名前が実体からずれた検査は、読んだ人に
-- 「予約との衝突しか見ていない」と誤解させる。改名して揃える:
--
--   check_event_slot_no_reservation_overlap → check_event_slot_space_is_free
--   check_event_no_reservation_overlap      → check_event_space_is_free
--   event_time_slots_no_reservation_overlap_check → event_time_slots_space_is_free_check
--   events_no_reservation_overlap_check           → events_space_is_free_check
--
-- `check_reservation_no_event_slot_overlap`（reservations 側）は改名しない。
-- 予約 ↔ 予約 は EXCLUDE 制約が見ているので、この関数が見るのは実際に
-- イベント枠だけであり、名前は今も正しい。
--
-- ## events 側にも要る理由
--
-- space_id が NULL のあいだは枠が重なっていてよい（外部会場の並行トラック）。
-- その状態のイベントに後から Space を割り当てると、その瞬間に同じ部屋の
-- 二重押さえが成立する。events 側の trigger は自イベント配下の枠どうしも見る。
--
-- ## 既存データ
--
-- CONSTRAINT TRIGGER は既存行を検査しない（CHECK 制約と違い、適用時に落ちない）。
-- 違反行があれば次の書込まで残る。適用前に本番で流す確認クエリ:
--
--   SELECT a.id AS slot_a, b.id AS slot_b, ea.space_id
--   FROM event_time_slots a
--   JOIN events ea ON ea.id = a.event_id
--   JOIN event_time_slots b ON b.id <> a.id
--   JOIN events eb ON eb.id = b.event_id
--   WHERE ea.space_id IS NOT NULL
--     AND ea.space_id = eb.space_id
--     AND ea.deleted_at IS NULL AND eb.deleted_at IS NULL
--     AND ea.status IN ('DRAFT','PUBLISHED') AND eb.status IN ('DRAFT','PUBLISHED')
--     AND a.start_at < b.end_at AND a.end_at > b.start_at;
--
-- 0 件でなければ、どちらを残すかを決めてから適用する（migration 内でのデータ修復は
-- 副作用の迂回になるので行わない）。

BEGIN;

DROP TRIGGER IF EXISTS "event_time_slots_no_reservation_overlap_check" ON "event_time_slots";
DROP TRIGGER IF EXISTS "events_no_reservation_overlap_check" ON "events";
DROP FUNCTION IF EXISTS check_event_slot_no_reservation_overlap();
DROP FUNCTION IF EXISTS check_event_no_reservation_overlap();

-- 枠側: この枠が押さえようとしている時間帯を、同じ Space の他の占有が既に持っていないか。
CREATE FUNCTION check_event_slot_space_is_free()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  event_space_id UUID;
  event_status TEXT;
  event_deleted_at TIMESTAMPTZ;
  conflict_kind TEXT;
  conflicting_id UUID;
BEGIN
  SELECT space_id, status::text, deleted_at
    INTO event_space_id, event_status, event_deleted_at
  FROM events
  WHERE id = NEW.event_id;

  -- space_id null (外部会場) / soft-deleted event / 非 active status は Space を占有しない
  IF event_space_id IS NULL
     OR event_deleted_at IS NOT NULL
     OR event_status NOT IN ('DRAFT', 'PUBLISHED') THEN
    RETURN NEW;
  END IF;

  SELECT kind, id INTO conflict_kind, conflicting_id
  FROM (
    SELECT 'reservation' AS kind, r.id AS id
    FROM reservations r
    WHERE r.space_id = event_space_id
      AND r.deleted_at IS NULL
      AND r.status IN ('PENDING', 'CONFIRMED')
      AND r.start_time < NEW.end_at
      AND r.end_time > NEW.start_at
    UNION ALL
    -- 自分自身だけを外す。同じイベントの他の枠は外さない —
    -- 同一イベント内の重なりも、同じ部屋の二重押さえであることに変わりはない。
    SELECT 'event slot' AS kind, other.id AS id
    FROM event_time_slots other
    JOIN events other_event ON other_event.id = other.event_id
    WHERE other.id <> NEW.id
      AND other_event.space_id = event_space_id
      AND other_event.deleted_at IS NULL
      AND other_event.status IN ('DRAFT', 'PUBLISHED')
      AND other.start_at < NEW.end_at
      AND other.end_at > NEW.start_at
  ) AS occupancies
  LIMIT 1;

  IF conflicting_id IS NOT NULL THEN
    RAISE EXCEPTION 'EventTimeSlot % overlaps with % % on space %',
      NEW.id, conflict_kind, conflicting_id, event_space_id
      USING ERRCODE = 'exclusion_violation';
  END IF;

  RETURN NEW;
END;
$function$;

-- イベント側: Space の割当・status・soft-delete が変わった瞬間に、
-- 配下の枠すべてが改めて空いているか。
CREATE FUNCTION check_event_space_is_free()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  own_slot_id UUID;
  conflict_kind TEXT;
  conflicting_id UUID;
BEGIN
  IF NEW.space_id IS NULL
     OR NEW.deleted_at IS NOT NULL
     OR NEW.status NOT IN ('DRAFT', 'PUBLISHED') THEN
    RETURN NEW;
  END IF;

  SELECT slot_id, kind, id INTO own_slot_id, conflict_kind, conflicting_id
  FROM (
    SELECT ets.id AS slot_id, 'reservation' AS kind, r.id AS id
    FROM event_time_slots ets
    JOIN reservations r
      ON r.space_id = NEW.space_id
     AND r.deleted_at IS NULL
     AND r.status IN ('PENDING', 'CONFIRMED')
     AND ets.start_at < r.end_time
     AND ets.end_at > r.start_time
    WHERE ets.event_id = NEW.id
    UNION ALL
    -- other_event が NEW 自身のこともある（AFTER trigger なので events は既に新しい値）。
    -- そのとき拾うのは「自イベント配下の枠どうしの重なり」で、
    -- space_id が NULL のあいだに作られた並行トラックに Space を割り当てた場合がこれ。
    SELECT ets.id AS slot_id, 'event slot' AS kind, other.id AS id
    FROM event_time_slots ets
    JOIN event_time_slots other
      ON other.id <> ets.id
     AND other.start_at < ets.end_at
     AND other.end_at > ets.start_at
    JOIN events other_event
      ON other_event.id = other.event_id
     AND other_event.space_id = NEW.space_id
     AND other_event.deleted_at IS NULL
     AND other_event.status IN ('DRAFT', 'PUBLISHED')
    WHERE ets.event_id = NEW.id
  ) AS occupancies
  LIMIT 1;

  IF conflicting_id IS NOT NULL THEN
    RAISE EXCEPTION 'EventTimeSlot % overlaps with % % on space %',
      own_slot_id, conflict_kind, conflicting_id, NEW.space_id
      USING ERRCODE = 'exclusion_violation';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE CONSTRAINT TRIGGER event_time_slots_space_is_free_check
  AFTER INSERT OR UPDATE OF event_id, start_at, end_at ON event_time_slots
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_event_slot_space_is_free();

CREATE CONSTRAINT TRIGGER events_space_is_free_check
  AFTER INSERT OR UPDATE OF space_id, status, deleted_at ON events
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_event_space_is_free();

COMMIT;
