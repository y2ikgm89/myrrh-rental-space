-- PR follow-up (Codex P2 #1025 comment 3567006693):
-- Pre-existing Event ↔ Reservation cross-overlap fail-close verification
--
-- 直前の migration 20260713044626_event_reservation_cross_overlap_constraint が
-- 導入した CONSTRAINT TRIGGER (`reservations_no_event_slot_overlap_check` /
-- `event_time_slots_no_reservation_overlap_check`) は PostgreSQL 仕様上
-- AFTER INSERT/UPDATE でのみ発火するため、既存行は検査されない。
-- 事前調査 SQL (docs/investigation/2026-07-13-event-reservation-cross-overlap-pre-check.md)
-- を skip すると本番に overlap が残ったまま deploy 成功として扱われる恐れがあった。
--
-- 本 migration は事前調査 SQL と完全に同一の predicate で違反行の有無を検査し、
-- 1 件でも見つかれば RAISE EXCEPTION で deploy を loud-fail させる。
-- PR#922 の EXCLUDE 制約導入と同じ fail-close ポリシー。
--
-- 違反検出時は上記 doc の手順で人手解決してから re-deploy する。
-- migration 内で auto-repair は行わない (PR#922 で確立した「migration 内での
-- データ修復禁止」ルールに従う)。

-- reservations.id / event_time_slots.id は uuid 型のため MIN() は使えず、
-- text にキャストしてから MIN() で先頭 sample を採取する
-- (id は UUID の canonical text 形式で比較可能)。
DO $$
DECLARE
  violation_count INTEGER;
  sample_reservation TEXT;
  sample_slot TEXT;
BEGIN
  SELECT COUNT(*), MIN(r.id::text), MIN(ets.id::text)
    INTO violation_count, sample_reservation, sample_slot
  FROM reservations r
  JOIN event_time_slots ets
    ON ets."startAt" < r."endTime"
   AND ets."endAt" > r."startTime"
  JOIN events e ON e.id = ets."eventId"
  WHERE r."deletedAt" IS NULL
    AND r.status IN ('PENDING', 'CONFIRMED')
    AND e."deletedAt" IS NULL
    AND e.status IN ('DRAFT', 'PUBLISHED')
    AND e."spaceId" = r."spaceId";

  IF violation_count > 0 THEN
    RAISE EXCEPTION
      'Pre-existing Event <-> Reservation cross-overlap detected: % row(s) (sample reservation=%, slot=%). Resolve per docs/investigation/2026-07-13-event-reservation-cross-overlap-pre-check.md before re-deploying.',
      violation_count, sample_reservation, sample_slot;
  END IF;
END $$;
