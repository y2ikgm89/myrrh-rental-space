/**
 * 料金フォーマット関数（統一エントリポイント）
 *
 * 全ての料金表示はこのモジュールの関数を使用する。
 * utils.ts / price-format.ts の formatPrice は廃止。
 */

import {
  CouponType,
  DiscountType,
  TaxDisplayMode,
  TaxRateType,
} from "@/shared/lib/validations/enums/prisma-types";
import type { PriceCalculation, TaxPriceDisplayOptions } from "./types";
import { calculateTaxIncludedPrice } from "./tax";

// ---------------------------------------------------------------------------
// Base formatters
// ---------------------------------------------------------------------------

/** 日本円の通貨フォーマット */
export function formatCurrency(value: number): string {
  const formatted = new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
  }).format(value);
  // Intl.NumberFormat は全幅yen（￥）を返すため、半幅に統一（U+00A5）
  return formatted.replace("￥", "¥");
}

/** 価格フォーマット（null/undefined 対応） */
export function formatPrice(
  value: number | null | undefined,
  fallback = "要問合せ",
): string {
  if (value === null || value === undefined) return fallback;
  return formatCurrency(value);
}

/** 予約一覧の合計。永続化された税込額だけを描く。再課税しない（監査 F-104）。 */
export function formatReservationListTotal(
  totalPriceWithTax: number | null,
  fallback = "未定",
): string {
  return formatPrice(totalPriceWithTax, fallback);
}

// ---------------------------------------------------------------------------
// Tax-aware formatters
// ---------------------------------------------------------------------------

/** 税込/税抜価格をフォーマット（TaxDisplayMode に応じて表示切替） */
export function formatPriceWithTax(options: TaxPriceDisplayOptions): string {
  const { taxExcludedPrice, taxRate, displayMode } = options;
  const taxIncludedPrice = calculateTaxIncludedPrice(taxExcludedPrice, taxRate);

  switch (displayMode) {
    case TaxDisplayMode.TAX_EXCLUDED:
      return `${formatCurrency(taxExcludedPrice)}（税抜）`;
    case TaxDisplayMode.TAX_INCLUDED:
      return `${formatCurrency(taxIncludedPrice)}（税込）`;
    case TaxDisplayMode.BOTH:
      return `${formatCurrency(taxIncludedPrice)}（税込）/ ${formatCurrency(taxExcludedPrice)}（税抜）`;
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
    case TaxDisplayMode.TAX_EXCLUDED:
      return `${formatCurrency(taxExcludedPrice)}${unit}（税抜）`;
    case TaxDisplayMode.TAX_INCLUDED:
      return `${formatCurrency(taxIncludedPrice)}${unit}（税込）`;
    case TaxDisplayMode.BOTH:
      return `${formatCurrency(taxIncludedPrice)}${unit}（税込）`;
  }
}

/** 税率ラベルを取得 */
export function getTaxRateLabel(
  taxRateType: TaxRateType,
  taxRate: number,
): string {
  switch (taxRateType) {
    case TaxRateType.STANDARD:
      return `標準税率（${taxRate}%）`;
    case TaxRateType.REDUCED:
      return `軽減税率（${taxRate}%）`;
    default: {
      const _exhaustive: never = taxRateType;
      return _exhaustive;
    }
  }
}

// ---------------------------------------------------------------------------
// Discount formatters
// ---------------------------------------------------------------------------

/** 割引額をフォーマット（表示用） */
export function formatDiscountAmount(type: CouponType, value: number): string {
  if (type === CouponType.PERCENTAGE) {
    return `${value}%OFF`;
  }
  return `${formatCurrency(value)}OFF`;
}

/** 割引サマリーを生成（表示用） */
export function formatDiscountSummary(calculation: PriceCalculation): string[] {
  const summaries: string[] = [];

  if (calculation.appliedSpaceDiscount) {
    const label =
      calculation.appliedSpaceDiscount.type === DiscountType.PERCENTAGE
        ? `${calculation.appliedSpaceDiscount.value}%OFF`
        : `${formatCurrency(calculation.appliedSpaceDiscount.value)}OFF`;
    summaries.push(
      `スペース割引（${label}）: -${formatCurrency(calculation.spaceDiscount)}`,
    );
  }

  if (calculation.appliedDurationRule) {
    summaries.push(
      `長時間割引（${calculation.appliedDurationRule.hours}時間以上）: -${formatCurrency(calculation.durationDiscount)}`,
    );
  }

  if (calculation.appliedCoupon) {
    const couponLabel = formatDiscountAmount(
      calculation.appliedCoupon.type,
      calculation.appliedCoupon.discountValue,
    );
    summaries.push(
      `クーポン「${calculation.appliedCoupon.code}」${couponLabel}: -${formatCurrency(calculation.couponDiscount)}`,
    );
  }

  return summaries;
}
