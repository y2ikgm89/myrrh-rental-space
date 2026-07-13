-- Codex P2 follow-up to PR #1025 (comment 3567006692)
-- Event ↔ Reservation cross-table overlap: parent-row (events) trigger
--
-- 20260713044626_event_reservation_cross_overlap_constraint は reservations と
-- event_time_slots の双方で cross-table overlap を検査するが、events 親行の
-- UPDATE (spaceId / status / deletedAt) は trigger 対象外だった。
--
-- Bypass シナリオ:
--   1. spaceId=NULL / status=CANCELLED / deletedAt IS NOT NULL の Event が
--      既に slot を保持している (slot 側 trigger は inactive event として skip 済)
--   2. raw SQL で events を UPDATE して spaceId を非 NULL 化 / status を
--      DRAFT/PUBLISHED 化 / deletedAt を NULL 化 → どちらの trigger も発火しない
--   3. 結果として、既存 slot が同一 Space の PENDING/CONFIRMED Reservation と
--      重複したまま Event が「active」扱いになる
--
-- 本 trigger はその最終セーフティネット。events 親行の spaceId / status /
-- deletedAt が変更されたら、その Event に紐付く全 slot を再検査する。

-- ==============================================
-- Trigger function: events UPDATE で子 slot と reservation の重複を検査
-- ==============================================
CREATE OR REPLACE FUNCTION check_event_no_reservation_overlap()
RETURNS TRIGGER AS $$
DECLARE
  conflicting_reservation_id VARCHAR;
  conflicting_slot_id VARCHAR;
BEGIN
  -- spaceId null (外部会場) / soft-deleted / 非 active status は検査対象外
  IF NEW."spaceId" IS NULL
     OR NEW."deletedAt" IS NOT NULL
     OR NEW.status NOT IN ('DRAFT', 'PUBLISHED') THEN
    RETURN NEW;
  END IF;

  SELECT r.id, ets.id
    INTO conflicting_reservation_id, conflicting_slot_id
  FROM event_time_slots ets
  JOIN reservations r
    ON r."spaceId" = NEW."spaceId"
   AND r."deletedAt" IS NULL
   AND r.status IN ('PENDING', 'CONFIRMED')
   AND ets."startAt" < r."endTime"
   AND ets."endAt" > r."startTime"
  WHERE ets."eventId" = NEW.id
  LIMIT 1;

  IF conflicting_reservation_id IS NOT NULL THEN
    RAISE EXCEPTION 'Event slot % overlaps with reservation % on space %',
      conflicting_slot_id, conflicting_reservation_id, NEW."spaceId"
      USING ERRCODE = 'exclusion_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- squawk-ignore prefer-robust-stmts
CREATE CONSTRAINT TRIGGER events_no_reservation_overlap_check
AFTER INSERT OR UPDATE OF "spaceId", status, "deletedAt"
ON events
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION check_event_no_reservation_overlap();
