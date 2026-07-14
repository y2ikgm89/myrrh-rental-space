/**
 * 予約料金の統合計算 entry point（純粋関数）
 *
 * rate plan 適用後の基本料金決定（rate-plan-resolver）→ 割引計算（reservation.ts）→
 * 税計算（tax.ts）までを一気通貫で行う SSoT。3 つの予約コマンド経路
 * （admin-commands / public-commands / customer-commands）と 3 つのフォーム
 * プレビュー（管理画面 2 箇所 + 公開予約フォーム）が最終的にこの関数を共通で呼び出す
 * （呼出元の置き換えは Task 8 / Task 13 で行う）。
 *
 * I/O・Prisma 依存なしの純粋関数（server-only 不要）。
 */

import {
  resolveRateBreakdown,
  type SpaceRatePlanForResolver,
} from "./rate-plan-resolver";
import { calculateReservationPrice } from "./reservation";
import { getTaxRate, calculateTaxAmount } from "./tax";
import type { RateBreakdown } from "./rate-breakdown";
import type { CouponLike } from "./types";
import type {
  DiscountCombinationMode,
  DiscountType,
  DurationDiscountOverride,
  TaxDisplayMode,
  TaxRateType,
} from "@/shared/lib/validations/enums/prisma-types";

export type ReservationPricingInput = {
  startDateTime: Date;
  endDateTime: Date;
  space: {
    hourlyPrice: number;
    discountType: DiscountType;
    discountValue: number | null;
    durationDiscountOverride: DurationDiscountOverride;
    taxRateType: TaxRateType;
  };
  ratePlans: SpaceRatePlanForResolver[];
  /**
   * Settings の該当スライス。field 名は Prisma Settings モデルの列名と一致させる
   * （taxStandardRate / taxReducedRate / taxDisplayModePublic 等）。
   */
  reservationSettings: {
    taxStandardRate: number;
    taxReducedRate: number;
    taxDisplayModePublic: TaxDisplayMode;
    durationDiscountEnabled: boolean;
    durationDiscountRules: unknown;
    discountCombinationMode: DiscountCombinationMode;
    showOriginalPrice: boolean;
  };
  coupon: CouponLike | null;
  holidayJudge: (jstDateOnly: string) => boolean;
};

export type ReservationPricingResult = {
  rateBreakdown: RateBreakdown;
  basePrice: number;
  spaceDiscountAmount: number;
  durationDiscountAmount: number;
  couponDiscountAmount: number;
  totalPrice: number;
  taxRateType: TaxRateType;
  taxRate: number;
  taxAmount: number;
  totalPriceWithTax: number;
};

export function calculateReservationPricing(
  input: ReservationPricingInput,
): ReservationPricingResult {
  const rateBreakdown = resolveRateBreakdown({
    ratePlans: input.ratePlans,
    spaceHourlyPrice: input.space.hourlyPrice,
    startDateTime: input.startDateTime,
    endDateTime: input.endDateTime,
    holidayJudge: input.holidayJudge,
  });

  const basePrice = rateBreakdown.totalBasePrice;
  const totalHours = rateBreakdown.totalHours;

  // 既存 calculateReservationPrice を basePrice 直接受け取り形で呼ぶ。
  // reservationSettings はそのまま渡す（PriceCalculationSettings が必要とする
  // durationDiscountEnabled / durationDiscountRules / discountCombinationMode の
  // 3 フィールドのみを内部で読み、tax 系の余剰フィールドは無視される）。
  const pricing = calculateReservationPrice({
    basePrice,
    totalHours,
    space: {
      discountType: input.space.discountType,
      discountValue: input.space.discountValue,
      durationDiscountOverride: input.space.durationDiscountOverride,
    },
    reservationSettings: input.reservationSettings,
    coupon: input.coupon,
  });

  // getTaxRate は TaxSettings 形状（standardRate/reducedRate/displayModePublic）を
  // 要求する。Settings の実列名（taxStandardRate 等）とは命名が異なるため、
  // ここで明示的にマッピングする。
  const taxRate = getTaxRate(input.space.taxRateType, {
    standardRate: input.reservationSettings.taxStandardRate,
    reducedRate: input.reservationSettings.taxReducedRate,
    displayModePublic: input.reservationSettings.taxDisplayModePublic,
  });
  const taxAmount = calculateTaxAmount(pricing.totalPrice, taxRate);
  const totalPriceWithTax = pricing.totalPrice + taxAmount;

  return {
    rateBreakdown,
    basePrice,
    spaceDiscountAmount: pricing.spaceDiscount,
    durationDiscountAmount: pricing.durationDiscount,
    couponDiscountAmount: pricing.couponDiscount,
    totalPrice: pricing.totalPrice,
    taxRateType: input.space.taxRateType,
    taxRate,
    taxAmount,
    totalPriceWithTax,
  };
}
