-- CX-2: 予約の税抜合計が内訳から導けること、返金累計が決済額を超えないこと。
--
-- ## 1. reservations.manual_adjustment_amount
--
-- 管理者が `total_price` だけを差し替えると、base / 割引は計算値のまま残り、
-- 引き算が合わない行が正常系で生まれる。差額を明示列に残し、CHECK で等式を強制する。
-- `GREATEST(0, …)` は `src/shared/lib/pricing/reservation.ts` の
-- `Math.max(0, basePrice - totalDiscount)` と揃える（割引が基本料金を超える正当な行を弾かない）。
--
-- ## 2. refunds 累計 <= 親の決済額
--
-- Stripe は charge 単位で上限するが、#77 の経路で親の決済額が後から下がると
-- 累積 > 決済額が成立しうる。親が無い孤児（reissue）は対象外。
-- `failed` / `canceled` は集計から除外（アプリの REFUND_AGGREGATE_EXCLUDED_STATUSES と同型）。
--
-- 既存行の違反は rehearsal（migration-preconditions.ts）が migrate 前に落とす。
-- 適用可能な行は、CHECK 前に差額を manual_adjustment_amount へ埋める。

BEGIN;

ALTER TABLE "reservations" ADD COLUMN "manual_adjustment_amount" INTEGER;

UPDATE "reservations"
SET "manual_adjustment_amount" = "total_price" - GREATEST(
  0,
  "base_price"
    - coalesce("coupon_discount_amount", 0)
    - coalesce("duration_discount_amount", 0)
    - coalesce("space_discount_amount", 0)
)
WHERE "total_price" <> GREATEST(
  0,
  "base_price"
    - coalesce("coupon_discount_amount", 0)
    - coalesce("duration_discount_amount", 0)
    - coalesce("space_discount_amount", 0)
);

ALTER TABLE "reservations"
  ADD CONSTRAINT "reservations_total_price_breakdown_check"
  CHECK (
    "total_price" = GREATEST(
      0,
      "base_price"
        - coalesce("coupon_discount_amount", 0)
        - coalesce("duration_discount_amount", 0)
        - coalesce("space_discount_amount", 0)
    ) + coalesce("manual_adjustment_amount", 0)
  );

CREATE FUNCTION assert_refund_total_within_paid()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  paid INTEGER;
  refunded INTEGER;
BEGIN
  IF NEW.status IN ('failed', 'canceled') THEN
    RETURN NEW;
  END IF;

  IF NEW.reservation_id IS NOT NULL THEN
    SELECT total_price_with_tax INTO paid FROM reservations WHERE id = NEW.reservation_id;
    SELECT COALESCE(SUM(amount), 0) INTO refunded FROM refunds
      WHERE reservation_id = NEW.reservation_id AND status NOT IN ('failed', 'canceled');
  ELSIF NEW.event_registration_id IS NOT NULL THEN
    SELECT paid_amount INTO paid FROM event_registrations WHERE id = NEW.event_registration_id;
    SELECT COALESCE(SUM(amount), 0) INTO refunded FROM refunds
      WHERE event_registration_id = NEW.event_registration_id AND status NOT IN ('failed', 'canceled');
  ELSE
    RETURN NEW;
  END IF;

  IF paid IS NOT NULL AND refunded > paid THEN
    RAISE EXCEPTION 'refund total % exceeds paid amount % (refund %)', refunded, paid, NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE CONSTRAINT TRIGGER refunds_total_within_paid_check
  AFTER INSERT OR UPDATE OF amount, status, reservation_id, event_registration_id ON refunds
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_refund_total_within_paid();

COMMIT;
