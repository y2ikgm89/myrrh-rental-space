/**
 * pricing 税計算・書式設定ユニットテスト
 *
 * src/shared/lib/pricing.ts の税計算・表示関連関数テスト
 * （割引計算の基本テストは __tests__/unit/lib/pricing.test.ts に存在するため、
 *  税計算・フォーマット関数を重点的にカバーする）
 */

import { describe, test, expect } from "bun:test";
import {
  getTaxRate,
  calculateTaxIncludedPrice,
  calculateTaxExcludedPrice,
  calculateTaxAmount,
  DEFAULT_TAX_SETTINGS,
} from "@/shared/lib/pricing/tax";
import {
  formatPrice,
  formatPriceWithTax,
  getTaxRateLabel,
  formatDiscountAmount,
} from "@/shared/lib/pricing/format";
import {
  validateDurationDiscountRules,
  parseDurationDiscountRules,
} from "@/shared/lib/pricing/discount";
import type {
  TaxSettings,
  DurationDiscountRule,
} from "@/shared/lib/pricing/types";

// TaxRateType / TaxDisplayMode / TaxInputMode は @generated/prisma/enums から re-export
// テスト内では文字列リテラルを使用する
const TAX_RATE_TYPE = {
  standard: "standard",
  reduced: "reduced",
} as const;

const TAX_DISPLAY_MODE = {
  tax_excluded: "tax_excluded",
  tax_included: "tax_included",
  both: "both",
} as const;

// =============================================================================
// DEFAULT_TAX_SETTINGS
// =============================================================================

describe("DEFAULT_TAX_SETTINGS", () => {
  test("標準税率が 10% である", () => {
    expect(DEFAULT_TAX_SETTINGS.standardRate).toBe(10);
  });

  test("軽減税率が 8% である", () => {
    expect(DEFAULT_TAX_SETTINGS.reducedRate).toBe(8);
  });
});

// =============================================================================
// getTaxRate
// =============================================================================

describe("getTaxRate", () => {
  describe("正常系", () => {
    test("standard タイプで標準税率を返す", () => {
      const rate = getTaxRate(TAX_RATE_TYPE.standard);
      expect(rate).toBe(10);
    });

    test("reduced タイプで軽減税率を返す", () => {
      const rate = getTaxRate(TAX_RATE_TYPE.reduced);
      expect(rate).toBe(8);
    });

    test("カスタム税設定が反映される", () => {
      const customSettings: TaxSettings = {
        ...DEFAULT_TAX_SETTINGS,
        standardRate: 15,
        reducedRate: 5,
      };
      expect(getTaxRate(TAX_RATE_TYPE.standard, customSettings)).toBe(15);
      expect(getTaxRate(TAX_RATE_TYPE.reduced, customSettings)).toBe(5);
    });

    test("設定省略時はデフォルト設定が使用される", () => {
      expect(getTaxRate(TAX_RATE_TYPE.standard)).toBe(
        DEFAULT_TAX_SETTINGS.standardRate,
      );
    });
  });
});

// =============================================================================
// calculateTaxIncludedPrice
// =============================================================================

describe("calculateTaxIncludedPrice", () => {
  describe("正常系", () => {
    test("1000円・税率10%で1100円を返す", () => {
      expect(calculateTaxIncludedPrice(1000, 10)).toBe(1100);
    });

    test("1000円・税率8%で1080円を返す", () => {
      expect(calculateTaxIncludedPrice(1000, 8)).toBe(1080);
    });

    test("端数が四捨五入される", () => {
      // 1001 * 1.1 = 1101.1 → round = 1101
      expect(calculateTaxIncludedPrice(1001, 10)).toBe(1101);
      // 999 * 1.08 = 1078.92 → round = 1079
      expect(calculateTaxIncludedPrice(999, 8)).toBe(1079);
    });

    test("0円の場合は0円を返す", () => {
      expect(calculateTaxIncludedPrice(0, 10)).toBe(0);
    });

    test("税率0%の場合は価格が変わらない", () => {
      expect(calculateTaxIncludedPrice(5000, 0)).toBe(5000);
    });

    test("大きな金額でも正確に計算できる", () => {
      // 100000 * 1.1 = 110000
      expect(calculateTaxIncludedPrice(100000, 10)).toBe(110000);
    });
  });
});

// =============================================================================
// calculateTaxExcludedPrice
// =============================================================================

describe("calculateTaxExcludedPrice", () => {
  describe("正常系", () => {
    test("1100円・税率10%で1000円を返す", () => {
      expect(calculateTaxExcludedPrice(1100, 10)).toBe(1000);
    });

    test("1080円・税率8%で1000円を返す", () => {
      expect(calculateTaxExcludedPrice(1080, 8)).toBe(1000);
    });

    test("端数が四捨五入される", () => {
      // 1101 / 1.1 = 1000.909... → round = 1001
      expect(calculateTaxExcludedPrice(1101, 10)).toBe(1001);
    });

    test("0円の場合は0円を返す", () => {
      expect(calculateTaxExcludedPrice(0, 10)).toBe(0);
    });

    test("税率0%の場合は価格が変わらない", () => {
      expect(calculateTaxExcludedPrice(5000, 0)).toBe(5000);
    });
  });

  describe("エッジケース", () => {
    test("calculateTaxIncludedPrice の逆演算で元の値に近い値になる", () => {
      const original = 3000;
      const withTax = calculateTaxIncludedPrice(original, 10);
      const recovered = calculateTaxExcludedPrice(withTax, 10);
      // 四捨五入誤差で ±1 の範囲に収まる
      expect(Math.abs(recovered - original)).toBeLessThanOrEqual(1);
    });
  });
});

// =============================================================================
// calculateTaxAmount
// =============================================================================

describe("calculateTaxAmount", () => {
  describe("正常系", () => {
    test("1000円・税率10%で100円の税額を返す", () => {
      expect(calculateTaxAmount(1000, 10)).toBe(100);
    });

    test("1000円・税率8%で80円の税額を返す", () => {
      expect(calculateTaxAmount(1000, 8)).toBe(80);
    });

    test("端数が四捨五入される", () => {
      // 333 * 10/100 = 33.3 → round = 33
      expect(calculateTaxAmount(333, 10)).toBe(33);
      // 334 * 10/100 = 33.4 → round = 33
      expect(calculateTaxAmount(334, 10)).toBe(33);
      // 335 * 10/100 = 33.5 → round = 34
      expect(calculateTaxAmount(335, 10)).toBe(34);
    });

    test("0円の場合は0円の税額を返す", () => {
      expect(calculateTaxAmount(0, 10)).toBe(0);
    });

    test("税率0%の場合は税額0円を返す", () => {
      expect(calculateTaxAmount(5000, 0)).toBe(0);
    });

    test("税額 = 税込価格 - 税抜価格 の関係が成立する", () => {
      const taxExcluded = 1000;
      const taxRate = 10;
      const taxAmount = calculateTaxAmount(taxExcluded, taxRate);
      const taxIncluded = calculateTaxIncludedPrice(taxExcluded, taxRate);
      // 四捨五入誤差で ±1 の範囲に収まる
      expect(
        Math.abs(taxIncluded - taxExcluded - taxAmount),
      ).toBeLessThanOrEqual(1);
    });
  });
});

// =============================================================================
// formatPrice
// =============================================================================

describe("formatPrice", () => {
  describe("正常系", () => {
    test("デフォルトオプションで通貨記号付き価格を返す", () => {
      const result = formatPrice(1000);
      expect(result).toBe("¥1,000");
    });

    test("カンマ区切りで大きな数値をフォーマットする", () => {
      const result = formatPrice(1234567);
      expect(result).toBe("¥1,234,567");
    });

    test("null にカスタムフォールバックを指定できる", () => {
      const result = formatPrice(null, "未設定");
      expect(result).toBe("未設定");
    });

    test("0円を正しくフォーマットする", () => {
      const result = formatPrice(0);
      expect(result).toBe("¥0");
    });
  });
});

// =============================================================================
// formatPriceWithTax
// =============================================================================

describe("formatPriceWithTax", () => {
  describe("tax_excluded モード", () => {
    test("税抜表示で 'XX（税抜）' 形式を返す", () => {
      const result = formatPriceWithTax({
        taxExcludedPrice: 1000,
        taxRate: 10,
        displayMode: TAX_DISPLAY_MODE.tax_excluded,
      });
      expect(result).toBe("¥1,000（税抜）");
    });
  });

  describe("tax_included モード", () => {
    test("税込表示で税込価格を返す", () => {
      const result = formatPriceWithTax({
        taxExcludedPrice: 1000,
        taxRate: 10,
        displayMode: TAX_DISPLAY_MODE.tax_included,
      });
      expect(result).toBe("¥1,100（税込）");
    });
  });

  describe("both モード", () => {
    test("税込・税抜両方を表示する", () => {
      const result = formatPriceWithTax({
        taxExcludedPrice: 1000,
        taxRate: 10,
        displayMode: TAX_DISPLAY_MODE.both,
      });
      expect(result).toBe("¥1,100（税込）/ ¥1,000（税抜）");
    });
  });

  describe("エッジケース", () => {
    test("0円でも正しくフォーマットする", () => {
      const result = formatPriceWithTax({
        taxExcludedPrice: 0,
        taxRate: 10,
        displayMode: TAX_DISPLAY_MODE.tax_included,
      });
      expect(result).toBe("¥0（税込）");
    });

    test("大きな金額でカンマ区切りが正しく適用される", () => {
      const result = formatPriceWithTax({
        taxExcludedPrice: 100000,
        taxRate: 10,
        displayMode: TAX_DISPLAY_MODE.tax_included,
      });
      expect(result).toBe("¥110,000（税込）");
    });
  });
});

// =============================================================================
// getTaxRateLabel
// =============================================================================

describe("getTaxRateLabel", () => {
  test("standard タイプで '標準税率（X%）' 形式を返す", () => {
    const label = getTaxRateLabel(TAX_RATE_TYPE.standard, 10);
    expect(label).toBe("標準税率（10%）");
  });

  test("reduced タイプで '軽減税率（X%）' 形式を返す", () => {
    const label = getTaxRateLabel(TAX_RATE_TYPE.reduced, 8);
    expect(label).toBe("軽減税率（8%）");
  });

  test("カスタム税率でも正しくラベルを返す", () => {
    const label = getTaxRateLabel(TAX_RATE_TYPE.standard, 15);
    expect(label).toBe("標準税率（15%）");
  });
});

// =============================================================================
// formatDiscountAmount
// =============================================================================

describe("formatDiscountAmount", () => {
  describe("PERCENTAGE タイプ", () => {
    test("パーセント表示で 'X%OFF' 形式を返す", () => {
      const result = formatDiscountAmount("PERCENTAGE", 20);
      expect(result).toBe("20%OFF");
    });

    test("100% OFF も正しくフォーマットする", () => {
      const result = formatDiscountAmount("PERCENTAGE", 100);
      expect(result).toBe("100%OFF");
    });
  });

  describe("FIXED_AMOUNT タイプ", () => {
    test("定額表示で '¥XXXOFF' 形式を返す", () => {
      const result = formatDiscountAmount("FIXED_AMOUNT", 500);
      expect(result).toBe("¥500OFF");
    });

    test("大きな金額でカンマ区切りが適用される", () => {
      const result = formatDiscountAmount("FIXED_AMOUNT", 1000);
      expect(result).toBe("¥1,000OFF");
    });
  });
});

// =============================================================================
// validateDurationDiscountRules
// =============================================================================

describe("validateDurationDiscountRules", () => {
  describe("正常系", () => {
    test("有効なルール配列で valid: true と parsed rules を返す", () => {
      const rules = [
        { hours: 3, discountRate: 5 },
        { hours: 6, discountRate: 10 },
      ];
      const result = validateDurationDiscountRules(rules);
      expect(result.valid).toBe(true);
      expect(result.rules).toHaveLength(2);
      expect(result.error).toBeUndefined();
    });

    test("空配列で valid: true を返す", () => {
      const result = validateDurationDiscountRules([]);
      expect(result.valid).toBe(true);
      expect(result.rules).toHaveLength(0);
    });

    test("discountRate が 0 のルールも有効", () => {
      const rules = [{ hours: 3, discountRate: 0 }];
      const result = validateDurationDiscountRules(rules);
      expect(result.valid).toBe(true);
    });

    test("discountRate が 100 のルールも有効（上限）", () => {
      const rules = [{ hours: 3, discountRate: 100 }];
      const result = validateDurationDiscountRules(rules);
      expect(result.valid).toBe(true);
    });
  });

  describe("異常系", () => {
    test("配列でない値で valid: false を返す", () => {
      const result = validateDurationDiscountRules("invalid");
      expect(result.valid).toBe(false);
      expect(result.error).toBeTruthy();
    });

    test("null で valid: false を返す", () => {
      const result = validateDurationDiscountRules(null);
      expect(result.valid).toBe(false);
    });

    test("undefined で valid: false を返す", () => {
      const result = validateDurationDiscountRules(undefined);
      expect(result.valid).toBe(false);
    });

    test("hours が文字列のルールで valid: false を返す", () => {
      const rules = [{ hours: "3", discountRate: 10 }];
      const result = validateDurationDiscountRules(rules);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("hours");
    });

    test("discountRate が文字列のルールで valid: false を返す", () => {
      const rules = [{ hours: 3, discountRate: "10" }];
      const result = validateDurationDiscountRules(rules);
      expect(result.valid).toBe(false);
    });

    test("hours が 0 以下で valid: false を返す", () => {
      const rules = [{ hours: 0, discountRate: 10 }];
      const result = validateDurationDiscountRules(rules);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("0より大きい");
    });

    test("hours が負数で valid: false を返す", () => {
      const rules = [{ hours: -1, discountRate: 10 }];
      const result = validateDurationDiscountRules(rules);
      expect(result.valid).toBe(false);
    });

    test("discountRate が 100 を超えると valid: false を返す", () => {
      const rules = [{ hours: 3, discountRate: 101 }];
      const result = validateDurationDiscountRules(rules);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("0〜100");
    });

    test("discountRate が負数で valid: false を返す", () => {
      const rules = [{ hours: 3, discountRate: -1 }];
      const result = validateDurationDiscountRules(rules);
      expect(result.valid).toBe(false);
    });

    test("null 要素を含む配列で valid: false を返す", () => {
      const rules = [null];
      const result = validateDurationDiscountRules(rules);
      expect(result.valid).toBe(false);
    });
  });
});

// =============================================================================
// parseDurationDiscountRules
// =============================================================================

describe("parseDurationDiscountRules", () => {
  describe("正常系", () => {
    test("有効なルール配列を返す", () => {
      const rules = [
        { hours: 3, discountRate: 5 },
        { hours: 6, discountRate: 10 },
      ];
      const result = parseDurationDiscountRules(rules);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ hours: 3, discountRate: 5 });
    });

    test("空配列を返す（有効な空入力）", () => {
      const result = parseDurationDiscountRules([]);
      expect(result).toEqual([]);
    });
  });

  describe("異常系（無効入力）", () => {
    test("無効な入力で空配列を返す", () => {
      expect(parseDurationDiscountRules(null)).toEqual([]);
      expect(parseDurationDiscountRules(undefined)).toEqual([]);
      expect(parseDurationDiscountRules("invalid")).toEqual([]);
      expect(parseDurationDiscountRules(42)).toEqual([]);
    });

    test("不正な構造のルールを含む場合、空配列を返す", () => {
      const invalid = [{ hours: -1, discountRate: 10 }];
      const result = parseDurationDiscountRules(invalid);
      expect(result).toEqual([]);
    });
  });
});

// =============================================================================
// 税計算の整合性テスト（統合的なシナリオ）
// =============================================================================

describe("税計算の整合性", () => {
  test("標準税率10%での税込・税抜・税額の関係が正しい", () => {
    const taxExcluded = 10000;
    const taxRate = 10;

    const taxIncluded = calculateTaxIncludedPrice(taxExcluded, taxRate);
    const taxAmount = calculateTaxAmount(taxExcluded, taxRate);

    expect(taxIncluded).toBe(11000);
    expect(taxAmount).toBe(1000);
    expect(taxIncluded).toBe(taxExcluded + taxAmount);
  });

  test("軽減税率8%での税込・税抜・税額の関係が正しい", () => {
    const taxExcluded = 10000;
    const taxRate = 8;

    const taxIncluded = calculateTaxIncludedPrice(taxExcluded, taxRate);
    const taxAmount = calculateTaxAmount(taxExcluded, taxRate);

    expect(taxIncluded).toBe(10800);
    expect(taxAmount).toBe(800);
    expect(taxIncluded).toBe(taxExcluded + taxAmount);
  });
});
