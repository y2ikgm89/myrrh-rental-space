/**
 * 予約料金計算（メイン統合関数）
 *
 * 計算順序:
 * 1. 基本料金 = 呼出元（rate-plan-resolver）が計算した basePrice をそのまま使う
 *    （hourlyPrice × hours の二重計算はしない）
 * 2. スペース固有割引を計算（basePriceから）
 * 3. 長時間割引を計算（durationDiscountOverride考慮）
 * 4. クーポン割引を計算
 * 5. 併用モードに応じて最終価格を決定
 */

import {
  DurationDiscountOverride,
  DiscountCombinationMode,
} from "@/shared/lib/validations/enums/prisma-types";
import type {
  DurationDiscountRule,
  PriceCalculation,
  PriceCalculationParams,
} from "./types";
import {
  calculateSpaceDiscount,
  calculateDurationDiscount,
  calculateCouponDiscount,
  parseDurationDiscountRules,
} from "./discount";

/**
 * 予約料金を計算（メイン関数）
 */
export function calculateReservationPrice(
  params: PriceCalculationParams,
): PriceCalculation {
  const {
    basePrice,
    totalHours,
    space,
    reservationSettings,
    coupon,
    showWarning = true,
  } = params;

  const warnings: string[] = [];

  // スペース固有割引
  const spaceDiscountResult = calculateSpaceDiscount(basePrice, space);
  const finalSpaceDiscount = spaceDiscountResult.discount;
  const appliedSpaceDiscount = spaceDiscountResult.applied;

  // 長時間割引（オーバーライド設定を考慮）
  let durationDiscount = 0;
  let appliedDurationRule: DurationDiscountRule | null = null;

  // オーバーライド設定を判定
  const durationOverride = space.durationDiscountOverride;
  const effectiveDurationEnabled =
    durationOverride === DurationDiscountOverride.inherit
      ? reservationSettings.durationDiscountEnabled
      : durationOverride === DurationDiscountOverride.enabled;

  const durationRules = parseDurationDiscountRules(
    reservationSettings.durationDiscountRules,
  );

  if (effectiveDurationEnabled && durationRules.length > 0) {
    // スペース割引適用後の価格に対して長時間割引を計算
    const priceAfterSpaceDiscount = basePrice - finalSpaceDiscount;
    const result = calculateDurationDiscount(
      priceAfterSpaceDiscount,
      totalHours,
      durationRules,
    );
    durationDiscount = result.discount;
    appliedDurationRule = result.appliedRule;
  }

  // クーポン割引
  let couponDiscount = 0;
  let appliedCoupon: PriceCalculation["appliedCoupon"] = null;

  if (coupon) {
    // スペース割引・長時間割引適用後の価格に対してクーポン割引を計算
    const priceAfterPriorDiscounts =
      basePrice - finalSpaceDiscount - durationDiscount;
    couponDiscount = calculateCouponDiscount(priceAfterPriorDiscounts, coupon);
    appliedCoupon = {
      id: coupon.id,
      code: coupon.code,
      name: coupon.name,
      type: coupon.type,
      discountValue: coupon.discountValue,
    };
  }

  // 併用モードに応じた最終価格計算
  // 注: スペース固有割引は常に適用（併用モードの対象外）
  let finalDurationDiscount = durationDiscount;
  let finalCouponDiscount = couponDiscount;

  const combinationMode = reservationSettings.discountCombinationMode;

  if (
    combinationMode === DiscountCombinationMode.best &&
    durationDiscount > 0 &&
    couponDiscount > 0
  ) {
    // 最もお得な割引のみ適用（長時間割引 vs クーポン割引）
    if (durationDiscount >= couponDiscount) {
      finalCouponDiscount = 0;
      appliedCoupon = null;
    } else {
      finalDurationDiscount = 0;
      appliedDurationRule = null;
    }

    if (showWarning) {
      warnings.push("より大きな割引が自動的に適用されました");
    }
  } else if (
    combinationMode === DiscountCombinationMode.both &&
    durationDiscount > 0 &&
    couponDiscount > 0
  ) {
    // 両方適用（クーポンの併用設定を確認）
    if (coupon && !coupon.canCombineWithDurationDiscount) {
      // クーポンが併用不可の場合、クーポンを優先
      finalDurationDiscount = 0;
      appliedDurationRule = null;

      if (showWarning) {
        warnings.push("このクーポンは他の割引と併用できません");
      }
    } else if (
      showWarning &&
      finalDurationDiscount > 0 &&
      finalCouponDiscount > 0
    ) {
      warnings.push("長時間割引とクーポン割引が両方適用されています");
    }
  }

  const totalDiscount =
    finalSpaceDiscount + finalDurationDiscount + finalCouponDiscount;
  const totalPrice = Math.max(0, basePrice - totalDiscount); // マイナスにならないように
  const totalDiscountRate =
    basePrice > 0 ? Math.round((totalDiscount / basePrice) * 100) : 0;

  return {
    basePrice,
    spaceDiscount: finalSpaceDiscount,
    durationDiscount: finalDurationDiscount,
    couponDiscount: finalCouponDiscount,
    totalPrice,
    totalDiscountRate,
    appliedSpaceDiscount,
    appliedDurationRule,
    appliedCoupon,
    warnings,
  };
}
