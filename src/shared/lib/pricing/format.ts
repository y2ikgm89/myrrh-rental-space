/**
 * 料金フォーマット関数
 */

import type { CouponType } from "@/shared/db/enums";
import { DiscountType, TaxDisplayMode, TaxRateType } from "@/shared/db/enums";
import type {
  PriceCalculation,
  PriceFormatOptions,
  TaxPriceDisplayOptions,
} from "./types";
import { calculateTaxIncludedPrice } from "./tax";

/**
 * 割引額をフォーマット（表示用）
 */
export function formatDiscountAmount(type: CouponType, value: number): string {
  if (type === "PERCENTAGE") {
    return `${value}%OFF`;
  }
  return `\u00A5${value.toLocaleString()}OFF`;
}

/**
 * 割引サマリーを生成（表示用）
 */
export function formatDiscountSummary(calculation: PriceCalculation): string[] {
  const summaries: string[] = [];

  if (calculation.appliedSpaceDiscount) {
    const label =
      calculation.appliedSpaceDiscount.type === DiscountType.percentage
        ? `${calculation.appliedSpaceDiscount.value}%OFF`
        : `\u00A5${calculation.appliedSpaceDiscount.value.toLocaleString()}OFF`;
    summaries.push(
      `スペース割引（${label}）: -\u00A5${calculation.spaceDiscount.toLocaleString()}`,
    );
  }

  if (calculation.appliedDurationRule) {
    summaries.push(
      `長時間割引（${calculation.appliedDurationRule.hours}時間以上）: -\u00A5${calculation.durationDiscount.toLocaleString()}`,
    );
  }

  if (calculation.appliedCoupon) {
    const couponLabel = formatDiscountAmount(
      calculation.appliedCoupon.type,
      calculation.appliedCoupon.discountValue,
    );
    summaries.push(
      `クーポン「${calculation.appliedCoupon.code}」${couponLabel}: -\u00A5${calculation.couponDiscount.toLocaleString()}`,
    );
  }

  return summaries;
}

/**
 * 価格をフォーマット
 */
export function formatPrice(
  price: number,
  options: PriceFormatOptions = {},
): string {
  const { showCurrency = true, showTaxLabel = false, taxLabel } = options;
  const formattedPrice = price.toLocaleString("ja-JP");
  let result = showCurrency ? `\u00A5${formattedPrice}` : formattedPrice;
  if (showTaxLabel && taxLabel) {
    result += `（${taxLabel}）`;
  }
  return result;
}

/**
 * 税込/税抜価格をフォーマット
 */
export function formatPriceWithTax(options: TaxPriceDisplayOptions): string {
  const { taxExcludedPrice, taxRate, displayMode } = options;
  const taxIncludedPrice = calculateTaxIncludedPrice(taxExcludedPrice, taxRate);

  switch (displayMode) {
    case TaxDisplayMode.tax_excluded:
      return `\u00A5${taxExcludedPrice.toLocaleString("ja-JP")}（税抜）`;
    case TaxDisplayMode.tax_included:
      return `\u00A5${taxIncludedPrice.toLocaleString("ja-JP")}（税込）`;
    case TaxDisplayMode.both:
      return `\u00A5${taxIncludedPrice.toLocaleString("ja-JP")}（税込）/ \u00A5${taxExcludedPrice.toLocaleString("ja-JP")}（税抜）`;
  }
}

/**
 * 税率ラベルを取得
 */
export function getTaxRateLabel(
  taxRateType: TaxRateType,
  taxRate: number,
): string {
  const typeLabel =
    taxRateType === TaxRateType.reduced ? "軽減税率" : "標準税率";
  return `${typeLabel}（${taxRate}%）`;
}
