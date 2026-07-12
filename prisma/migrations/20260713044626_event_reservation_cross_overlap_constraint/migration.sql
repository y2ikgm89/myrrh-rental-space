-- PR#5: Event ↔ Reservation cross-table overlap defense-in-depth (Priority-10 audit #4)
--
-- Reservation 同士の EXCLUDE 制約 (PR#922) と同じ思想で、Event.spaceId + EventTimeSlot
-- の生きたスロットと Reservation の時間帯が同一 Space 内で重複しないことを
-- CONSTRAINT TRIGGER で DB-level defense する。
--
-- application 層 (PR#4 の checkSpaceOverlap + lockSpaceForTransaction) が主防衛線、
-- 本 TRIGGER は「application を bypass する raw SQL 実行 / prisma db push /
-- 手動データ入力」など想定外経路への最終セーフティネット。
--
-- 事前確認: 既存本番データに違反があると ADD CONSTRAINT が fail してデプロイ停止する。
-- 事前調査 SQL は docs/investigation/2026-07-13-event-reservation-cross-overlap-pre-check.md
-- 参照。0 rows を確認した上で merge すること。

-- ==============================================
-- 1. Trigger function: reservation insert/update が event slot と重複しないか検査
-- ==============================================
CREATE OR REPLACE FUNCTION check_reservation_no_event_slot_overlap()
RETURNS TRIGGER AS $$
DECLARE
  conflicting_slot_id VARCHAR;
BEGIN
  -- soft-deleted or 非 active status は検査対象外
  IF NEW."deletedAt" IS NOT NULL
     OR NEW.status NOT IN ('PENDING', 'CONFIRMED') THEN
    RETURN NEW;
  END IF;

  SELECT ets.id INTO conflicting_slot_id
  FROM event_time_slots ets
  JOIN events e ON e.id = ets."eventId"
  WHERE e."spaceId" = NEW."spaceId"
    AND e."deletedAt" IS NULL
    AND e.status IN ('DRAFT', 'PUBLISHED')
    AND ets."startAt" < NEW."endTime"
    AND ets."endAt" > NEW."startTime"
  LIMIT 1;

  IF conflicting_slot_id IS NOT NULL THEN
    RAISE EXCEPTION 'Reservation time overlaps with EventTimeSlot % on space %',
      conflicting_slot_id, NEW."spaceId"
      USING ERRCODE = 'exclusion_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- squawk-ignore prefer-robust-stmts
CREATE CONSTRAINT TRIGGER reservations_no_event_slot_overlap_check
AFTER INSERT OR UPDATE OF "spaceId", "startTime", "endTime", status, "deletedAt"
ON reservations
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION check_reservation_no_event_slot_overlap();

-- ==============================================
-- 2. Trigger function: event slot insert/update が reservation と重複しないか検査
-- ==============================================
CREATE OR REPLACE FUNCTION check_event_slot_no_reservation_overlap()
RETURNS TRIGGER AS $$
DECLARE
  event_space_id UUID;
  event_status TEXT;
  event_deleted_at TIMESTAMP;
  conflicting_reservation_id VARCHAR;
BEGIN
  SELECT "spaceId", status::text, "deletedAt"
    INTO event_space_id, event_status, event_deleted_at
  FROM events
  WHERE id = NEW."eventId";

  -- spaceId null (外部会場) / soft-deleted event / 非 active status は検査対象外
  IF event_space_id IS NULL
     OR event_deleted_at IS NOT NULL
     OR event_status NOT IN ('DRAFT', 'PUBLISHED') THEN
    RETURN NEW;
  END IF;

  SELECT r.id INTO conflicting_reservation_id
  FROM reservations r
  WHERE r."spaceId" = event_space_id
    AND r."deletedAt" IS NULL
    AND r.status IN ('PENDING', 'CONFIRMED')
    AND r."startTime" < NEW."endAt"
    AND r."endTime" > NEW."startAt"
  LIMIT 1;

  IF conflicting_reservation_id IS NOT NULL THEN
    RAISE EXCEPTION 'EventTimeSlot time overlaps with reservation % on space %',
      conflicting_reservation_id, event_space_id
      USING ERRCODE = 'exclusion_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- squawk-ignore prefer-robust-stmts
CREATE CONSTRAINT TRIGGER event_time_slots_no_reservation_overlap_check
AFTER INSERT OR UPDATE OF "eventId", "startAt", "endAt"
ON event_time_slots
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION check_event_slot_no_reservation_overlap();

-- ==============================================
-- 3. 補助 index: TRIGGER 内の cross-table クエリ高速化
-- ==============================================
-- events(spaceId, deletedAt) の部分 index — spaceId が非 null + deletedAt = null の
-- 生きた Event を高速に絞り込む
CREATE INDEX IF NOT EXISTS "events_spaceId_alive_idx"
ON events ("spaceId")
WHERE "deletedAt" IS NULL AND "spaceId" IS NOT NULL;

-- event_time_slots(startAt, endAt) — トリガー内 range クエリ用
CREATE INDEX IF NOT EXISTS "event_time_slots_time_range_idx"
ON event_time_slots ("startAt", "endAt");
