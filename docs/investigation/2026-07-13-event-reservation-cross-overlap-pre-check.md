# Event ↔ Reservation cross-table overlap 事前調査 SQL

## 目的

PR#5 で追加する CONSTRAINT TRIGGER (`event_time_slots_no_reservation_overlap`
と `reservations_no_event_slot_overlap`) は、有効化時に既存データが違反していると
migration が fail してデプロイを停止する (`ALTER TABLE ... ADD CONSTRAINT` は
既存行を検証するため)。

本番適用の**前**に、この pre-check SQL を Neon 本番 (or staging) で実行し、
違反行がゼロであることを確認する。違反があれば人手で Event 側/Reservation
側のどちらを優先するか判断し、DELETE / UPDATE で解決してから migration を merge する。

reservation-only EXCLUDE 制約導入時 (PR#922) と同じ運用ポリシー。

## Pre-check SQL

```sql
-- 1. Reservation ↔ EventTimeSlot の重複を全件抽出
SELECT
  r.id AS reservation_id,
  r."spaceId",
  r."startTime" AS reservation_start,
  r."endTime" AS reservation_end,
  ets.id AS event_slot_id,
  e.id AS event_id,
  ets."startAt" AS event_start,
  ets."endAt" AS event_end,
  e.status AS event_status,
  e.title AS event_title
FROM reservations r
JOIN event_time_slots ets ON ets."startAt" < r."endTime" AND ets."endAt" > r."startTime"
JOIN events e ON e.id = ets."eventId"
WHERE r."deletedAt" IS NULL
  AND r.status IN ('PENDING', 'CONFIRMED')
  AND e."deletedAt" IS NULL
  AND e.status IN ('DRAFT', 'PUBLISHED')
  AND e."spaceId" = r."spaceId"
ORDER BY r."startTime";
```

## 期待される結果

**0 rows** — 違反なし → migration をそのまま merge。

## 違反が見つかった場合

1. Space オーナー / 運用担当と協議し、Event / Reservation どちらを優先するか決定
2. 優先されない側を DELETE (soft-delete=CANCELLED または deletedAt 設定) で解決
3. 上記 SQL を再実行して 0 rows を確認
4. migration を merge

## 適用後の確認

migration 適用後、以下 SQL で違反挿入が拒否されることを確認:

```sql
-- Reservation 側から挿入: 既存 Event と重複する新規予約 → 拒否されるべき
INSERT INTO reservations (
  ..., "spaceId", "startTime", "endTime", status
) VALUES (
  ..., '<space_id_with_existing_event>',
  '<overlap_start>', '<overlap_end>', 'CONFIRMED'
);
-- 期待: ERROR: reservations_no_event_slot_overlap
```
