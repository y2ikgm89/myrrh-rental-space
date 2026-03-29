/**
 * 料金フォーマット関数（統一エントリポイント）
 *
 * 全ての料金表示はこのモジュールの関数を使用する。
 * utils.ts / price-format.ts の formatPrice は廃止。
 */

import type { CouponType } from "@/shared/db/enums";
import { DiscountType, TaxDisplayMode, TaxRateType } from "@/shared/db/enums";
import type { PriceCalculation, TaxPriceDisplayOptions } from "./types";
import { calculateTaxIncludedPrice } from "./tax";

// ---------------------------------------------------------------------------
// Base formatters
// ---------------------------------------------------------------------------

/** 日本円の通貨フォーマット */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
  }).format(value);
}

/** 価格フォーマット（null/undefined 対応） */
export function formatPrice(
  value: number | null | undefined,
  fallback = "要問合せ",
): string {
  if (value === null || value === undefined) return fallback;
  return formatCurrency(value);
}

// ---------------------------------------------------------------------------
// Tax-aware formatters
// ---------------------------------------------------------------------------

/** 税込/税抜価格をフォーマット（TaxDisplayMode に応じて表示切替） */
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

/** 単価を税表示モード付きでフォーマット（/h, /day 等のサフィックス対応） */
export function formatUnitPriceWithTax(
  taxExcludedPrice: number,
  taxRate: number,
  displayMode: TaxDisplayMode,
  unit: string,
): string {
  const taxIncludedPrice = calculateTaxIncludedPrice(taxExcludedPrice, taxRate);

  switch (displayMode) {
    case TaxDisplayMode.tax_excluded:
      return `\u00A5${taxExcludedPrice.toLocaleString("ja-JP")}${unit}（税抜）`;
    case TaxDisplayMode.tax_included:
      return `\u00A5${taxIncludedPrice.toLocaleString("ja-JP")}${unit}（税込）`;
    case TaxDisplayMode.both:
      return `\u00A5${taxIncludedPrice.toLocaleString("ja-JP")}${unit}（税込）`;
  }
}

/** 税率ラベルを取得 */
export function getTaxRateLabel(
  taxRateType: TaxRateType,
  taxRate: number,
): string {
  const typeLabel =
    taxRateType === TaxRateType.reduced ? "軽減税率" : "標準税率";
  return `${typeLabel}（${taxRate}%）`;
}

// ---------------------------------------------------------------------------
// Discount formatters
// ---------------------------------------------------------------------------

/** 割引額をフォーマット（表示用） */
export function formatDiscountAmount(type: CouponType, value: number): string {
  if (type === "PERCENTAGE") {
    return `${value}%OFF`;
  }
  return `\u00A5${value.toLocaleString()}OFF`;
}

/** 割引サマリーを生成（表示用） */
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
