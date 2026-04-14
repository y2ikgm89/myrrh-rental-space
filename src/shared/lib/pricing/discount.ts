/**
 * 割引計算関数
 *
 * スペース固有割引・長時間割引・クーポン割引の計算
 */

import { DiscountType } from "@/shared/lib/validations/enums/prisma-types";
import type {
  CouponLike,
  DurationDiscountRule,
  SpaceDiscountSettings,
} from "./types";

/**
 * スペース固有割引を計算
 *
 * スペースに設定された固定割引を計算
 * - percentage: 基本料金の指定%を割引
 * - fixed: 固定額を割引
 */
export function calculateSpaceDiscount(
  basePrice: number,
  settings: SpaceDiscountSettings | null | undefined,
): { discount: number; applied: { type: DiscountType; value: number } | null } {
  if (
    !settings ||
    settings.discountType === DiscountType.none ||
    settings.discountValue == null
  ) {
    return { discount: 0, applied: null };
  }

  const discountValue = settings.discountValue;

  if (settings.discountType === DiscountType.percentage) {
    const discount = Math.floor(basePrice * (discountValue / 100));
    return {
      discount,
      applied: { type: DiscountType.percentage, value: discountValue },
    };
  }

  // fixed
  const discount = Math.min(discountValue, basePrice); // 割引額が価格を超えないように
  return {
    discount,
    applied: { type: DiscountType.fixed, value: discountValue },
  };
}

/**
 * 長時間割引を計算
 *
 * ルールは時間の降順でソートされ、最初にマッチしたルールが適用される
 * 例: 6時間以上で20%、4時間以上で10%の場合、5時間の予約は10%割引
 */
export function calculateDurationDiscount(
  basePrice: number,
  hours: number,
  rules: DurationDiscountRule[],
): { discount: number; appliedRule: DurationDiscountRule | null } {
  if (rules.length === 0 || hours <= 0 || basePrice <= 0) {
    return { discount: 0, appliedRule: null };
  }

  // 時間の降順でソート（より長い時間のルールを優先）
  const sortedRules = [...rules].sort((a, b) => b.hours - a.hours);

  // 最初にマッチしたルールを適用
  for (const rule of sortedRules) {
    if (hours >= rule.hours && rule.discountRate > 0) {
      const discount = Math.floor(basePrice * (rule.discountRate / 100));
      return { discount, appliedRule: rule };
    }
  }

  return { discount: 0, appliedRule: null };
}

/**
 * クーポン割引を計算
 *
 * - パーセント割引: 基本料金の指定%を割引（最大割引額制限あり）
 * - 定額割引: 固定額を割引
 */
export function calculateCouponDiscount(
  price: number,
  coupon: Pick<CouponLike, "type" | "discountValue" | "maxDiscountAmount">,
): number {
  if (price <= 0) return 0;

  const discountValue = coupon.discountValue;

  if (coupon.type === "PERCENTAGE") {
    let discount = Math.floor(price * (discountValue / 100));
    // 最大割引額の制限
    if (coupon.maxDiscountAmount) {
      discount = Math.min(discount, coupon.maxDiscountAmount);
    }
    return discount;
  }

  // FIXED_AMOUNT
  return Math.min(discountValue, price); // 割引額が価格を超えないように
}

/**
 * 長時間割引ルールを検証
 */
export function validateDurationDiscountRules(rules: unknown): {
  valid: boolean;
  rules: DurationDiscountRule[];
  error?: string;
} {
  if (!Array.isArray(rules)) {
    return {
      valid: false,
      rules: [],
      error: "割引ルールは配列である必要があります",
    };
  }

  const validRules: DurationDiscountRule[] = [];

  for (const rule of rules) {
    if (
      typeof rule !== "object" ||
      rule === null ||
      typeof rule.hours !== "number" ||
      typeof rule.discountRate !== "number"
    ) {
      return {
        valid: false,
        rules: [],
        error: "各ルールは hours と discountRate を持つ必要があります",
      };
    }

    if (rule.hours <= 0) {
      return {
        valid: false,
        rules: [],
        error: "時間は0より大きい必要があります",
      };
    }

    if (rule.discountRate < 0 || rule.discountRate > 100) {
      return {
        valid: false,
        rules: [],
        error: "割引率は0〜100の範囲で指定してください",
      };
    }

    validRules.push({
      hours: rule.hours,
      discountRate: rule.discountRate,
    });
  }

  return { valid: true, rules: validRules };
}

/**
 * JSON から長時間割引ルールをパース
 */
export function parseDurationDiscountRules(
  json: unknown,
): DurationDiscountRule[] {
  const result = validateDurationDiscountRules(json);
  return result.valid ? result.rules : [];
}
