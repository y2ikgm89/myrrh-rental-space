-- ============================================================================
-- baseline invariants — Prisma DSL で表現できない不変条件
-- ============================================================================
--
-- **このファイルは生成物。手で編集しない。**
--   bun scripts/build-baseline-invariants.ts --url <全 migration 適用済み DB> --force
--
-- `prisma migrate diff --from-empty --to-schema` が出す DDL には CHECK 制約・
-- EXCLUDE 制約・plpgsql 関数・trigger が一切含まれない（Prisma のスキーマ言語が
-- それらを表現できないため）。migration 履歴を 1 本の baseline へ畳むと黙って消える。
--
-- `scripts/build-baseline-migration.ts` が生成 DDL の**後ろ**に連結する。extension だけは
-- GIN index より前に要るので別ファイル（`extensions.sql`）で prelude として先に流す。
--
-- ## 順序
--
-- NOT NULL → CHECK → 関数 → EXCLUDE → trigger。trigger は関数が先に無いと作れない。
-- ============================================================================


-- ===== スカラー配列列の NOT NULL (3) =====
--
-- Prisma は `String[]` に NOT NULL を出さない（Prisma 側の型が非 null なので
-- クライアントが null を書かない前提）。落とすと Prisma 経由以外の書込で null が
-- 入る余地が開く。

ALTER TABLE "settings_notification" ALTER COLUMN "notification_email_addresses" SET NOT NULL;
ALTER TABLE "settings_notification" ALTER COLUMN "notification_staff_ids" SET NOT NULL;
ALTER TABLE "settings_stripe" ALTER COLUMN "stripe_payment_method_types" SET NOT NULL;

-- ===== CHECK 制約 (70) =====

ALTER TABLE "announcement_bars" ADD CONSTRAINT "announcement_bars_message_array_check" CHECK (((message IS NULL) OR (jsonb_typeof(message) = 'array'::text)));
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_chain_version_check" CHECK ((chain_version = 1));
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_entry_hash_hex_check" CHECK ((entry_hash ~ '^[0-9a-f]{64}$'::text));
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_hash_algorithm_check" CHECK (((hash_algorithm)::text = 'HMAC-SHA256'::text));
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_hash_key_id_check" CHECK (((hash_key_id)::text ~ '^[A-Za-z0-9_-]{1,32}$'::text));
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_previous_hash_hex_check" CHECK ((previous_hash ~ '^[0-9a-f]{64}$'::text));
ALTER TABLE "blocked_dates" ADD CONSTRAINT "blocked_dates_scope_target_check" CHECK (((((scope)::text = 'SPACE'::text) AND (space_id IS NOT NULL) AND (location_id IS NULL)) OR (((scope)::text = 'LOCATION'::text) AND (location_id IS NOT NULL) AND (space_id IS NULL)) OR (((scope)::text = 'GLOBAL'::text) AND (space_id IS NULL) AND (location_id IS NULL))));
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_amount_bounds_check" CHECK ((((max_discount_amount IS NULL) OR (max_discount_amount > 0)) AND ((min_reservation_amount IS NULL) OR (min_reservation_amount >= 0))));
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_discount_value_range_check" CHECK (((discount_value > 0) AND ((type <> 'PERCENTAGE'::coupon_type) OR (discount_value <= 100))));
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_usage_range_check" CHECK (((usage_count >= 0) AND ((usage_limit IS NULL) OR (usage_limit >= 1))));
ALTER TABLE "customers" ADD CONSTRAINT "customers_email_canonical_not_empty_check" CHECK ((btrim(email_canonical) <> ''::text));
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_quantity_positive" CHECK ((quantity >= 1));
ALTER TABLE "event_tickets" ADD CONSTRAINT "event_tickets_capacity_positive_or_null" CHECK (((capacity IS NULL) OR (capacity >= 1)));
ALTER TABLE "event_tickets" ADD CONSTRAINT "event_tickets_price_non_negative" CHECK ((price >= 0));
ALTER TABLE "event_tickets" ADD CONSTRAINT "event_tickets_unit_size_positive" CHECK ((unit_size >= 1));
ALTER TABLE "event_time_slots" ADD CONSTRAINT "event_time_slots_capacity_positive" CHECK ((capacity >= 1));
ALTER TABLE "event_time_slots" ADD CONSTRAINT "event_time_slots_time_order" CHECK ((start_at < end_at));
ALTER TABLE "events" ADD CONSTRAINT "event_online_meeting_url_required" CHECK (((format = 'OFFLINE'::event_format) OR (meeting_provider = 'GOOGLE_MEET'::meeting_provider) OR (meeting_url IS NOT NULL)));
ALTER TABLE "events" ADD CONSTRAINT "events_gallery_array_check" CHECK (((gallery IS NULL) OR (jsonb_typeof(gallery) = 'array'::text)));
ALTER TABLE "inquiry_attachments" ADD CONSTRAINT "inquiry_attachments_uploader_side_check" CHECK ((((uploaded_by_id IS NOT NULL) AND (uploaded_by_customer_id IS NULL)) OR ((uploaded_by_customer_id IS NOT NULL) AND (uploaded_by_id IS NULL))));
ALTER TABLE "inquiry_replies" ADD CONSTRAINT "inquiry_replies_author_side_check" CHECK ((((author_type = 'STAFF'::inquiry_reply_author_type) AND (author_id IS NOT NULL) AND (author_customer_id IS NULL)) OR ((author_type = 'CUSTOMER'::inquiry_reply_author_type) AND (author_customer_id IS NOT NULL) AND (author_id IS NULL))));
ALTER TABLE "locations" ADD CONSTRAINT "locations_access_lines_array_check" CHECK (((access_lines IS NULL) OR (jsonb_typeof(access_lines) = 'array'::text)));
ALTER TABLE "locations" ADD CONSTRAINT "locations_image_urls_array_check" CHECK (((image_urls IS NULL) OR (jsonb_typeof(image_urls) = 'array'::text)));
ALTER TABLE "media" ADD CONSTRAINT "media_tags_array_check" CHECK (((tags IS NULL) OR (jsonb_typeof(tags) = 'array'::text)));
ALTER TABLE "receipt_sequences" ADD CONSTRAINT "receipt_sequences_singleton_check" CHECK (((id)::text = 'singleton'::text));
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_money_non_negative_check" CHECK (((amount >= 0) AND (tax_amount >= 0)));
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_target_exclusive_check" CHECK ((NOT ((reservation_id IS NOT NULL) AND (event_registration_id IS NOT NULL))));
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_tax_rate_range_check" CHECK (((tax_rate >= 0) AND (tax_rate <= 100)));
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_amount_positive_check" CHECK ((amount >= 1));
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_refunded_by_type_check" CHECK (((refunded_by_type)::text = ANY (ARRAY[('ADMIN'::character varying)::text, ('AUTO_ON_CANCEL'::character varying)::text, ('AUTO_CAPACITY_RACE'::character varying)::text, ('AUTO_AMOUNT_MISMATCH'::character varying)::text, ('STRIPE_DASHBOARD'::character varying)::text])));
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_status_check" CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('requires_action'::character varying)::text, ('succeeded'::character varying)::text, ('failed'::character varying)::text, ('canceled'::character varying)::text])));
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_target_check" CHECK ((((reservation_id IS NOT NULL) AND (event_registration_id IS NULL)) OR ((reservation_id IS NULL) AND (event_registration_id IS NOT NULL))));
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_money_non_negative_check" CHECK (((base_price >= 0) AND (total_price >= 0) AND (tax_amount >= 0) AND (total_price_with_tax >= 0) AND ((coupon_discount_amount IS NULL) OR (coupon_discount_amount >= 0)) AND ((duration_discount_amount IS NULL) OR (duration_discount_amount >= 0)) AND ((space_discount_amount IS NULL) OR (space_discount_amount >= 0))));
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_number_of_guests_positive_check" CHECK (((number_of_guests IS NULL) OR (number_of_guests >= 1)));
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_tax_rate_range_check" CHECK (((tax_rate >= 0) AND (tax_rate <= 100)));
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_time_order_check" CHECK ((start_time < end_time));
ALTER TABLE "settings_analytics" ADD CONSTRAINT "settings_analytics_singleton_check" CHECK ((id = 'singleton'::text));
ALTER TABLE "settings_announcement_carousel" ADD CONSTRAINT "settings_announcement_carousel_singleton_check" CHECK ((id = 'singleton'::text));
ALTER TABLE "settings_commerce" ADD CONSTRAINT "settings_commerce_duration_discount_rules_array_check" CHECK ((jsonb_typeof(duration_discount_rules) = 'array'::text));
ALTER TABLE "settings_commerce" ADD CONSTRAINT "settings_commerce_singleton_check" CHECK ((id = 'singleton'::text));
ALTER TABLE "settings_data_retention" ADD CONSTRAINT "settings_data_retention_singleton_check" CHECK ((id = 'singleton'::text));
ALTER TABLE "settings_features" ADD CONSTRAINT "settings_features_singleton_check" CHECK ((id = 'singleton'::text));
ALTER TABLE "settings_google_business_profile" ADD CONSTRAINT "settings_google_business_profile_singleton_check" CHECK ((id = 'singleton'::text));
ALTER TABLE "settings_google_calendar" ADD CONSTRAINT "settings_google_calendar_singleton_check" CHECK ((id = 'singleton'::text));
ALTER TABLE "settings_google_maps" ADD CONSTRAINT "settings_google_maps_singleton_check" CHECK ((id = 'singleton'::text));
ALTER TABLE "settings_instagram" ADD CONSTRAINT "settings_instagram_singleton_check" CHECK ((id = 'singleton'::text));
ALTER TABLE "settings_layout" ADD CONSTRAINT "settings_layout_singleton_check" CHECK ((id = 'singleton'::text));
ALTER TABLE "settings_notification" ADD CONSTRAINT "settings_notification_email_addresses_text_array_check" CHECK (((array_position(notification_email_addresses, NULL::text) IS NULL) AND (array_position(notification_email_addresses, ''::text) IS NULL)));
ALTER TABLE "settings_notification" ADD CONSTRAINT "settings_notification_singleton_check" CHECK ((id = 'singleton'::text));
ALTER TABLE "settings_notification" ADD CONSTRAINT "settings_notification_staff_ids_text_array_check" CHECK (((array_position(notification_staff_ids, NULL::text) IS NULL) AND (array_position(notification_staff_ids, ''::text) IS NULL)));
ALTER TABLE "settings_organization" ADD CONSTRAINT "settings_organization_singleton_check" CHECK ((id = 'singleton'::text));
ALTER TABLE "settings_resend" ADD CONSTRAINT "settings_resend_singleton_check" CHECK ((id = 'singleton'::text));
ALTER TABLE "settings_reservation" ADD CONSTRAINT "settings_reservation_singleton_check" CHECK ((id = 'singleton'::text));
ALTER TABLE "settings_seo" ADD CONSTRAINT "settings_seo_singleton_check" CHECK ((id = 'singleton'::text));
ALTER TABLE "settings_sidebar" ADD CONSTRAINT "settings_sidebar_singleton_check" CHECK ((id = 'singleton'::text));
ALTER TABLE "settings_sidebar" ADD CONSTRAINT "settings_sidebar_widgets_array_check" CHECK ((jsonb_typeof(sidebar_widgets) = 'array'::text));
ALTER TABLE "settings_stripe" ADD CONSTRAINT "settings_stripe_singleton_check" CHECK ((id = 'singleton'::text));
ALTER TABLE "settings_switchbot" ADD CONSTRAINT "settings_switchbot_singleton_check" CHECK ((id = 'singleton'::text));
ALTER TABLE "settings_system" ADD CONSTRAINT "settings_system_singleton_check" CHECK ((id = 'singleton'::text));
ALTER TABLE "settings_turnstile" ADD CONSTRAINT "settings_turnstile_singleton_check" CHECK ((id = 'singleton'::text));
ALTER TABLE "space_rate_plans" ADD CONSTRAINT "space_rate_plans_effective_range_check" CHECK (((effective_from IS NULL) OR (effective_to IS NULL) OR (effective_from <= effective_to)));
ALTER TABLE "space_rate_plans" ADD CONSTRAINT "space_rate_plans_end_time_format_check" CHECK (((end_time IS NULL) OR ((end_time)::text ~ '^([01][0-9]|2[0-3]|24):[0-5][0-9]$'::text)));
ALTER TABLE "space_rate_plans" ADD CONSTRAINT "space_rate_plans_hourly_price_non_negative_check" CHECK (((hourly_price)::numeric >= (0)::numeric));
ALTER TABLE "space_rate_plans" ADD CONSTRAINT "space_rate_plans_start_time_format_check" CHECK (((start_time IS NULL) OR ((start_time)::text ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'::text)));
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_area_positive_check" CHECK (((area IS NULL) OR (area > 0)));
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_capacity_positive_check" CHECK ((capacity >= 1));
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_discount_value_range_check" CHECK (((discount_value IS NULL) OR ((discount_value >= 0) AND ((discount_type <> 'PERCENTAGE'::discount_type) OR (discount_value <= 100)))));
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_facilities_array_check" CHECK (((facilities IS NULL) OR (jsonb_typeof(facilities) = 'array'::text)));
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_gallery_array_check" CHECK (((gallery IS NULL) OR (jsonb_typeof(gallery) = 'array'::text)));
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_hourly_price_non_negative_check" CHECK ((hourly_price >= 0));

-- ===== plpgsql 関数 (10) =====
--
-- trigger 関数と、その本体から呼ばれる検査関数。**本体はテキスト**なので、
-- 列や型を rename しても自動追随しない（rename する migration 側で作り直す）。

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
$function$;

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
$function$;

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
     AND NEW.reservation_id IS NOT DISTINCT FROM OLD.reservation_id
     AND NEW.event_registration_id IS NOT DISTINCT FROM OLD.event_registration_id
     AND NEW.amount = OLD.amount
     AND NEW.reason IS NOT DISTINCT FROM OLD.reason
     AND NEW.stripe_refund_id = OLD.stripe_refund_id
     AND NEW.refunded_by_type = OLD.refunded_by_type
     AND NEW.created_at = OLD.created_at
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


-- ===== EXCLUDE 制約 (1) =====

ALTER TABLE "reservations" ADD CONSTRAINT "reservations_no_active_time_overlap_excl" EXCLUDE USING gist (space_id WITH =, tstzrange(start_time, end_time, '[)'::text) WITH &&) WHERE (((deleted_at IS NULL) AND (status = ANY (ARRAY['PENDING'::reservation_status, 'CONFIRMED'::reservation_status]))));

-- ===== trigger (13) =====

CREATE TRIGGER audit_logs_no_delete BEFORE DELETE ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION prevent_audit_logs_mutation();
CREATE TRIGGER audit_logs_no_update BEFORE UPDATE ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION prevent_audit_logs_mutation();
CREATE CONSTRAINT TRIGGER event_time_slots_no_reservation_overlap_check AFTER INSERT OR UPDATE OF event_id, start_at, end_at ON public.event_time_slots DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_event_slot_no_reservation_overlap();
CREATE CONSTRAINT TRIGGER event_time_slots_schedule_integrity_check AFTER INSERT OR DELETE OR UPDATE OF event_id, start_at ON public.event_time_slots DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_event_schedule_integrity_from_slot();
CREATE CONSTRAINT TRIGGER events_no_reservation_overlap_check AFTER INSERT OR UPDATE OF space_id, status, deleted_at ON public.events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_event_no_reservation_overlap();
CREATE CONSTRAINT TRIGGER events_schedule_integrity_check AFTER INSERT OR UPDATE OF schedule_mode, deleted_at, registration_deadline ON public.events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_event_schedule_integrity_from_event();
CREATE TRIGGER inquiry_status_history_no_delete BEFORE DELETE ON public.inquiry_status_history FOR EACH ROW EXECUTE FUNCTION prevent_inquiry_status_history_mutation();
CREATE TRIGGER inquiry_status_history_no_update BEFORE UPDATE ON public.inquiry_status_history FOR EACH ROW EXECUTE FUNCTION prevent_inquiry_status_history_mutation();
CREATE TRIGGER refunds_no_delete BEFORE DELETE ON public.refunds FOR EACH ROW EXECUTE FUNCTION prevent_refunds_mutation();
CREATE TRIGGER refunds_no_update BEFORE UPDATE ON public.refunds FOR EACH ROW EXECUTE FUNCTION prevent_refunds_mutation();
CREATE CONSTRAINT TRIGGER reservations_no_event_slot_overlap_check AFTER INSERT OR UPDATE OF space_id, start_time, end_time, status, deleted_at ON public.reservations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_reservation_no_event_slot_overlap();
CREATE TRIGGER terms_agreements_no_delete BEFORE DELETE ON public.terms_agreements FOR EACH ROW EXECUTE FUNCTION prevent_terms_agreements_mutation();
CREATE TRIGGER terms_agreements_no_update BEFORE UPDATE ON public.terms_agreements FOR EACH ROW EXECUTE FUNCTION prevent_terms_agreements_mutation();
