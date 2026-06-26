-- Event.lastSlotEndAt 非正規化列追加（firstSlotStartAt と対称）
-- MAX(event_time_slots.endAt) をキャッシュし「終了が遅い順」ソートを semantic 化。

-- AddColumn
ALTER TABLE "events" ADD COLUMN "lastSlotEndAt" TIMESTAMPTZ(6);

-- Backfill: 既存イベントの lastSlotEndAt を event_time_slots から設定
UPDATE "events" e
SET "lastSlotEndAt" = (
    SELECT MAX(s."endAt")
    FROM "event_time_slots" s
    WHERE s."eventId" = e."id"
);

-- CreateIndex (ORDER BY 用)
CREATE INDEX "events_lastSlotEndAt_idx" ON "events"("lastSlotEndAt");
