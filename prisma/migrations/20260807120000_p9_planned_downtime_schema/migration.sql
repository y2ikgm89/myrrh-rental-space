-- P9: 計画ダウンタイム付き clean-break schema 契約
--
-- 1. locations.special_holidays 列を DROP（BlockedDate scope=LOCATION が SSoT）
-- 2. space_rate_plans.end_time: 24:01–24:59 を拒否（24:00 のみ許可）
-- 3. events.meeting_url: ONLINE/ZOOM 等は空文字不可（https:// 必須）
-- 4. cancelled_by_type を VARCHAR から enum cancelled_by へ
--
-- 適用前: bun scripts/backfill-special-holidays-to-blocked-dates.ts --apply
-- リハーサル: bun scripts/migration-preconditions.ts

-- squawk-ignore-file ban-drop-column, changing-column-type

BEGIN;

-- 1. locations.special_holidays
ALTER TABLE "locations" DROP CONSTRAINT "locations_special_holidays_array_check";
ALTER TABLE "locations" DROP COLUMN "special_holidays";

-- 2. space_rate_plans end_time (reject 24:01-24:59)
ALTER TABLE "space_rate_plans" DROP CONSTRAINT "space_rate_plans_end_time_format_check";
ALTER TABLE "space_rate_plans" ADD CONSTRAINT "space_rate_plans_end_time_format_check"
  CHECK (end_time IS NULL OR end_time ~ '^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$');

-- 3. event meeting URL empty string
ALTER TABLE "events" DROP CONSTRAINT "event_online_meeting_url_required";
ALTER TABLE "events" ADD CONSTRAINT "event_online_meeting_url_required"
  CHECK (format = 'OFFLINE'::event_format
      OR meeting_provider = 'GOOGLE_MEET'::meeting_provider
      OR (meeting_url IS NOT NULL AND meeting_url ~ '^https://'));

-- 4. cancelled_by_type enum (all rows NULL)
CREATE TYPE cancelled_by AS ENUM ('CUSTOMER_MYPAGE', 'CUSTOMER_TOKEN', 'ADMIN', 'SYSTEM');
ALTER TABLE "reservations" ALTER COLUMN "cancelled_by_type" TYPE cancelled_by USING "cancelled_by_type"::cancelled_by;
ALTER TABLE "reservation_series" ALTER COLUMN "cancelled_by_type" TYPE cancelled_by USING "cancelled_by_type"::cancelled_by;
ALTER TABLE "event_registrations" ALTER COLUMN "cancelled_by_type" TYPE cancelled_by USING "cancelled_by_type"::cancelled_by;

COMMIT;
