"use client";

import { useTaxSettings } from "@/public/contexts/tax-settings";
import {
  formatPriceWithTax,
  formatUnitPriceWithTax,
  formatPrice,
} from "@/shared/lib/pricing/format";
import { getTaxRate } from "@/shared/lib/pricing/tax";
import { TaxRateType } from "@/shared/db/enums";

/**
 * 公開ページ用の税設定対応料金フォーマットフック
 *
 * TaxSettingsProvider 配下で使用。
 * Settings の taxDisplayModePublic に従って自動的に税込/税抜表示を切り替える。
 */
export function useFormatPrice() {
  const tax = useTaxSettings();
  const taxRate = getTaxRate(TaxRateType.standard, {
    standardRate: tax.standardRate,
    reducedRate: tax.reducedRate,
    displayModeAdmin: tax.displayMode,
    displayModePublic: tax.displayMode,
    inputMode: "tax_excluded",
  });

  /** 合計金額のフォーマット（税抜価格を渡す） */
  function formatTotal(
    taxExcludedPrice: number | null | undefined,
    fallback = "要問合せ",
  ): string {
    if (taxExcludedPrice == null) return fallback;
    return formatPriceWithTax({
      taxExcludedPrice,
      taxRate,
      displayMode: tax.displayMode,
    });
  }

  /** 単価のフォーマット（/h, /day 等のサフィックス付き） */
  function formatUnit(
    taxExcludedPrice: number | null | undefined,
    unit: string,
    fallback = "要問合せ",
  ): string {
    if (taxExcludedPrice == null) return fallback;
    return formatUnitPriceWithTax(
      taxExcludedPrice,
      taxRate,
      tax.displayMode,
      unit,
    );
  }

  /** 税設定なしの素のフォーマット（割引額表示など） */
  function formatRaw(
    value: number | null | undefined,
    fallback = "要問合せ",
  ): string {
    return formatPrice(value, fallback);
  }

  return {
    formatTotal,
    formatUnit,
    formatRaw,
    taxRate,
    displayMode: tax.displayMode,
  };
}
