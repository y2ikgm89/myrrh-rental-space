-- EventTimeSlot モデル追加（PR-1: schema expand）+
-- 既存 Event データのバックフィル（PR-2）+
-- Event 旧フィールド DROP（PR-4: contract）
-- combined local-dev migration

-- =============================================================================
-- 1. event_time_slots テーブル作成
-- =============================================================================

CREATE TABLE "event_time_slots" (
    "id" VARCHAR(30) NOT NULL,
    "eventId" VARCHAR(30) NOT NULL,
    "startAt" TIMESTAMPTZ(6) NOT NULL,
    "endAt" TIMESTAMPTZ(6) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "googleCalendarEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_time_slots_pkey" PRIMARY KEY ("id")
);

-- =============================================================================
-- 2. event_registrations に slotId 追加（nullable: 既存レコード対応）
-- =============================================================================

ALTER TABLE "event_registrations" ADD COLUMN "slotId" VARCHAR(30);

-- =============================================================================
-- 3. データバックフィル: Event.startTime/endTime → EventTimeSlot
--    + 既存の EventRegistration に slotId をリンク
-- =============================================================================

WITH inserted_slots AS (
    INSERT INTO "event_time_slots" (
        "id", "eventId", "startAt", "endAt", "capacity",
        "googleCalendarEventId", "createdAt", "updatedAt"
    )
    SELECT
        left('c' || replace(gen_random_uuid()::text, '-', ''), 24),
        "id",
        "startTime",
        "endTime",
        COALESCE("capacity", 0),
        "googleCalendarEventId",
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    FROM "events"
    WHERE "startTime" IS NOT NULL
    RETURNING "id", "eventId"
)
UPDATE "event_registrations" er
SET "slotId" = ins."id"
FROM inserted_slots ins
WHERE er."eventId" = ins."eventId";

-- =============================================================================
-- 4. event_time_slots: インデックス・FK 追加
-- =============================================================================

CREATE UNIQUE INDEX "event_time_slots_eventId_startAt_key" ON "event_time_slots"("eventId", "startAt");

CREATE INDEX "event_time_slots_eventId_startAt_idx" ON "event_time_slots"("eventId", "startAt");

ALTER TABLE "event_time_slots" ADD CONSTRAINT "event_time_slots_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- =============================================================================
-- 5. event_registrations.slotId: インデックス・FK 追加
-- =============================================================================

CREATE INDEX "event_registrations_slotId_idx" ON "event_registrations"("slotId");

CREATE INDEX "event_registrations_slotId_status_idx" ON "event_registrations"("slotId", "status");

ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_slotId_fkey"
    FOREIGN KEY ("slotId") REFERENCES "event_time_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =============================================================================
-- 6. events 旧列・旧インデックス削除（PR-4 contract）
-- =============================================================================

DROP INDEX "events_googleCalendarEventId_key";
DROP INDEX "events_startTime_endTime_idx";

-- squawk-ignore ban-drop-column
ALTER TABLE "events" DROP COLUMN "startTime";
-- squawk-ignore ban-drop-column
ALTER TABLE "events" DROP COLUMN "endTime";
-- squawk-ignore ban-drop-column
ALTER TABLE "events" DROP COLUMN "capacity";
-- squawk-ignore ban-drop-column
ALTER TABLE "events" DROP COLUMN "googleCalendarEventId";
