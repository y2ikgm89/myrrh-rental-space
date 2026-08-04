-- ============================================================================
-- baseline invariants — Prisma DSL で表現できない不変条件
-- ============================================================================
--
-- `prisma migrate diff --from-empty --to-schema` が出す DDL には
-- **CHECK 制約・EXCLUDE 制約・plpgsql 関数・trigger が一切含まれない**。
-- Prisma のスキーマ言語がそれらを表現できないため。migration 履歴を 1 本の
-- baseline へ畳むと、この 100 件が黙って消える。
--
-- このファイルは `scripts/build-baseline-migration.ts` が生成 DDL の**後ろ**に
-- 連結する。extension だけは GIN index より前に要るので別ファイル
-- （`extensions.sql`）で prelude として先に流す。
--
-- 中身は手で列挙していない。migration 履歴を適用した DB と、生成 DDL だけを
-- 適用した DB の **pg_catalog センサス差分**から機械的に起こしてある
-- （`scripts/db-census.ts`）。手で書くと必ず取りこぼす。
--
-- ## 意図的に含めないもの
--
-- - `audit_logs_sequence_key` — 履歴では `ADD CONSTRAINT ... UNIQUE`、Prisma は
--   `CREATE UNIQUE INDEX` で出す。強制力は同一でカタログ上の表現だけが違う。
--   ここで constraint として作り直すと Prisma が作った同名 index と衝突する。
--
-- ## 順序
--
-- NOT NULL → CHECK → 関数 → EXCLUDE → trigger。trigger は関数が先に無いと作れない。
-- ============================================================================


-- ===== スカラー配列列の NOT NULL (3) =====
--
-- Prisma は `String[]` に NOT NULL を出さない（Prisma 側の型は非 null なので
-- クライアントが null を書かない前提）。履歴では手書き migration が付けていた。
-- 落とすと「Prisma 経由以外の書込で null が入る」余地が開くので復元する。

ALTER TABLE "settings_notifications" ALTER COLUMN "notificationEmailAddresses" SET NOT NULL;

ALTER TABLE "settings_notifications" ALTER COLUMN "notificationStaffIds" SET NOT NULL;

ALTER TABLE "settings_stripes" ALTER COLUMN "stripePaymentMethodTypes" SET NOT NULL;

-- ===== CHECK constraints (76) =====
ALTER TABLE "announcement_bars" ADD CONSTRAINT "announcement_bars_message_array_check" CHECK (((message IS NULL) OR (jsonb_typeof(message) = 'array'::text)));

ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_chain_version_check" CHECK (("chainVersion" = 1));

ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_entry_hash_hex_check" CHECK (("entryHash" ~ '^[0-9a-f]{64}$'::text));

ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_hash_algorithm_check" CHECK ((("hashAlgorithm")::text = 'HMAC-SHA256'::text));

ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_hash_key_id_check" CHECK ((("hashKeyId")::text ~ '^[A-Za-z0-9_-]{1,32}$'::text));

ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_previous_hash_hex_check" CHECK (("previousHash" ~ '^[0-9a-f]{64}$'::text));

ALTER TABLE "blocked_dates" ADD CONSTRAINT "blocked_dates_scope_target_check" CHECK (((((scope)::text = 'SPACE'::text) AND ("spaceId" IS NOT NULL) AND ("locationId" IS NULL)) OR (((scope)::text = 'LOCATION'::text) AND ("locationId" IS NOT NULL) AND ("spaceId" IS NULL)) OR (((scope)::text = 'GLOBAL'::text) AND ("spaceId" IS NULL) AND ("locationId" IS NULL))));

ALTER TABLE "coupons" ADD CONSTRAINT "coupons_amount_bounds_check" CHECK (((("maxDiscountAmount" IS NULL) OR ("maxDiscountAmount" > 0)) AND (("minReservationAmount" IS NULL) OR ("minReservationAmount" >= 0))));

ALTER TABLE "coupons" ADD CONSTRAINT "coupons_discount_value_range_check" CHECK ((("discountValue" > 0) AND ((type <> 'PERCENTAGE'::"CouponType") OR ("discountValue" <= 100))));

ALTER TABLE "coupons" ADD CONSTRAINT "coupons_usage_range_check" CHECK ((("usageCount" >= 0) AND (("usageLimit" IS NULL) OR ("usageLimit" >= 1))));

ALTER TABLE "customers" ADD CONSTRAINT "customers_emailCanonical_not_empty_check" CHECK ((btrim("emailCanonical") <> ''::text));

ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_quantity_positive" CHECK ((quantity >= 1));

ALTER TABLE "event_tickets" ADD CONSTRAINT "event_tickets_capacity_positive_or_null" CHECK (((capacity IS NULL) OR (capacity >= 1)));

ALTER TABLE "event_tickets" ADD CONSTRAINT "event_tickets_price_non_negative" CHECK ((price >= 0));

ALTER TABLE "event_tickets" ADD CONSTRAINT "event_tickets_unit_size_positive" CHECK (("unitSize" >= 1));

ALTER TABLE "event_time_slots" ADD CONSTRAINT "event_time_slots_capacity_positive" CHECK ((capacity >= 1));

ALTER TABLE "event_time_slots" ADD CONSTRAINT "event_time_slots_time_order" CHECK (("startAt" < "endAt"));

ALTER TABLE "events" ADD CONSTRAINT "event_online_meeting_url_required" CHECK (((format = 'OFFLINE'::"EventFormat") OR ("meetingProvider" = 'GOOGLE_MEET'::"MeetingProvider") OR ("meetingUrl" IS NOT NULL)));

ALTER TABLE "events" ADD CONSTRAINT "events_gallery_array_check" CHECK (((gallery IS NULL) OR (jsonb_typeof(gallery) = 'array'::text)));

ALTER TABLE "inquiry_attachments" ADD CONSTRAINT "inquiry_attachments_uploader_side_check" CHECK (((("uploadedById" IS NOT NULL) AND ("uploadedByCustomerId" IS NULL)) OR (("uploadedByCustomerId" IS NOT NULL) AND ("uploadedById" IS NULL))));

ALTER TABLE "inquiry_replies" ADD CONSTRAINT "inquiry_replies_author_side_check" CHECK (((("authorType" = 'STAFF'::"InquiryReplyAuthorType") AND ("authorId" IS NOT NULL) AND ("authorCustomerId" IS NULL)) OR (("authorType" = 'CUSTOMER'::"InquiryReplyAuthorType") AND ("authorCustomerId" IS NOT NULL) AND ("authorId" IS NULL))));

ALTER TABLE "locations" ADD CONSTRAINT "locations_accessLines_array_check" CHECK ((("accessLines" IS NULL) OR (jsonb_typeof("accessLines") = 'array'::text)));

ALTER TABLE "locations" ADD CONSTRAINT "locations_imageUrls_array_check" CHECK ((("imageUrls" IS NULL) OR (jsonb_typeof("imageUrls") = 'array'::text)));

ALTER TABLE "media" ADD CONSTRAINT "media_tags_array_check" CHECK (((tags IS NULL) OR (jsonb_typeof(tags) = 'array'::text)));

ALTER TABLE "receipt_sequences" ADD CONSTRAINT "receipt_sequences_singleton_check" CHECK (((id)::text = 'singleton'::text));

ALTER TABLE "receipts" ADD CONSTRAINT "receipts_money_non_negative_check" CHECK (((amount >= 0) AND ("taxAmount" >= 0)));

ALTER TABLE "receipts" ADD CONSTRAINT "receipts_target_exclusive_check" CHECK ((NOT (("reservationId" IS NOT NULL) AND ("eventRegistrationId" IS NOT NULL))));

ALTER TABLE "receipts" ADD CONSTRAINT "receipts_tax_rate_range_check" CHECK ((("taxRate" >= 0) AND ("taxRate" <= 100)));

ALTER TABLE "refunds" ADD CONSTRAINT "refunds_amount_positive_check" CHECK ((amount >= 1));

ALTER TABLE "refunds" ADD CONSTRAINT "refunds_refundedByType_check" CHECK ((("refundedByType")::text = ANY ((ARRAY['ADMIN'::character varying, 'AUTO_ON_CANCEL'::character varying, 'AUTO_CAPACITY_RACE'::character varying, 'AUTO_AMOUNT_MISMATCH'::character varying, 'STRIPE_DASHBOARD'::character varying])::text[])));

ALTER TABLE "refunds" ADD CONSTRAINT "refunds_status_check" CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'requires_action'::character varying, 'succeeded'::character varying, 'failed'::character varying, 'canceled'::character varying])::text[])));

ALTER TABLE "refunds" ADD CONSTRAINT "refunds_target_check" CHECK (((("reservationId" IS NOT NULL) AND ("eventRegistrationId" IS NULL)) OR (("reservationId" IS NULL) AND ("eventRegistrationId" IS NOT NULL))));

ALTER TABLE "reservations" ADD CONSTRAINT "reservations_money_non_negative_check" CHECK ((("basePrice" >= 0) AND ("totalPrice" >= 0) AND ("taxAmount" >= 0) AND ("totalPriceWithTax" >= 0) AND (("couponDiscountAmount" IS NULL) OR ("couponDiscountAmount" >= 0)) AND (("durationDiscountAmount" IS NULL) OR ("durationDiscountAmount" >= 0)) AND (("spaceDiscountAmount" IS NULL) OR ("spaceDiscountAmount" >= 0))));

ALTER TABLE "reservations" ADD CONSTRAINT "reservations_number_of_guests_positive_check" CHECK ((("numberOfGuests" IS NULL) OR ("numberOfGuests" >= 1)));

ALTER TABLE "reservations" ADD CONSTRAINT "reservations_tax_rate_range_check" CHECK ((("taxRate" >= 0) AND ("taxRate" <= 100)));

ALTER TABLE "reservations" ADD CONSTRAINT "reservations_time_order_check" CHECK (("startTime" < "endTime"));

ALTER TABLE "settings_analytics" ADD CONSTRAINT "settings_analytics_singleton_check" CHECK ((id = 'singleton'::text));

ALTER TABLE "settings_announcement_carousels" ADD CONSTRAINT "settings_announcement_carousels_singleton_check" CHECK ((id = 'singleton'::text));

ALTER TABLE "settings_commerces" ADD CONSTRAINT "SettingsCommerce_durationDiscountRules_array_check" CHECK ((jsonb_typeof("durationDiscountRules") = 'array'::text));

ALTER TABLE "settings_commerces" ADD CONSTRAINT "settings_commerces_singleton_check" CHECK ((id = 'singleton'::text));

ALTER TABLE "settings_data_retentions" ADD CONSTRAINT "settings_data_retentions_singleton_check" CHECK ((id = 'singleton'::text));

ALTER TABLE "settings_features" ADD CONSTRAINT "settings_features_singleton_check" CHECK ((id = 'singleton'::text));

ALTER TABLE "settings_google_business_profiles" ADD CONSTRAINT "settings_google_business_profiles_singleton_check" CHECK ((id = 'singleton'::text));

ALTER TABLE "settings_google_calendars" ADD CONSTRAINT "settings_google_calendars_connection_status_check" CHECK ((("googleCalendarConnectionStatus" IS NULL) OR ("googleCalendarConnectionStatus" = ANY (ARRAY['connected'::text, 'error'::text]))));

ALTER TABLE "settings_google_calendars" ADD CONSTRAINT "settings_google_calendars_singleton_check" CHECK ((id = 'singleton'::text));

ALTER TABLE "settings_google_maps" ADD CONSTRAINT "settings_google_maps_connection_status_check" CHECK ((("googleMapsConnectionStatus" IS NULL) OR ("googleMapsConnectionStatus" = ANY (ARRAY['connected'::text, 'error'::text]))));

ALTER TABLE "settings_google_maps" ADD CONSTRAINT "settings_google_maps_singleton_check" CHECK ((id = 'singleton'::text));

ALTER TABLE "settings_instagrams" ADD CONSTRAINT "settings_instagrams_singleton_check" CHECK ((id = 'singleton'::text));

ALTER TABLE "settings_layouts" ADD CONSTRAINT "settings_layouts_singleton_check" CHECK ((id = 'singleton'::text));

ALTER TABLE "settings_notifications" ADD CONSTRAINT "SettingsNotification_notificationEmailAddresses_text_array_chec" CHECK (((array_position("notificationEmailAddresses", NULL::text) IS NULL) AND (array_position("notificationEmailAddresses", ''::text) IS NULL)));

ALTER TABLE "settings_notifications" ADD CONSTRAINT "SettingsNotification_notificationStaffIds_text_array_check" CHECK (((array_position("notificationStaffIds", NULL::text) IS NULL) AND (array_position("notificationStaffIds", ''::text) IS NULL)));

ALTER TABLE "settings_notifications" ADD CONSTRAINT "settings_notifications_singleton_check" CHECK ((id = 'singleton'::text));

ALTER TABLE "settings_organizations" ADD CONSTRAINT "settings_organizations_singleton_check" CHECK ((id = 'singleton'::text));

ALTER TABLE "settings_resends" ADD CONSTRAINT "settings_resends_connection_status_check" CHECK ((("resendConnectionStatus" IS NULL) OR ("resendConnectionStatus" = ANY (ARRAY['connected'::text, 'error'::text]))));

ALTER TABLE "settings_resends" ADD CONSTRAINT "settings_resends_singleton_check" CHECK ((id = 'singleton'::text));

ALTER TABLE "settings_reservations" ADD CONSTRAINT "settings_reservations_singleton_check" CHECK ((id = 'singleton'::text));

ALTER TABLE "settings_seos" ADD CONSTRAINT "settings_seos_singleton_check" CHECK ((id = 'singleton'::text));

ALTER TABLE "settings_sidebars" ADD CONSTRAINT "SettingsSidebar_sidebarWidgets_array_check" CHECK ((jsonb_typeof("sidebarWidgets") = 'array'::text));

ALTER TABLE "settings_sidebars" ADD CONSTRAINT "settings_sidebars_singleton_check" CHECK ((id = 'singleton'::text));

ALTER TABLE "settings_stripes" ADD CONSTRAINT "settings_stripes_connection_status_check" CHECK ((("stripeConnectionStatus" IS NULL) OR ("stripeConnectionStatus" = ANY (ARRAY['connected'::text, 'error'::text]))));

ALTER TABLE "settings_stripes" ADD CONSTRAINT "settings_stripes_singleton_check" CHECK ((id = 'singleton'::text));

ALTER TABLE "settings_switchbots" ADD CONSTRAINT "settings_switchbots_connection_status_check" CHECK ((("switchbotConnectionStatus" IS NULL) OR ("switchbotConnectionStatus" = ANY (ARRAY['connected'::text, 'error'::text]))));

ALTER TABLE "settings_switchbots" ADD CONSTRAINT "settings_switchbots_singleton_check" CHECK ((id = 'singleton'::text));

ALTER TABLE "settings_systems" ADD CONSTRAINT "settings_systems_singleton_check" CHECK ((id = 'singleton'::text));

ALTER TABLE "settings_turnstiles" ADD CONSTRAINT "settings_turnstiles_connection_status_check" CHECK ((("turnstileConnectionStatus" IS NULL) OR ("turnstileConnectionStatus" = ANY (ARRAY['connected'::text, 'error'::text]))));

ALTER TABLE "settings_turnstiles" ADD CONSTRAINT "settings_turnstiles_singleton_check" CHECK ((id = 'singleton'::text));

ALTER TABLE "space_rate_plans" ADD CONSTRAINT "space_rate_plans_effective_range_check" CHECK ((("effectiveFrom" IS NULL) OR ("effectiveTo" IS NULL) OR ("effectiveFrom" <= "effectiveTo")));

ALTER TABLE "space_rate_plans" ADD CONSTRAINT "space_rate_plans_endTime_format_check" CHECK ((("endTime" IS NULL) OR (("endTime")::text ~ '^([01][0-9]|2[0-3]|24):[0-5][0-9]$'::text)));

ALTER TABLE "space_rate_plans" ADD CONSTRAINT "space_rate_plans_hourlyPrice_non_negative_check" CHECK ((("hourlyPrice")::numeric >= (0)::numeric));

ALTER TABLE "space_rate_plans" ADD CONSTRAINT "space_rate_plans_startTime_format_check" CHECK ((("startTime" IS NULL) OR (("startTime")::text ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'::text)));

ALTER TABLE "spaces" ADD CONSTRAINT "spaces_area_positive_check" CHECK (((area IS NULL) OR (area > 0)));

ALTER TABLE "spaces" ADD CONSTRAINT "spaces_capacity_positive_check" CHECK ((capacity >= 1));

ALTER TABLE "spaces" ADD CONSTRAINT "spaces_discount_value_range_check" CHECK ((("discountValue" IS NULL) OR (("discountValue" >= 0) AND (("discountType" <> 'percentage'::"DiscountType") OR ("discountValue" <= 100)))));

ALTER TABLE "spaces" ADD CONSTRAINT "spaces_facilities_array_check" CHECK (((facilities IS NULL) OR (jsonb_typeof(facilities) = 'array'::text)));

ALTER TABLE "spaces" ADD CONSTRAINT "spaces_gallery_array_check" CHECK (((gallery IS NULL) OR (jsonb_typeof(gallery) = 'array'::text)));

ALTER TABLE "spaces" ADD CONSTRAINT "spaces_hourly_price_non_negative_check" CHECK (("hourlyPrice" >= 0));


-- ===== plpgsql functions (10) =====
CREATE OR REPLACE FUNCTION public.check_event_no_reservation_overlap()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  conflicting_reservation_id VARCHAR;
  conflicting_slot_id VARCHAR;
BEGIN
  -- spaceId null (外部会場) / soft-deleted / 非 active status は検査対象外
  IF NEW."spaceId" IS NULL
     OR NEW."deletedAt" IS NOT NULL
     OR NEW.status NOT IN ('DRAFT', 'PUBLISHED') THEN
    RETURN NEW;
  END IF;

  SELECT r.id, ets.id
    INTO conflicting_reservation_id, conflicting_slot_id
  FROM event_time_slots ets
  JOIN reservations r
    ON r."spaceId" = NEW."spaceId"
   AND r."deletedAt" IS NULL
   AND r.status IN ('PENDING', 'CONFIRMED')
   AND ets."startAt" < r."endTime"
   AND ets."endAt" > r."startTime"
  WHERE ets."eventId" = NEW.id
  LIMIT 1;

  IF conflicting_reservation_id IS NOT NULL THEN
    RAISE EXCEPTION 'Event slot % overlaps with reservation % on space %',
      conflicting_slot_id, conflicting_reservation_id, NEW."spaceId"
      USING ERRCODE = 'exclusion_violation';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_event_schedule_integrity("targetEventId" uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  current_mode "EventScheduleMode";
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

CREATE OR REPLACE FUNCTION public.check_event_schedule_integrity_from_event()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM "check_event_schedule_integrity"(NEW."id");
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_event_schedule_integrity_from_slot()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  target_event_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_event_id := OLD."eventId";
    PERFORM "check_event_schedule_integrity"(target_event_id);
    RETURN OLD;
  END IF;

  target_event_id := NEW."eventId";
  PERFORM "check_event_schedule_integrity"(target_event_id);

  IF TG_OP = 'UPDATE' AND OLD."eventId" <> NEW."eventId" THEN
    PERFORM "check_event_schedule_integrity"(OLD."eventId");
  END IF;

  RETURN NEW;
END;
$function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.check_reservation_no_event_slot_overlap()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.prevent_audit_logs_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF current_setting('myrrh.audit_log_mutation_bypass', true) = 'seed' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;

    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'audit_logs is append-only; % is not allowed', TG_OP
    USING ERRCODE = 'integrity_constraint_violation';
END;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_inquiry_status_history_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF current_setting('myrrh.inquiry_status_history_mutation_bypass', true) IN ('seed', 'purge') THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;

    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'inquiry_status_history is append-only; % is not allowed', TG_OP
    USING ERRCODE = 'integrity_constraint_violation';
END;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_refunds_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF current_setting('myrrh.refund_mutation_bypass', true) = 'seed' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.id = OLD.id
     AND NEW."reservationId" IS NOT DISTINCT FROM OLD."reservationId"
     AND NEW."eventRegistrationId" IS NOT DISTINCT FROM OLD."eventRegistrationId"
     AND NEW.amount = OLD.amount
     AND NEW.reason IS NOT DISTINCT FROM OLD.reason
     AND NEW."stripeRefundId" = OLD."stripeRefundId"
     AND NEW."refundedByType" = OLD."refundedByType"
     AND NEW."createdAt" = OLD."createdAt"
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'refunds is append-only (status is the only mutable column); % is not allowed', TG_OP
    USING ERRCODE = 'integrity_constraint_violation';
END;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_terms_agreements_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF current_setting('myrrh.terms_agreement_mutation_bypass', true) = 'seed' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;

    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'terms_agreements is append-only; % is not allowed', TG_OP
    USING ERRCODE = 'integrity_constraint_violation';
END;
$function$;


-- ===== EXCLUDE constraints (1) =====
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_no_active_time_overlap_excl" EXCLUDE USING gist ("spaceId" WITH =, tstzrange("startTime", "endTime", '[)'::text) WITH &&) WHERE ((("deletedAt" IS NULL) AND (status = ANY (ARRAY['PENDING'::"ReservationStatus", 'CONFIRMED'::"ReservationStatus"]))));


-- ===== triggers (13) =====
CREATE CONSTRAINT TRIGGER event_time_slots_no_reservation_overlap_check AFTER INSERT OR UPDATE OF "eventId", "startAt", "endAt" ON public.event_time_slots DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_event_slot_no_reservation_overlap();

CREATE CONSTRAINT TRIGGER event_time_slots_schedule_integrity_check AFTER INSERT OR DELETE OR UPDATE OF "eventId", "startAt" ON public.event_time_slots DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_event_schedule_integrity_from_slot();

CREATE CONSTRAINT TRIGGER events_no_reservation_overlap_check AFTER INSERT OR UPDATE OF "spaceId", status, "deletedAt" ON public.events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_event_no_reservation_overlap();

CREATE CONSTRAINT TRIGGER events_schedule_integrity_check AFTER INSERT OR UPDATE OF "scheduleMode", "deletedAt", "registrationDeadline" ON public.events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_event_schedule_integrity_from_event();

CREATE CONSTRAINT TRIGGER reservations_no_event_slot_overlap_check AFTER INSERT OR UPDATE OF "spaceId", "startTime", "endTime", status, "deletedAt" ON public.reservations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_reservation_no_event_slot_overlap();

CREATE TRIGGER audit_logs_no_delete BEFORE DELETE ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION prevent_audit_logs_mutation();

CREATE TRIGGER audit_logs_no_update BEFORE UPDATE ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION prevent_audit_logs_mutation();

CREATE TRIGGER inquiry_status_history_no_delete BEFORE DELETE ON public.inquiry_status_history FOR EACH ROW EXECUTE FUNCTION prevent_inquiry_status_history_mutation();

CREATE TRIGGER inquiry_status_history_no_update BEFORE UPDATE ON public.inquiry_status_history FOR EACH ROW EXECUTE FUNCTION prevent_inquiry_status_history_mutation();

CREATE TRIGGER refunds_no_delete BEFORE DELETE ON public.refunds FOR EACH ROW EXECUTE FUNCTION prevent_refunds_mutation();

CREATE TRIGGER refunds_no_update BEFORE UPDATE ON public.refunds FOR EACH ROW EXECUTE FUNCTION prevent_refunds_mutation();

CREATE TRIGGER terms_agreements_no_delete BEFORE DELETE ON public.terms_agreements FOR EACH ROW EXECUTE FUNCTION prevent_terms_agreements_mutation();

CREATE TRIGGER terms_agreements_no_update BEFORE UPDATE ON public.terms_agreements FOR EACH ROW EXECUTE FUNCTION prevent_terms_agreements_mutation();

