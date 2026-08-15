"use client";

import { useTaxSettings } from "@/public/contexts/tax-settings";
import {
  formatPriceWithTax,
  formatUnitPriceWithTax,
  formatPrice,
} from "@/shared/lib/pricing/format";
import { getTaxRate } from "@/shared/lib/pricing/tax";
import type { TaxRateType } from "@/shared/lib/validations/enums/prisma-types";

/**
 * 公開ページ用の税設定対応料金フォーマットフック
 *
 * TaxSettingsProvider 配下で使用。
 * Settings の taxDisplayModePublic に従って自動的に税込/税抜表示を切り替える。
 * 税率は呼び出しごとに `space.taxRateType`（または予約に焼いた taxRateType）を渡す。
 */
export function useFormatPrice() {
  const tax = useTaxSettings();
  const taxSettings = {
    standardRate: tax.standardRate,
    reducedRate: tax.reducedRate,
    displayModePublic: tax.displayMode,
  };

  /** 合計金額のフォーマット（税抜価格を渡す） */
  function formatTotal(
    taxExcludedPrice: number | null | undefined,
    taxRateType: TaxRateType,
    fallback = "要問合せ",
  ): string {
    if (taxExcludedPrice == null) return fallback;
    return formatPriceWithTax({
      taxExcludedPrice,
      taxRate: getTaxRate(taxRateType, taxSettings),
      displayMode: tax.displayMode,
    });
  }

  /** 単価のフォーマット（/h, /day 等のサフィックス付き） */
  function formatUnit(
    taxExcludedPrice: number | null | undefined,
    unit: string,
    taxRateType: TaxRateType,
    fallback = "要問合せ",
  ): string {
    if (taxExcludedPrice == null) return fallback;
    return formatUnitPriceWithTax(
      taxExcludedPrice,
      getTaxRate(taxRateType, taxSettings),
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
    displayMode: tax.displayMode,
  };
}
