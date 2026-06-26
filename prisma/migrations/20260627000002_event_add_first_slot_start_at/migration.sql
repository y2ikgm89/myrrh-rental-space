-- Event.firstSlotStartAt 非正規化列追加
-- MIN(event_time_slots.startAt) をキャッシュし ORDER BY を効率化。
-- slots.startAt と型を合わせ TIMESTAMPTZ(6)。

-- AddColumn
ALTER TABLE "events" ADD COLUMN "firstSlotStartAt" TIMESTAMPTZ(6);

-- Backfill: 既存イベントの firstSlotStartAt を event_time_slots から設定
UPDATE "events" e
SET "firstSlotStartAt" = (
    SELECT MIN(s."startAt")
    FROM "event_time_slots" s
    WHERE s."eventId" = e."id"
);

-- CreateIndex (ORDER BY 用)
CREATE INDEX "events_firstSlotStartAt_idx" ON "events"("firstSlotStartAt");
