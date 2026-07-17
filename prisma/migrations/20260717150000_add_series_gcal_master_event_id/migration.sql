-- AlterTable: reservation_series.googleCalendarMasterEventId を追加 (Phase B.2.1 Task 5)
-- Google Calendar 側の recurring master event ID を永続化する。
-- null = 未同期 or Google Calendar 無効。bulk cancel の series-level GCal 操作
-- (deleteGcalMaster / patchGcalMasterUntil) が非 null 時のみ発火する。
-- 列名は schema.prisma の camelCase 命名を踏襲 (Prisma 標準)、
-- table 名は @@map("reservation_series") 通り。
ALTER TABLE "reservation_series" ADD COLUMN "googleCalendarMasterEventId" VARCHAR(1024);
