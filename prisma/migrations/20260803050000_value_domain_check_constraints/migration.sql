-- 金額・数量・率の値域と、領収書の多態参照の排他を DB 側でも保証する。
--
-- 現状これらを守っているのは Zod と domain のコードだけで、DB は負の金額も
-- 200% の税率も受理する。同種の CHECK は既に Event 系（event_tickets_price_non_negative /
-- event_time_slots_capacity_positive / event_registrations_quantity_positive）と
-- space_rate_plans に入っており、**予約・スペース・クーポン・返金・領収書の側だけが
-- 素通し**という非対称な状態だった。Decimal → Int の clean break（20260729140000）でも
-- 値域は追加されていない。
--
-- 各制約はアプリが既に保証している範囲をそのまま写したもので、締め付けは足していない
-- （UI 固有の上限 — 定員 1000、割引値 1000000 など — は DB に持ち込まない。
-- それはドメインの不変条件ではなく入力補助なので、変えたいときに migration を
-- 要求すべきではない）。対応は以下:
--
--   reservations.*        金額はサーバー計算のみ、負値になる経路が無い
--   reservations.taxRate  whole-%（10 = 10%）
--   spaces.capacity       admin space schema: .min(1)
--   spaces.area           admin space schema: .positive()（㎡ × 100 で保持）
--   spaces.discountValue  admin space schema: .min(0) + percentage なら <= 100
--   coupons.discountValue coupon schema: .positive() + PERCENTAGE なら <= 100
--   coupons.usageLimit    coupon schema: .int().positive()
--   coupons.maxDiscountAmount     .positive()
--   coupons.minReservationAmount  .nonnegative()
--   refunds.amount        payment-commands の `1 <= amount <= remaining`
--   receipts の排他       refunds_target_check と同型（両方 NULL は再発行元として正当）
--
-- 既存行の検証は ADD CONSTRAINT が同時に行う（NOT VALID にしない）。違反行があれば
-- migration が落ちるべきで、素通りさせると「制約がある」という誤った保証が残る。
-- 適用前の実測: test DB（reservations 357 / spaces 181 / coupons 5 / receipts 5）と
-- dev DB のいずれも違反 0 件。

-- === 予約 =====================================================================
ALTER TABLE "reservations"
  ADD CONSTRAINT "reservations_money_non_negative_check" CHECK (
    "basePrice" >= 0
    AND "totalPrice" >= 0
    AND "taxAmount" >= 0
    AND "totalPriceWithTax" >= 0
    AND ("couponDiscountAmount" IS NULL OR "couponDiscountAmount" >= 0)
    AND ("durationDiscountAmount" IS NULL OR "durationDiscountAmount" >= 0)
    AND ("spaceDiscountAmount" IS NULL OR "spaceDiscountAmount" >= 0)
  ),
  ADD CONSTRAINT "reservations_tax_rate_range_check" CHECK (
    "taxRate" >= 0 AND "taxRate" <= 100
  );

-- === スペース =================================================================
ALTER TABLE "spaces"
  ADD CONSTRAINT "spaces_hourly_price_non_negative_check" CHECK ("hourlyPrice" >= 0),
  ADD CONSTRAINT "spaces_capacity_positive_check" CHECK ("capacity" >= 1),
  ADD CONSTRAINT "spaces_area_positive_check" CHECK ("area" IS NULL OR "area" > 0),
  ADD CONSTRAINT "spaces_discount_value_range_check" CHECK (
    "discountValue" IS NULL
    OR (
      "discountValue" >= 0
      AND ("discountType" <> 'percentage'::"DiscountType" OR "discountValue" <= 100)
    )
  );

-- === クーポン =================================================================
ALTER TABLE "coupons"
  ADD CONSTRAINT "coupons_discount_value_range_check" CHECK (
    "discountValue" > 0
    AND ("type" <> 'PERCENTAGE'::"CouponType" OR "discountValue" <= 100)
  ),
  ADD CONSTRAINT "coupons_usage_range_check" CHECK (
    "usageCount" >= 0
    AND ("usageLimit" IS NULL OR "usageLimit" >= 1)
  ),
  ADD CONSTRAINT "coupons_amount_bounds_check" CHECK (
    ("maxDiscountAmount" IS NULL OR "maxDiscountAmount" > 0)
    AND ("minReservationAmount" IS NULL OR "minReservationAmount" >= 0)
  );

-- === 返金 =====================================================================
ALTER TABLE "refunds"
  ADD CONSTRAINT "refunds_amount_positive_check" CHECK ("amount" >= 1);

-- === 領収書 ===================================================================
ALTER TABLE "receipts"
  ADD CONSTRAINT "receipts_money_non_negative_check" CHECK (
    "amount" >= 0 AND "taxAmount" >= 0
  ),
  ADD CONSTRAINT "receipts_tax_rate_range_check" CHECK (
    "taxRate" >= 0 AND "taxRate" <= 100
  ),
  -- refunds_target_check と同型。両方 NULL は「再発行元として参照だけ持たない」
  -- 正当な状態なので許可し、両方非 NULL だけを禁じる。
  ADD CONSTRAINT "receipts_target_exclusive_check" CHECK (
    NOT ("reservationId" IS NOT NULL AND "eventRegistrationId" IS NOT NULL)
  );
