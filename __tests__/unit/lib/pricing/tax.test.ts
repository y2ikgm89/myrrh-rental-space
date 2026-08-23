import { describe, test, expect } from "bun:test";
import { installPrismaEnumsMock } from "../../../support/prisma-enums-mock";

// Enum モック（import より前に配置）
//
// **手書きの ALL_ENUMS で全体置換しない（監査 A-50）。**
// 以前は 150 行超の手書き定数で module ごと差し替えており、実 schema から既に
// ドリフトしていた（`PaymentStatus.PARTIALLY_REFUNDED` 欠落、`AnalyticsType.ga4` の小文字キー、
// `AuditAction` の 7 値欠落）。実を spread する helper なら enum 追加に自動追従する。
await installPrismaEnumsMock();

import {
  getTaxRate,
  calculateTaxIncludedPrice,
  calculateTaxExcludedPrice,
  calculateTaxAmount,
  resolvePublicDisplayPrice,
  DEFAULT_TAX_SETTINGS,
} from "@/shared/lib/pricing/tax";
import type { TaxSettings } from "@/shared/lib/pricing/types";

// =============================================================================
// DEFAULT_TAX_SETTINGS
// =============================================================================

describe("DEFAULT_TAX_SETTINGS", () => {
  test("標準税率が 10% であること", () => {
    expect(DEFAULT_TAX_SETTINGS.standardRate).toBe(10);
  });

  test("軽減税率が 8% であること", () => {
    expect(DEFAULT_TAX_SETTINGS.reducedRate).toBe(8);
  });
});

// =============================================================================
// getTaxRate
// =============================================================================

describe("getTaxRate", () => {
  describe("デフォルト設定を使用", () => {
    test("standard タイプでデフォルト標準税率 (10%) を返す", () => {
      expect(getTaxRate("STANDARD")).toBe(10);
    });

    test("reduced タイプでデフォルト軽減税率 (8%) を返す", () => {
      expect(getTaxRate("REDUCED")).toBe(8);
    });
  });

  describe("カスタム設定を使用", () => {
    test("カスタム標準税率を返す", () => {
      const customSettings: TaxSettings = {
        ...DEFAULT_TAX_SETTINGS,
        standardRate: 15,
      };
      expect(getTaxRate("STANDARD", customSettings)).toBe(15);
    });

    test("カスタム軽減税率を返す", () => {
      const customSettings: TaxSettings = {
        ...DEFAULT_TAX_SETTINGS,
        reducedRate: 5,
      };
      expect(getTaxRate("REDUCED", customSettings)).toBe(5);
    });

    test("標準税率 0% のカスタム設定", () => {
      const customSettings: TaxSettings = {
        ...DEFAULT_TAX_SETTINGS,
        standardRate: 0,
      };
      expect(getTaxRate("STANDARD", customSettings)).toBe(0);
    });
  });

  describe("エッジケース", () => {
    test("standard タイプは reducedRate を返さない", () => {
      const settings: TaxSettings = {
        ...DEFAULT_TAX_SETTINGS,
        standardRate: 10,
        reducedRate: 8,
      };
      expect(getTaxRate("STANDARD", settings)).toBe(10);
      expect(getTaxRate("STANDARD", settings)).not.toBe(8);
    });

    test("reduced タイプは standardRate を返さない", () => {
      const settings: TaxSettings = {
        ...DEFAULT_TAX_SETTINGS,
        standardRate: 10,
        reducedRate: 8,
      };
      expect(getTaxRate("REDUCED", settings)).toBe(8);
      expect(getTaxRate("REDUCED", settings)).not.toBe(10);
    });
  });
});

// =============================================================================
// calculateTaxIncludedPrice
// =============================================================================

describe("calculateTaxIncludedPrice", () => {
  describe("消費税 10%", () => {
    test("10000 円（税抜）+ 10% = 11000 円（税込）", () => {
      expect(calculateTaxIncludedPrice(10000, 10)).toBe(11000);
    });

    test("1000 円（税抜）+ 10% = 1100 円（税込）", () => {
      expect(calculateTaxIncludedPrice(1000, 10)).toBe(1100);
    });

    test("端数は四捨五入（Math.round）", () => {
      // 1001 * 1.10 = 1101.1 → Math.round → 1101
      expect(calculateTaxIncludedPrice(1001, 10)).toBe(1101);
    });

    test("端数が 0.5 以上で切り上げ", () => {
      // 1 * 1.10 = 1.1 → Math.round → 1
      expect(calculateTaxIncludedPrice(1, 10)).toBe(1);
      // 5 * 1.10 = 5.5 → Math.round → 6
      expect(calculateTaxIncludedPrice(5, 10)).toBe(6);
    });
  });

  describe("消費税 8%（軽減税率）", () => {
    test("10000 円（税抜）+ 8% = 10800 円（税込）", () => {
      expect(calculateTaxIncludedPrice(10000, 8)).toBe(10800);
    });

    test("1000 円（税抜）+ 8% = 1080 円（税込）", () => {
      expect(calculateTaxIncludedPrice(1000, 8)).toBe(1080);
    });

    test("端数は四捨五入", () => {
      // 100 * 1.08 = 108.0 → 108
      expect(calculateTaxIncludedPrice(100, 8)).toBe(108);
      // 10 * 1.08 = 10.8 → Math.round → 11
      expect(calculateTaxIncludedPrice(10, 8)).toBe(11);
    });
  });

  describe("エッジケース", () => {
    test("税率 0% の場合は元の価格をそのまま返す", () => {
      expect(calculateTaxIncludedPrice(10000, 0)).toBe(10000);
    });

    test("価格 0 の場合は 0 を返す", () => {
      expect(calculateTaxIncludedPrice(0, 10)).toBe(0);
    });

    test("大きな金額でも正しく計算する", () => {
      expect(calculateTaxIncludedPrice(1000000, 10)).toBe(1100000);
    });

    test("税率 100% の場合は 2倍になる", () => {
      expect(calculateTaxIncludedPrice(5000, 100)).toBe(10000);
    });
  });
});

// =============================================================================
// calculateTaxExcludedPrice
// =============================================================================

describe("calculateTaxExcludedPrice", () => {
  describe("消費税 10%", () => {
    test("11000 円（税込）÷ 1.10 = 10000 円（税抜）", () => {
      expect(calculateTaxExcludedPrice(11000, 10)).toBe(10000);
    });

    test("1100 円（税込）÷ 1.10 = 1000 円（税抜）", () => {
      expect(calculateTaxExcludedPrice(1100, 10)).toBe(1000);
    });

    test("端数は四捨五入（Math.round）", () => {
      // 1000 / 1.10 = 909.0909... → Math.round → 909
      expect(calculateTaxExcludedPrice(1000, 10)).toBe(909);
    });

    test("税込価格から税抜価格への逆算", () => {
      // calculateTaxIncludedPrice(10000, 10) = 11000
      // calculateTaxExcludedPrice(11000, 10) = 10000
      const taxIncluded = calculateTaxIncludedPrice(10000, 10);
      const taxExcluded = calculateTaxExcludedPrice(taxIncluded, 10);
      expect(taxExcluded).toBe(10000);
    });
  });

  describe("消費税 8%（軽減税率）", () => {
    test("10800 円（税込）÷ 1.08 = 10000 円（税抜）", () => {
      expect(calculateTaxExcludedPrice(10800, 8)).toBe(10000);
    });

    test("端数は四捨五入", () => {
      // 100 / 1.08 = 92.5925... → Math.round → 93
      expect(calculateTaxExcludedPrice(100, 8)).toBe(93);
    });

    test("税込 3000 円は切り捨て 2777 ではなく四捨五入 2778", () => {
      // N-12: イベント領収書が floor(3000*100/108)=2777 だと税額 223。
      // SSoT は round(3000/1.08)=2778、税額 222。
      expect(calculateTaxExcludedPrice(3000, 8)).toBe(2778);
      expect(3000 - calculateTaxExcludedPrice(3000, 8)).toBe(222);
    });

    test("税込価格から税抜価格への逆算（8%）", () => {
      const taxIncluded = calculateTaxIncludedPrice(5000, 8);
      const taxExcluded = calculateTaxExcludedPrice(taxIncluded, 8);
      expect(taxExcluded).toBe(5000);
    });
  });

  describe("エッジケース", () => {
    test("税率 0% の場合は元の価格をそのまま返す", () => {
      expect(calculateTaxExcludedPrice(10000, 0)).toBe(10000);
    });

    test("価格 0 の場合は 0 を返す", () => {
      expect(calculateTaxExcludedPrice(0, 10)).toBe(0);
    });

    test("大きな金額でも正しく計算する", () => {
      expect(calculateTaxExcludedPrice(1100000, 10)).toBe(1000000);
    });
  });
});

// =============================================================================
// calculateTaxAmount
// =============================================================================

describe("calculateTaxAmount", () => {
  describe("消費税 10%", () => {
    test("10000 円の 10% = 1000 円", () => {
      expect(calculateTaxAmount(10000, 10)).toBe(1000);
    });

    test("1000 円の 10% = 100 円", () => {
      expect(calculateTaxAmount(1000, 10)).toBe(100);
    });

    test("端数は四捨五入（Math.round）", () => {
      // 1001 * 0.10 = 100.1 → Math.round → 100
      expect(calculateTaxAmount(1001, 10)).toBe(100);
      // 1005 * 0.10 = 100.5 → Math.round → 101（.5は切り上げ）
      expect(calculateTaxAmount(1005, 10)).toBe(101);
    });
  });

  describe("消費税 8%（軽減税率）", () => {
    test("10000 円の 8% = 800 円", () => {
      expect(calculateTaxAmount(10000, 8)).toBe(800);
    });

    test("1000 円の 8% = 80 円", () => {
      expect(calculateTaxAmount(1000, 8)).toBe(80);
    });

    test("端数は四捨五入", () => {
      // 100 * 0.08 = 8.0 → 8
      expect(calculateTaxAmount(100, 8)).toBe(8);
      // 10 * 0.08 = 0.8 → Math.round → 1
      expect(calculateTaxAmount(10, 8)).toBe(1);
    });
  });

  describe("エッジケース", () => {
    test("税率 0% の場合は 0 を返す", () => {
      expect(calculateTaxAmount(10000, 0)).toBe(0);
    });

    test("価格 0 の場合は 0 を返す", () => {
      expect(calculateTaxAmount(0, 10)).toBe(0);
    });

    test("大きな金額でも正しく計算する", () => {
      expect(calculateTaxAmount(1000000, 10)).toBe(100000);
    });

    test("税額 = 税込価格 - 税抜価格 の関係を確認", () => {
      const taxExcluded = 10000;
      const taxRate = 10;
      const taxIncluded = calculateTaxIncludedPrice(taxExcluded, taxRate);
      const taxAmount = calculateTaxAmount(taxExcluded, taxRate);
      // 四捨五入の誤差が生じる場合があるため、±1 の範囲で確認
      expect(
        Math.abs(taxIncluded - taxExcluded - taxAmount),
      ).toBeLessThanOrEqual(1);
    });
  });
});

// =============================================================================
// resolvePublicDisplayPrice
// =============================================================================

describe("resolvePublicDisplayPrice", () => {
  test("tax_included では税込価格を返す", () => {
    expect(
      resolvePublicDisplayPrice(1000, "STANDARD", {
        ...DEFAULT_TAX_SETTINGS,
        displayModePublic: "TAX_INCLUDED",
      }),
    ).toBe(1100);
  });

  test("both でも UI と同様に税込価格を返す", () => {
    expect(
      resolvePublicDisplayPrice(1000, "STANDARD", {
        ...DEFAULT_TAX_SETTINGS,
        displayModePublic: "BOTH",
      }),
    ).toBe(1100);
  });

  test("tax_excluded では税抜価格をそのまま返す", () => {
    expect(
      resolvePublicDisplayPrice(1000, "STANDARD", {
        ...DEFAULT_TAX_SETTINGS,
        displayModePublic: "TAX_EXCLUDED",
      }),
    ).toBe(1000);
  });

  test("REDUCED の税込は軽減税率で計算する（STANDARD 固定にしない）", () => {
    expect(
      resolvePublicDisplayPrice(1000, "REDUCED", {
        ...DEFAULT_TAX_SETTINGS,
        displayModePublic: "TAX_INCLUDED",
      }),
    ).toBe(1080);
  });
});

// =============================================================================
// 税計算の往復変換（整合性テスト）
// =============================================================================

describe("税計算の往復変換", () => {
  test("税抜 → 税込 → 税抜 で元の価格に戻る（10%）", () => {
    const original = 10000;
    const withTax = calculateTaxIncludedPrice(original, 10);
    const withoutTax = calculateTaxExcludedPrice(withTax, 10);
    expect(withoutTax).toBe(original);
  });

  test("税抜 → 税込 → 税抜 で元の価格に戻る（8%）", () => {
    const original = 50000;
    const withTax = calculateTaxIncludedPrice(original, 8);
    const withoutTax = calculateTaxExcludedPrice(withTax, 8);
    expect(withoutTax).toBe(original);
  });

  test("税込価格 = 税抜価格 + 税額（10%, 誤差 ±1 以内）", () => {
    const taxExcluded = 9876;
    const taxRate = 10;
    const taxIncluded = calculateTaxIncludedPrice(taxExcluded, taxRate);
    const taxAmount = calculateTaxAmount(taxExcluded, taxRate);
    // 四捨五入誤差を許容
    expect(
      Math.abs(taxIncluded - (taxExcluded + taxAmount)),
    ).toBeLessThanOrEqual(1);
  });

  test("税込価格 = 税抜価格 + 税額（8%, 誤差 ±1 以内）", () => {
    const taxExcluded = 12345;
    const taxRate = 8;
    const taxIncluded = calculateTaxIncludedPrice(taxExcluded, taxRate);
    const taxAmount = calculateTaxAmount(taxExcluded, taxRate);
    expect(
      Math.abs(taxIncluded - (taxExcluded + taxAmount)),
    ).toBeLessThanOrEqual(1);
  });

  test("複数の金額でパターンが一致すること（10%）", () => {
    const amounts = [100, 1000, 5000, 10000, 100000];
    for (const amount of amounts) {
      const taxIncluded = calculateTaxIncludedPrice(amount, 10);
      expect(taxIncluded).toBeGreaterThanOrEqual(amount);
    }
  });
});
