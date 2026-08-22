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
    durationOverride === DurationDiscountOverride.INHERIT
      ? reservationSettings.durationDiscountEnabled
      : durationOverride === DurationDiscountOverride.ENABLED;

  const durationRules = parseDurationDiscountRules(
    reservationSettings.durationDiscountRules,
  );

  /** 長時間割引・クーポンの双方が基準にする価格（スペース固有割引は常に適用）。 */
  const priceAfterSpaceDiscount = basePrice - finalSpaceDiscount;

  if (effectiveDurationEnabled && durationRules.length > 0) {
    // スペース割引適用後の価格に対して長時間割引を計算
    const result = calculateDurationDiscount(
      priceAfterSpaceDiscount,
      totalHours,
      durationRules,
    );
    durationDiscount = result.discount;
    appliedDurationRule = result.appliedRule;
  }

  // クーポン割引
  //
  // **2 通り計算する。** 長時間割引と「どちらが得か」を比べる（BEST）／長時間割引を
  // 捨ててクーポンだけを適用する（BOTH かつ併用不可）ときに要るのは
  // **クーポン単体の割引額**であって、長時間割引を引いた後の額ではない。
  // 単一の値だけを持つと、比較も適用も長時間割引のぶんだけ目減りしたクーポン額で
  // 行われ、「最もお得な割引のみ適用」も「クーポンを優先」も成立しなくなる。
  //
  //   couponAlone   … スペース割引後の価格に対する額（クーポン単体の実力）
  //   couponStacked … さらに長時間割引を引いた価格に対する額（併用時だけ使う）
  const couponAlone = coupon
    ? calculateCouponDiscount(priceAfterSpaceDiscount, coupon)
    : 0;
  const couponStacked = coupon
    ? calculateCouponDiscount(
        priceAfterSpaceDiscount - durationDiscount,
        coupon,
      )
    : 0;

  let appliedCoupon: PriceCalculation["appliedCoupon"] = coupon
    ? {
        id: coupon.id,
        code: coupon.code,
        name: coupon.name,
        type: coupon.type,
        discountValue: coupon.discountValue,
      }
    : null;

  // 併用モードに応じた最終価格計算
  // 注: スペース固有割引は常に適用（併用モードの対象外）
  let finalDurationDiscount = durationDiscount;
  let finalCouponDiscount = couponAlone;

  const combinationMode = reservationSettings.discountCombinationMode;

  if (coupon && durationDiscount > 0 && couponAlone > 0) {
    if (combinationMode === DiscountCombinationMode.BEST) {
      // 最もお得な割引のみ適用（長時間割引 vs クーポン割引）。
      // 比較は同じ基準価格（スペース割引後）に対する額どうしで行う。
      if (durationDiscount >= couponAlone) {
        finalCouponDiscount = 0;
        appliedCoupon = null;
      } else {
        finalDurationDiscount = 0;
        appliedDurationRule = null;
      }

      if (showWarning) {
        warnings.push("より大きな割引が自動的に適用されました");
      }
    } else if (!coupon.canCombineWithDurationDiscount) {
      // クーポンが併用不可の場合、クーポンを優先（額はクーポン単体のまま）
      finalDurationDiscount = 0;
      appliedDurationRule = null;

      if (showWarning) {
        warnings.push("このクーポンは他の割引と併用できません");
      }
    } else {
      // 両方適用。クーポンは長時間割引後の価格に重ねる（割引の二重取りを避ける）
      finalCouponDiscount = couponStacked;

      if (showWarning && finalCouponDiscount > 0) {
        warnings.push("長時間割引とクーポン割引が両方適用されています");
      }
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
