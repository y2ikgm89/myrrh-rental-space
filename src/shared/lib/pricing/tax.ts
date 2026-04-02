/**
 * 税額計算関数
 */

import { TaxRateType, TaxDisplayMode, TaxInputMode } from "@generated/prisma/enums";
import type { TaxSettings } from "./types";

/**
 * デフォルト税設定
 */
export const DEFAULT_TAX_SETTINGS: TaxSettings = {
  standardRate: 10,
  reducedRate: 8,
  displayModeAdmin: TaxDisplayMode.both,
  displayModePublic: TaxDisplayMode.tax_included,
  inputMode: TaxInputMode.tax_excluded,
};

/**
 * 税率を取得
 */
export function getTaxRate(
  taxRateType: TaxRateType,
  settings: TaxSettings = DEFAULT_TAX_SETTINGS,
): number {
  return taxRateType === TaxRateType.reduced
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
