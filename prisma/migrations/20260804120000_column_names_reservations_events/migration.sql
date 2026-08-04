-- squawk-ignore-file renaming-column
--
-- 予約・イベント・クーポンまわりの物理列名を snake_case へ寄せる。
--
-- 免除の根拠・自動生成を使わない理由は 20260804110000（認証と顧客）と同じ。
--
-- **この 1 本だけ 4 段になる。** CHECK / index / FK / EXCLUDE / trigger は式が attnum 参照
-- なので列の rename に自動追随するが、**plpgsql 関数の本体はテキスト**なので追随しない。
-- 予約とイベントを同じ PR に入れているのはそのためで、5 本の関数のうち 3 本が
-- `reservations` と `event_time_slots` / `events` を同時に参照している。ドメインで割ると
-- 同じ関数を 2 回に分けて直すことになり、その間だけ本文が壊れた状態になる。
--
-- 関数の本体は **invariants.sql からではなく実 DB の現在の定義から**採った。
-- invariants.sql は baseline（enum を snake_case へ寄せる前）なので、
-- `current_mode "EventScheduleMode"` という**もう存在しない型名**を抱えている。
-- `check_event_schedule_integrity` の引数名 "targetEventId" は列ではないので据え置く
-- （`CREATE OR REPLACE` は引数名を変更できず、DROP + CREATE する価値は無い）。

BEGIN;

-- 1. 列
ALTER TABLE reservations RENAME COLUMN "spaceId" TO space_id;
ALTER TABLE reservations RENAME COLUMN "userId" TO user_id;
ALTER TABLE reservations RENAME COLUMN "customerId" TO customer_id;
ALTER TABLE reservations RENAME COLUMN "startTime" TO start_time;
ALTER TABLE reservations RENAME COLUMN "endTime" TO end_time;
ALTER TABLE reservations RENAME COLUMN "totalPrice" TO total_price;
ALTER TABLE reservations RENAME COLUMN "createdAt" TO created_at;
ALTER TABLE reservations RENAME COLUMN "updatedAt" TO updated_at;
ALTER TABLE reservations RENAME COLUMN "couponId" TO coupon_id;
ALTER TABLE reservations RENAME COLUMN "couponDiscountAmount" TO coupon_discount_amount;
ALTER TABLE reservations RENAME COLUMN "durationDiscountAmount" TO duration_discount_amount;
ALTER TABLE reservations RENAME COLUMN "spaceDiscountAmount" TO space_discount_amount;
ALTER TABLE reservations RENAME COLUMN "basePrice" TO base_price;
ALTER TABLE reservations RENAME COLUMN "rateBreakdownJson" TO rate_breakdown_json;
ALTER TABLE reservations RENAME COLUMN "taxRateType" TO tax_rate_type;
ALTER TABLE reservations RENAME COLUMN "taxRate" TO tax_rate;
ALTER TABLE reservations RENAME COLUMN "taxAmount" TO tax_amount;
ALTER TABLE reservations RENAME COLUMN "totalPriceWithTax" TO total_price_with_tax;
ALTER TABLE reservations RENAME COLUMN "priceOverriddenBy" TO price_overridden_by;
ALTER TABLE reservations RENAME COLUMN "googleCalendarEventId" TO google_calendar_event_id;
ALTER TABLE reservations RENAME COLUMN "calendarSyncedAt" TO calendar_synced_at;
ALTER TABLE reservations RENAME COLUMN "calendarSyncError" TO calendar_sync_error;
ALTER TABLE reservations RENAME COLUMN "guestLastName" TO guest_last_name;
ALTER TABLE reservations RENAME COLUMN "guestFirstName" TO guest_first_name;
ALTER TABLE reservations RENAME COLUMN "guestEmail" TO guest_email;
ALTER TABLE reservations RENAME COLUMN "guestPhone" TO guest_phone;
ALTER TABLE reservations RENAME COLUMN "guestCompanyName" TO guest_company_name;
ALTER TABLE reservations RENAME COLUMN "guestCustomerType" TO guest_customer_type;
ALTER TABLE reservations RENAME COLUMN "deletedAt" TO deleted_at;
ALTER TABLE reservations RENAME COLUMN "deletedById" TO deleted_by_id;
ALTER TABLE reservations RENAME COLUMN "numberOfGuests" TO number_of_guests;
ALTER TABLE reservations RENAME COLUMN "paymentStatus" TO payment_status;
ALTER TABLE reservations RENAME COLUMN "stripeCheckoutSessionId" TO stripe_checkout_session_id;
ALTER TABLE reservations RENAME COLUMN "stripePaymentIntentId" TO stripe_payment_intent_id;
ALTER TABLE reservations RENAME COLUMN "paidAt" TO paid_at;
ALTER TABLE reservations RENAME COLUMN "paymentInitiatedAt" TO payment_initiated_at;
ALTER TABLE reservations RENAME COLUMN "cancellationReason" TO cancellation_reason;
ALTER TABLE reservations RENAME COLUMN "cancelledAt" TO cancelled_at;
ALTER TABLE reservations RENAME COLUMN "cancelledByType" TO cancelled_by_type;
ALTER TABLE reservations RENAME COLUMN "icsSequence" TO ics_sequence;
ALTER TABLE reservations RENAME COLUMN "reminderSentAt" TO reminder_sent_at;
ALTER TABLE reservations RENAME COLUMN "seriesId" TO series_id;
ALTER TABLE reservations RENAME COLUMN "recurrenceInstanceIndex" TO recurrence_instance_index;
ALTER TABLE reservation_series RENAME COLUMN "spaceId" TO space_id;
ALTER TABLE reservation_series RENAME COLUMN "customerId" TO customer_id;
ALTER TABLE reservation_series RENAME COLUMN "couponId" TO coupon_id;
ALTER TABLE reservation_series RENAME COLUMN "instanceCount" TO instance_count;
ALTER TABLE reservation_series RENAME COLUMN "templateData" TO template_data;
ALTER TABLE reservation_series RENAME COLUMN "agreementSnapshot" TO agreement_snapshot;
ALTER TABLE reservation_series RENAME COLUMN "createdAt" TO created_at;
ALTER TABLE reservation_series RENAME COLUMN "updatedAt" TO updated_at;
ALTER TABLE reservation_series RENAME COLUMN "cancelledAt" TO cancelled_at;
ALTER TABLE reservation_series RENAME COLUMN "cancelledByType" TO cancelled_by_type;
ALTER TABLE reservation_series RENAME COLUMN "cancellationReason" TO cancellation_reason;
ALTER TABLE reservation_series RENAME COLUMN "deletedAt" TO deleted_at;
ALTER TABLE reservation_series RENAME COLUMN "deletedById" TO deleted_by_id;
ALTER TABLE reservation_series RENAME COLUMN "googleCalendarMasterEventId" TO google_calendar_master_event_id;
ALTER TABLE coupons RENAME COLUMN "discountValue" TO discount_value;
ALTER TABLE coupons RENAME COLUMN "minReservationAmount" TO min_reservation_amount;
ALTER TABLE coupons RENAME COLUMN "maxDiscountAmount" TO max_discount_amount;
ALTER TABLE coupons RENAME COLUMN "validFrom" TO valid_from;
ALTER TABLE coupons RENAME COLUMN "validUntil" TO valid_until;
ALTER TABLE coupons RENAME COLUMN "usageLimit" TO usage_limit;
ALTER TABLE coupons RENAME COLUMN "usageCount" TO usage_count;
ALTER TABLE coupons RENAME COLUMN "isActive" TO is_active;
ALTER TABLE coupons RENAME COLUMN "canCombineWithDurationDiscount" TO can_combine_with_duration_discount;
ALTER TABLE coupons RENAME COLUMN "createdAt" TO created_at;
ALTER TABLE coupons RENAME COLUMN "updatedAt" TO updated_at;
ALTER TABLE events RENAME COLUMN "descriptionJson" TO description_json;
ALTER TABLE events RENAME COLUMN "descriptionHtml" TO description_html;
ALTER TABLE events RENAME COLUMN "descriptionPlainText" TO description_plain_text;
ALTER TABLE events RENAME COLUMN "thumbnailUrl" TO thumbnail_url;
ALTER TABLE events RENAME COLUMN "ogpImageUrl" TO ogp_image_url;
ALTER TABLE events RENAME COLUMN "ogpTitle" TO ogp_title;
ALTER TABLE events RENAME COLUMN "ogpDescription" TO ogp_description;
ALTER TABLE events RENAME COLUMN "metaDescription" TO meta_description;
ALTER TABLE events RENAME COLUMN "metaKeywords" TO meta_keywords;
ALTER TABLE events RENAME COLUMN "addressDetail" TO address_detail;
ALTER TABLE events RENAME COLUMN "locationId" TO location_id;
ALTER TABLE events RENAME COLUMN "spaceId" TO space_id;
ALTER TABLE events RENAME COLUMN "scheduleMode" TO schedule_mode;
ALTER TABLE events RENAME COLUMN "registrationOpen" TO registration_open;
ALTER TABLE events RENAME COLUMN "registrationDeadline" TO registration_deadline;
ALTER TABLE events RENAME COLUMN "publishedAt" TO published_at;
ALTER TABLE events RENAME COLUMN "deletedAt" TO deleted_at;
ALTER TABLE events RENAME COLUMN "deletedById" TO deleted_by_id;
ALTER TABLE events RENAME COLUMN "createdAt" TO created_at;
ALTER TABLE events RENAME COLUMN "updatedAt" TO updated_at;
ALTER TABLE events RENAME COLUMN "firstSlotStartAt" TO first_slot_start_at;
ALTER TABLE events RENAME COLUMN "lastSlotEndAt" TO last_slot_end_at;
ALTER TABLE events RENAME COLUMN "meetingUrl" TO meeting_url;
ALTER TABLE events RENAME COLUMN "meetingProvider" TO meeting_provider;
ALTER TABLE events RENAME COLUMN "calendarSyncError" TO calendar_sync_error;
ALTER TABLE events RENAME COLUMN "categoryId" TO category_id;
ALTER TABLE event_categories RENAME COLUMN "sortOrder" TO sort_order;
ALTER TABLE event_categories RENAME COLUMN "isActive" TO is_active;
ALTER TABLE event_categories RENAME COLUMN "createdAt" TO created_at;
ALTER TABLE event_categories RENAME COLUMN "updatedAt" TO updated_at;
ALTER TABLE event_registrations RENAME COLUMN "eventId" TO event_id;
ALTER TABLE event_registrations RENAME COLUMN "slotId" TO slot_id;
ALTER TABLE event_registrations RENAME COLUMN "ticketId" TO ticket_id;
ALTER TABLE event_registrations RENAME COLUMN "customerId" TO customer_id;
ALTER TABLE event_registrations RENAME COLUMN "cancelledAt" TO cancelled_at;
ALTER TABLE event_registrations RENAME COLUMN "cancelledByType" TO cancelled_by_type;
ALTER TABLE event_registrations RENAME COLUMN "attendedAt" TO attended_at;
ALTER TABLE event_registrations RENAME COLUMN "createdAt" TO created_at;
ALTER TABLE event_registrations RENAME COLUMN "updatedAt" TO updated_at;
ALTER TABLE event_registrations RENAME COLUMN "icsSequence" TO ics_sequence;
ALTER TABLE event_registrations RENAME COLUMN "waitlistedAt" TO waitlisted_at;
ALTER TABLE event_registrations RENAME COLUMN "offeredAt" TO offered_at;
ALTER TABLE event_registrations RENAME COLUMN "expiresAt" TO expires_at;
ALTER TABLE event_registrations RENAME COLUMN "reminderSentAt" TO reminder_sent_at;
ALTER TABLE event_registrations RENAME COLUMN "paymentStatus" TO payment_status;
ALTER TABLE event_registrations RENAME COLUMN "stripeCheckoutSessionId" TO stripe_checkout_session_id;
ALTER TABLE event_registrations RENAME COLUMN "stripePaymentIntentId" TO stripe_payment_intent_id;
ALTER TABLE event_registrations RENAME COLUMN "paidAmount" TO paid_amount;
ALTER TABLE event_registrations RENAME COLUMN "paidAt" TO paid_at;
ALTER TABLE event_tickets RENAME COLUMN "eventId" TO event_id;
ALTER TABLE event_tickets RENAME COLUMN "unitSize" TO unit_size;
ALTER TABLE event_tickets RENAME COLUMN "sortOrder" TO sort_order;
ALTER TABLE event_tickets RENAME COLUMN "isAvailable" TO is_available;
ALTER TABLE event_tickets RENAME COLUMN "createdAt" TO created_at;
ALTER TABLE event_tickets RENAME COLUMN "updatedAt" TO updated_at;
ALTER TABLE event_time_slots RENAME COLUMN "eventId" TO event_id;
ALTER TABLE event_time_slots RENAME COLUMN "startAt" TO start_at;
ALTER TABLE event_time_slots RENAME COLUMN "endAt" TO end_at;
ALTER TABLE event_time_slots RENAME COLUMN "googleCalendarEventId" TO google_calendar_event_id;
ALTER TABLE event_time_slots RENAME COLUMN "createdAt" TO created_at;
ALTER TABLE event_time_slots RENAME COLUMN "updatedAt" TO updated_at;

-- 2. Prisma 管理オブジェクト（FK / index）
ALTER TABLE "event_registrations" RENAME CONSTRAINT "event_registrations_customerId_fkey" TO "event_registrations_customer_id_fkey";
ALTER TABLE "event_registrations" RENAME CONSTRAINT "event_registrations_eventId_fkey" TO "event_registrations_event_id_fkey";
ALTER TABLE "event_registrations" RENAME CONSTRAINT "event_registrations_slotId_fkey" TO "event_registrations_slot_id_fkey";
ALTER TABLE "event_registrations" RENAME CONSTRAINT "event_registrations_ticketId_fkey" TO "event_registrations_ticket_id_fkey";
ALTER TABLE "event_tickets" RENAME CONSTRAINT "event_tickets_eventId_fkey" TO "event_tickets_event_id_fkey";
ALTER TABLE "event_time_slots" RENAME CONSTRAINT "event_time_slots_eventId_fkey" TO "event_time_slots_event_id_fkey";
ALTER TABLE "events" RENAME CONSTRAINT "events_categoryId_fkey" TO "events_category_id_fkey";
ALTER TABLE "events" RENAME CONSTRAINT "events_deletedById_fkey" TO "events_deleted_by_id_fkey";
ALTER TABLE "events" RENAME CONSTRAINT "events_locationId_fkey" TO "events_location_id_fkey";
ALTER TABLE "events" RENAME CONSTRAINT "events_spaceId_fkey" TO "events_space_id_fkey";
ALTER TABLE "reservation_series" RENAME CONSTRAINT "reservation_series_couponId_fkey" TO "reservation_series_coupon_id_fkey";
ALTER TABLE "reservation_series" RENAME CONSTRAINT "reservation_series_customerId_fkey" TO "reservation_series_customer_id_fkey";
ALTER TABLE "reservation_series" RENAME CONSTRAINT "reservation_series_deletedById_fkey" TO "reservation_series_deleted_by_id_fkey";
ALTER TABLE "reservation_series" RENAME CONSTRAINT "reservation_series_spaceId_fkey" TO "reservation_series_space_id_fkey";
ALTER TABLE "reservations" RENAME CONSTRAINT "reservations_couponId_fkey" TO "reservations_coupon_id_fkey";
ALTER TABLE "reservations" RENAME CONSTRAINT "reservations_customerId_fkey" TO "reservations_customer_id_fkey";
ALTER TABLE "reservations" RENAME CONSTRAINT "reservations_deletedById_fkey" TO "reservations_deleted_by_id_fkey";
ALTER TABLE "reservations" RENAME CONSTRAINT "reservations_seriesId_fkey" TO "reservations_series_id_fkey";
ALTER TABLE "reservations" RENAME CONSTRAINT "reservations_spaceId_fkey" TO "reservations_space_id_fkey";
ALTER TABLE "reservations" RENAME CONSTRAINT "reservations_userId_fkey" TO "reservations_user_id_fkey";
ALTER INDEX "coupons_isActive_idx" RENAME TO "coupons_is_active_idx";
ALTER INDEX "coupons_validFrom_validUntil_idx" RENAME TO "coupons_valid_from_valid_until_idx";
ALTER INDEX "event_registrations_customerId_idx" RENAME TO "event_registrations_customer_id_idx";
ALTER INDEX "event_registrations_eventId_attendedAt_idx" RENAME TO "event_registrations_event_id_attended_at_idx";
ALTER INDEX "event_registrations_eventId_status_createdAt_idx" RENAME TO "event_registrations_event_id_status_created_at_idx";
ALTER INDEX "event_registrations_paymentStatus_idx" RENAME TO "event_registrations_payment_status_idx";
ALTER INDEX "event_registrations_slotId_status_idx" RENAME TO "event_registrations_slot_id_status_idx";
ALTER INDEX "event_registrations_slotId_ticketId_status_waitlistedAt_idx" RENAME TO "event_registrations_slot_id_ticket_id_status_waitlisted_at_idx";
ALTER INDEX "event_registrations_status_expiresAt_idx" RENAME TO "event_registrations_status_expires_at_idx";
ALTER INDEX "event_registrations_stripeCheckoutSessionId_key" RENAME TO "event_registrations_stripe_checkout_session_id_key";
ALTER INDEX "event_registrations_stripePaymentIntentId_key" RENAME TO "event_registrations_stripe_payment_intent_id_key";
ALTER INDEX "event_registrations_ticketId_idx" RENAME TO "event_registrations_ticket_id_idx";
ALTER INDEX "event_tickets_eventId_isAvailable_idx" RENAME TO "event_tickets_event_id_is_available_idx";
ALTER INDEX "event_time_slots_eventId_startAt_key" RENAME TO "event_time_slots_event_id_start_at_key";
ALTER INDEX "events_categoryId_idx" RENAME TO "events_category_id_idx";
ALTER INDEX "events_deletedAt_idx" RENAME TO "events_deleted_at_idx";
ALTER INDEX "events_firstSlotStartAt_idx" RENAME TO "events_first_slot_start_at_idx";
ALTER INDEX "events_lastSlotEndAt_idx" RENAME TO "events_last_slot_end_at_idx";
ALTER INDEX "events_locationId_idx" RENAME TO "events_location_id_idx";
ALTER INDEX "reservation_series_createdAt_idx" RENAME TO "reservation_series_created_at_idx";
ALTER INDEX "reservation_series_customerId_idx" RENAME TO "reservation_series_customer_id_idx";
ALTER INDEX "reservation_series_deletedAt_idx" RENAME TO "reservation_series_deleted_at_idx";
ALTER INDEX "reservation_series_spaceId_dtstart_idx" RENAME TO "reservation_series_space_id_dtstart_idx";
ALTER INDEX "reservations_couponId_idx" RENAME TO "reservations_coupon_id_idx";
ALTER INDEX "reservations_createdAt_idx" RENAME TO "reservations_created_at_idx";
ALTER INDEX "reservations_customerId_startTime_idx" RENAME TO "reservations_customer_id_start_time_idx";
ALTER INDEX "reservations_deletedAt_idx" RENAME TO "reservations_deleted_at_idx";
ALTER INDEX "reservations_endTime_idx" RENAME TO "reservations_end_time_idx";
ALTER INDEX "reservations_paymentStatus_idx" RENAME TO "reservations_payment_status_idx";
ALTER INDEX "reservations_seriesId_recurrenceInstanceIndex_idx" RENAME TO "reservations_series_id_recurrence_instance_index_idx";
ALTER INDEX "reservations_spaceId_startTime_endTime_idx" RENAME TO "reservations_space_id_start_time_end_time_idx";
ALTER INDEX "reservations_startTime_idx" RENAME TO "reservations_start_time_idx";
ALTER INDEX "reservations_stripeCheckoutSessionId_key" RENAME TO "reservations_stripe_checkout_session_id_key";
ALTER INDEX "reservations_stripePaymentIntentId_key" RENAME TO "reservations_stripe_payment_intent_id_key";
ALTER INDEX "reservations_userId_idx" RENAME TO "reservations_user_id_idx";

-- 3. plpgsql 関数の作り直し（本体はテキストなので rename が届かない）

CREATE OR REPLACE FUNCTION public.check_event_no_reservation_overlap()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  conflicting_reservation_id VARCHAR;
  conflicting_slot_id VARCHAR;
BEGIN
  -- spaceId null (外部会場) / soft-deleted / 非 active status は検査対象外
  IF NEW.space_id IS NULL
     OR NEW.deleted_at IS NOT NULL
     OR NEW.status NOT IN ('DRAFT', 'PUBLISHED') THEN
    RETURN NEW;
  END IF;

  SELECT r.id, ets.id
    INTO conflicting_reservation_id, conflicting_slot_id
  FROM event_time_slots ets
  JOIN reservations r
    ON r.space_id = NEW.space_id
   AND r.deleted_at IS NULL
   AND r.status IN ('PENDING', 'CONFIRMED')
   AND ets.start_at < r.end_time
   AND ets.end_at > r.start_time
  WHERE ets.event_id = NEW.id
  LIMIT 1;

  IF conflicting_reservation_id IS NOT NULL THEN
    RAISE EXCEPTION 'Event slot % overlaps with reservation % on space %',
      conflicting_slot_id, conflicting_reservation_id, NEW.space_id
      USING ERRCODE = 'exclusion_violation';
  END IF;

  RETURN NEW;
END;
$function$
;
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
  SELECT schedule_mode, registration_deadline
  INTO current_mode, current_deadline
  FROM "events"
  WHERE "id" = "targetEventId"
    AND deleted_at IS NULL;

  IF current_mode IS NULL THEN
    RETURN;
  END IF;

  SELECT COUNT(*), MIN(start_at)
  INTO slot_count, first_slot_start
  FROM "event_time_slots"
  WHERE event_id = "targetEventId";

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
$function$
;
CREATE OR REPLACE FUNCTION public.check_event_schedule_integrity_from_slot()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  target_event_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_event_id := OLD.event_id;
    PERFORM "check_event_schedule_integrity"(target_event_id);
    RETURN OLD;
  END IF;

  target_event_id := NEW.event_id;
  PERFORM "check_event_schedule_integrity"(target_event_id);

  IF TG_OP = 'UPDATE' AND OLD.event_id <> NEW.event_id THEN
    PERFORM "check_event_schedule_integrity"(OLD.event_id);
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.check_event_slot_no_reservation_overlap()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  event_space_id UUID;
  event_status TEXT;
  event_deleted_at TIMESTAMP;
  conflicting_reservation_id VARCHAR;
BEGIN
  SELECT space_id, status::text, deleted_at
    INTO event_space_id, event_status, event_deleted_at
  FROM events
  WHERE id = NEW.event_id;

  -- spaceId null (外部会場) / soft-deleted event / 非 active status は検査対象外
  IF event_space_id IS NULL
     OR event_deleted_at IS NOT NULL
     OR event_status NOT IN ('DRAFT', 'PUBLISHED') THEN
    RETURN NEW;
  END IF;

  SELECT r.id INTO conflicting_reservation_id
  FROM reservations r
  WHERE r.space_id = event_space_id
    AND r.deleted_at IS NULL
    AND r.status IN ('PENDING', 'CONFIRMED')
    AND r.start_time < NEW.end_at
    AND r.end_time > NEW.start_at
  LIMIT 1;

  IF conflicting_reservation_id IS NOT NULL THEN
    RAISE EXCEPTION 'EventTimeSlot time overlaps with reservation % on space %',
      conflicting_reservation_id, event_space_id
      USING ERRCODE = 'exclusion_violation';
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.check_reservation_no_event_slot_overlap()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  conflicting_slot_id VARCHAR;
BEGIN
  -- soft-deleted or 非 active status は検査対象外
  IF NEW.deleted_at IS NOT NULL
     OR NEW.status NOT IN ('PENDING', 'CONFIRMED') THEN
    RETURN NEW;
  END IF;

  SELECT ets.id INTO conflicting_slot_id
  FROM event_time_slots ets
  JOIN events e ON e.id = ets.event_id
  WHERE e.space_id = NEW.space_id
    AND e.deleted_at IS NULL
    AND e.status IN ('DRAFT', 'PUBLISHED')
    AND ets.start_at < NEW.end_time
    AND ets.end_at > NEW.start_time
  LIMIT 1;

  IF conflicting_slot_id IS NOT NULL THEN
    RAISE EXCEPTION 'Reservation time overlaps with EventTimeSlot % on space %',
      conflicting_slot_id, NEW.space_id
      USING ERRCODE = 'exclusion_violation';
  END IF;

  RETURN NEW;
END;
$function$
;

COMMIT;
