-- enum の型名を snake_case へ、値を UPPER_SNAKE へ揃える。
--
-- **Prisma の自動生成を使っていない。** 自動生成は enum ごとに DROP TYPE +
-- CREATE TYPE + 対象列の drop/recreate を出す（`prisma migrate dev` の警告どおり
-- 「would be dropped and recreated / This will lead to data loss」）。
-- `ALTER TYPE ... RENAME` なら値も列も失わず、依存する CHECK 制約・DEFAULT・
-- plpgsql 関数の参照も OID 経由なので自動追従する。
--
-- 順序に意味がある: **値を先に、型名を後に**。型名を先に変えると、下の
-- RENAME VALUE を新しい型名で書き直す必要が出て差分が読みにくくなる。

BEGIN;

-- ===== enum の値を UPPER_SNAKE へ =====

-- DiscountType
ALTER TYPE "DiscountType" RENAME VALUE 'none' TO 'NONE';
ALTER TYPE "DiscountType" RENAME VALUE 'percentage' TO 'PERCENTAGE';
ALTER TYPE "DiscountType" RENAME VALUE 'fixed' TO 'FIXED';

-- DurationDiscountOverride
ALTER TYPE "DurationDiscountOverride" RENAME VALUE 'inherit' TO 'INHERIT';
ALTER TYPE "DurationDiscountOverride" RENAME VALUE 'enabled' TO 'ENABLED';
ALTER TYPE "DurationDiscountOverride" RENAME VALUE 'disabled' TO 'DISABLED';

-- TaxRateType
ALTER TYPE "TaxRateType" RENAME VALUE 'standard' TO 'STANDARD';
ALTER TYPE "TaxRateType" RENAME VALUE 'reduced' TO 'REDUCED';

-- HeaderScrollBehavior
ALTER TYPE "HeaderScrollBehavior" RENAME VALUE 'auto-hide' TO 'AUTO_HIDE';
ALTER TYPE "HeaderScrollBehavior" RENAME VALUE 'always-visible' TO 'ALWAYS_VISIBLE';
ALTER TYPE "HeaderScrollBehavior" RENAME VALUE 'hide-on-scroll' TO 'HIDE_ON_SCROLL';

-- HeaderBackgroundMode
ALTER TYPE "HeaderBackgroundMode" RENAME VALUE 'solid' TO 'SOLID';
ALTER TYPE "HeaderBackgroundMode" RENAME VALUE 'transparent' TO 'TRANSPARENT';

-- TaxDisplayMode
ALTER TYPE "TaxDisplayMode" RENAME VALUE 'tax_excluded' TO 'TAX_EXCLUDED';
ALTER TYPE "TaxDisplayMode" RENAME VALUE 'tax_included' TO 'TAX_INCLUDED';
ALTER TYPE "TaxDisplayMode" RENAME VALUE 'both' TO 'BOTH';

-- CalendarSyncMethod
ALTER TYPE "CalendarSyncMethod" RENAME VALUE 'polling' TO 'POLLING';
ALTER TYPE "CalendarSyncMethod" RENAME VALUE 'webhook' TO 'WEBHOOK';
ALTER TYPE "CalendarSyncMethod" RENAME VALUE 'both' TO 'BOTH';

-- AnalyticsType
ALTER TYPE "AnalyticsType" RENAME VALUE 'ga4' TO 'GA4';
ALTER TYPE "AnalyticsType" RENAME VALUE 'gtm' TO 'GTM';

-- DiscountCombinationMode
ALTER TYPE "DiscountCombinationMode" RENAME VALUE 'best' TO 'BEST';
ALTER TYPE "DiscountCombinationMode" RENAME VALUE 'both' TO 'BOTH';

-- AnnouncementBarAnimation
ALTER TYPE "AnnouncementBarAnimation" RENAME VALUE 'fade' TO 'FADE';
ALTER TYPE "AnnouncementBarAnimation" RENAME VALUE 'slideX' TO 'SLIDE_X';
ALTER TYPE "AnnouncementBarAnimation" RENAME VALUE 'slideY' TO 'SLIDE_Y';

-- AnnouncementBarDesignStyle
ALTER TYPE "AnnouncementBarDesignStyle" RENAME VALUE 'solid' TO 'SOLID';
ALTER TYPE "AnnouncementBarDesignStyle" RENAME VALUE 'gradient' TO 'GRADIENT';
ALTER TYPE "AnnouncementBarDesignStyle" RENAME VALUE 'outlined' TO 'OUTLINED';
ALTER TYPE "AnnouncementBarDesignStyle" RENAME VALUE 'glass' TO 'GLASS';
ALTER TYPE "AnnouncementBarDesignStyle" RENAME VALUE 'minimal' TO 'MINIMAL';
ALTER TYPE "AnnouncementBarDesignStyle" RENAME VALUE 'striped' TO 'STRIPED';

-- HolidayMode
ALTER TYPE "HolidayMode" RENAME VALUE 'any' TO 'ANY';
ALTER TYPE "HolidayMode" RENAME VALUE 'only' TO 'ONLY';
ALTER TYPE "HolidayMode" RENAME VALUE 'exclude' TO 'EXCLUDE';

-- ===== enum の型名を snake_case へ =====
ALTER TYPE "AnalyticsType" RENAME TO analytics_type;
ALTER TYPE "AnnouncementBarAnimation" RENAME TO announcement_bar_animation;
ALTER TYPE "AnnouncementBarDesignStyle" RENAME TO announcement_bar_design_style;
ALTER TYPE "AuditAction" RENAME TO audit_action;
ALTER TYPE "CalendarSyncMethod" RENAME TO calendar_sync_method;
ALTER TYPE "CouponType" RENAME TO coupon_type;
ALTER TYPE "CustomerStatus" RENAME TO customer_status;
ALTER TYPE "CustomerType" RENAME TO customer_type;
ALTER TYPE "DayOfWeek" RENAME TO day_of_week;
ALTER TYPE "DiscountCombinationMode" RENAME TO discount_combination_mode;
ALTER TYPE "DiscountType" RENAME TO discount_type;
ALTER TYPE "DurationDiscountOverride" RENAME TO duration_discount_override;
ALTER TYPE "EditorCommentStatus" RENAME TO editor_comment_status;
ALTER TYPE "EmailDeliveryStatus" RENAME TO email_delivery_status;
ALTER TYPE "EventFormat" RENAME TO event_format;
ALTER TYPE "EventScheduleMode" RENAME TO event_schedule_mode;
ALTER TYPE "EventStatus" RENAME TO event_status;
ALTER TYPE "HeaderBackgroundMode" RENAME TO header_background_mode;
ALTER TYPE "HeaderScrollBehavior" RENAME TO header_scroll_behavior;
ALTER TYPE "HolidayMode" RENAME TO holiday_mode;
ALTER TYPE "InquiryReplyAuthorType" RENAME TO inquiry_reply_author_type;
ALTER TYPE "InquiryStatus" RENAME TO inquiry_status;
ALTER TYPE "InstagramMediaType" RENAME TO instagram_media_type;
ALTER TYPE "LayoutWidth" RENAME TO layout_width;
ALTER TYPE "MediaType" RENAME TO media_type;
ALTER TYPE "MediaUsage" RENAME TO media_usage;
ALTER TYPE "MeetingProvider" RENAME TO meeting_provider;
ALTER TYPE "NavigationType" RENAME TO navigation_type;
ALTER TYPE "PaymentStatus" RENAME TO payment_status;
ALTER TYPE "PostStatus" RENAME TO post_status;
ALTER TYPE "RegistrationStatus" RENAME TO registration_status;
ALTER TYPE "ReservationSeriesFreq" RENAME TO reservation_series_freq;
ALTER TYPE "ReservationStatus" RENAME TO reservation_status;
ALTER TYPE "Role" RENAME TO role;
ALTER TYPE "SmartLockDeviceType" RENAME TO smart_lock_device_type;
ALTER TYPE "SmartLockPasscodeStatus" RENAME TO smart_lock_passcode_status;
ALTER TYPE "SocialPlatform" RENAME TO social_platform;
ALTER TYPE "TaxDisplayMode" RENAME TO tax_display_mode;
ALTER TYPE "TaxRateType" RENAME TO tax_rate_type;
ALTER TYPE "TermsScope" RENAME TO terms_scope;

-- ===== plpgsql 関数の作り直し =====
--
-- **ALTER TYPE ... RENAME は plpgsql の本体まで書き換えない。** 制約・DEFAULT・列の型は
-- OID 参照なので自動追従するが、関数本体は**テキスト**として保存されているため、
-- `DECLARE x "EventScheduleMode";` のような型名の参照が旧名のまま残る。
-- 実測: 作り直さないとイベント作成が `type "EventScheduleMode" does not exist` で全滅する。
--
-- 対象は型名を本体に書いているこの 1 本だけ（`prosrc LIKE '%EventScheduleMode%'` で確認）。

CREATE OR REPLACE FUNCTION public.check_event_schedule_integrity("targetEventId" uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  current_mode event_schedule_mode;
  current_deadline timestamp with time zone;
  slot_count integer;
  first_slot_start timestamp with time zone;
BEGIN
  SELECT "scheduleMode", "registrationDeadline"
  INTO current_mode, current_deadline
  FROM "events"
  WHERE "id" = "targetEventId"
    AND "deletedAt" IS NULL;

  IF current_mode IS NULL THEN
    RETURN;
  END IF;

  SELECT COUNT(*), MIN("startAt")
  INTO slot_count, first_slot_start
  FROM "event_time_slots"
  WHERE "eventId" = "targetEventId";

  IF current_mode = 'SINGLE_OCCURRENCE' AND slot_count <> 1 THEN
    RAISE EXCEPTION
      'SINGLE_OCCURRENCE events must have exactly one EventTimeSlot; eventId=%, slot_count=%',
      "targetEventId",
      slot_count
      USING ERRCODE = '23514';
  END IF;

  IF current_mode = 'TIMED_ENTRY' AND slot_count < 2 THEN
    RAISE EXCEPTION
      'TIMED_ENTRY events must have at least two EventTimeSlot rows; eventId=%, slot_count=%',
      "targetEventId",
      slot_count
      USING ERRCODE = '23514';
  END IF;

  IF current_deadline IS NOT NULL
    AND first_slot_start IS NOT NULL
    AND current_deadline > first_slot_start THEN
    RAISE EXCEPTION
      'Event registrationDeadline must be on or before the first slot start; eventId=%',
      "targetEventId"
      USING ERRCODE = '23514';
  END IF;
END;
$function$;

COMMIT;
