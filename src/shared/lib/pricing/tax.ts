/**
 * 税額計算関数
 */

import {
  TaxRateType,
  TaxDisplayMode,
} from "@/shared/lib/validations/enums/prisma-types";
import type { TaxSettings } from "./types";

/**
 * デフォルト税設定
 */
export const DEFAULT_TAX_SETTINGS: TaxSettings = {
  standardRate: 10,
  reducedRate: 8,
  displayModePublic: TaxDisplayMode.TAX_INCLUDED,
};

/**
 * 税率を取得
 */
export function getTaxRate(
  taxRateType: TaxRateType,
  settings: TaxSettings = DEFAULT_TAX_SETTINGS,
): number {
  return taxRateType === TaxRateType.REDUCED
    ? settings.reducedRate
    : settings.standardRate;
}

/**
 * 税込価格を計算（税抜価格から）
 * 四捨五入で端数処理（消費税の一般的な計算方法）
 */
export function calculateTaxIncludedPrice(
  taxExcludedPrice: number,
  taxRate: number,
): number {
  return Math.round(taxExcludedPrice * (1 + taxRate / 100));
}

/**
 * 税抜価格を計算（税込価格から）
 * 四捨五入で端数処理（消費税の一般的な計算方法）
 */
export function calculateTaxExcludedPrice(
  taxIncludedPrice: number,
  taxRate: number,
): number {
  return Math.round(taxIncludedPrice / (1 + taxRate / 100));
}

/**
 * 税額を計算（税抜価格から）
 * 四捨五入で端数処理（消費税の一般的な計算方法）
 */
export function calculateTaxAmount(
  taxExcludedPrice: number,
  taxRate: number,
): number {
  return Math.round(taxExcludedPrice * (taxRate / 100));
}

/**
 * 公開ページの税表示モードに合わせた structured data / 数値価格。
 * DB の税抜 hourlyPrice から UI（SpaceCard 等）と同じ基準の金額を返す。
 */
export function resolvePublicDisplayPrice(
  taxExcludedPrice: number,
  settings: TaxSettings = DEFAULT_TAX_SETTINGS,
): number {
  const taxRate = getTaxRate(TaxRateType.STANDARD, settings);
  switch (settings.displayModePublic) {
    case TaxDisplayMode.TAX_EXCLUDED:
      return taxExcludedPrice;
    case TaxDisplayMode.TAX_INCLUDED:
    case TaxDisplayMode.BOTH:
      return calculateTaxIncludedPrice(taxExcludedPrice, taxRate);
    default: {
      const _exhaustive: never = settings.displayModePublic;
      return _exhaustive;
    }
  }
}
