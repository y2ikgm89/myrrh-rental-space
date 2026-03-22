import { describe, test, expect } from "bun:test";
import {
  isValidDiscountType,
  isValidDurationDiscountOverride,
  isValidDiscountCombinationMode,
  isValidTaxRateType,
  isValidTaxDisplayMode,
  isValidTaxInputMode,
} from "@/shared/lib/validations/enums/guards";
import {
  getValidDiscountType,
  getValidDurationDiscountOverride,
  getValidDiscountCombinationMode,
  getValidTaxRateType,
  getValidTaxDisplayMode,
  getValidTaxInputMode,
} from "@/shared/lib/validations/enums/helpers";
import {
  calculateSpaceDiscount,
  calculateDurationDiscount,
  calculateCouponDiscount,
  validateDurationDiscountRules,
  parseDurationDiscountRules,
} from "@/shared/lib/pricing/discount";
import { calculateReservationPrice } from "@/shared/lib/pricing/reservation";
import {
  formatDiscountAmount,
  formatDiscountSummary,
  formatPrice,
  formatPriceWithTax,
  getTaxRateLabel,
} from "@/shared/lib/pricing/format";
import {
  getTaxRate,
  calculateTaxIncludedPrice,
  calculateTaxExcludedPrice,
  calculateTaxAmount,
  DEFAULT_TAX_SETTINGS,
} from "@/shared/lib/pricing/tax";
import type {
  DurationDiscountRule,
  SpaceDiscountSettings,
  PriceCalculationParams,
  PriceCalculation,
  TaxSettings,
} from "@/shared/lib/pricing/types";

// =============================================================================
// 型ガード & デフォルト値関数
// =============================================================================

describe("isValidDiscountType", () => {
  test('有効な値 "none" で true を返す', () => {
    expect(isValidDiscountType("none")).toBe(true);
  });

  test('有効な値 "percentage" で true を返す', () => {
    expect(isValidDiscountType("percentage")).toBe(true);
  });

  test('有効な値 "fixed" で true を返す', () => {
    expect(isValidDiscountType("fixed")).toBe(true);
  });

  test("無効な文字列で false を返す", () => {
    expect(isValidDiscountType("invalid")).toBe(false);
    expect(isValidDiscountType("PERCENTAGE")).toBe(false);
    expect(isValidDiscountType("")).toBe(false);
  });

  test("文字列以外で false を返す", () => {
    expect(isValidDiscountType(123)).toBe(false);
    expect(isValidDiscountType(null)).toBe(false);
    expect(isValidDiscountType(undefined)).toBe(false);
    expect(isValidDiscountType(true)).toBe(false);
    expect(isValidDiscountType([])).toBe(false);
  });
});

describe("getValidDiscountType", () => {
  test("有効な値をそのまま返す", () => {
    expect(getValidDiscountType("none")).toBe("none");
    expect(getValidDiscountType("percentage")).toBe("percentage");
    expect(getValidDiscountType("fixed")).toBe("fixed");
  });

  test('無効な値でデフォルト "none" を返す', () => {
    expect(getValidDiscountType("invalid")).toBe("none");
    expect(getValidDiscountType("")).toBe("none");
  });

  test('null でデフォルト "none" を返す', () => {
    expect(getValidDiscountType(null)).toBe("none");
  });

  test('undefined でデフォルト "none" を返す', () => {
    expect(getValidDiscountType(undefined)).toBe("none");
  });

  test("カスタムデフォルト値を返す", () => {
    expect(getValidDiscountType(null, "percentage")).toBe("percentage");
    expect(getValidDiscountType("invalid", "fixed")).toBe("fixed");
  });
});

describe("isValidDurationDiscountOverride", () => {
  test("有効な値で true を返す", () => {
    expect(isValidDurationDiscountOverride("inherit")).toBe(true);
    expect(isValidDurationDiscountOverride("enabled")).toBe(true);
    expect(isValidDurationDiscountOverride("disabled")).toBe(true);
  });

  test("無効な文字列で false を返す", () => {
    expect(isValidDurationDiscountOverride("invalid")).toBe(false);
    expect(isValidDurationDiscountOverride("INHERIT")).toBe(false);
    expect(isValidDurationDiscountOverride("")).toBe(false);
  });

  test("文字列以外で false を返す", () => {
    expect(isValidDurationDiscountOverride(123)).toBe(false);
    expect(isValidDurationDiscountOverride(null)).toBe(false);
    expect(isValidDurationDiscountOverride(undefined)).toBe(false);
  });
});

describe("getValidDurationDiscountOverride", () => {
  test("有効な値をそのまま返す", () => {
    expect(getValidDurationDiscountOverride("inherit")).toBe("inherit");
    expect(getValidDurationDiscountOverride("enabled")).toBe("enabled");
    expect(getValidDurationDiscountOverride("disabled")).toBe("disabled");
  });

  test('無効な値でデフォルト "inherit" を返す', () => {
    expect(getValidDurationDiscountOverride("invalid")).toBe("inherit");
  });

  test('null でデフォルト "inherit" を返す', () => {
    expect(getValidDurationDiscountOverride(null)).toBe("inherit");
  });

  test('undefined でデフォルト "inherit" を返す', () => {
    expect(getValidDurationDiscountOverride(undefined)).toBe("inherit");
  });

  test("カスタムデフォルト値を返す", () => {
    expect(getValidDurationDiscountOverride(null, "enabled")).toBe("enabled");
  });
});

describe("isValidDiscountCombinationMode", () => {
  test("有効な値で true を返す", () => {
    expect(isValidDiscountCombinationMode("best")).toBe(true);
    expect(isValidDiscountCombinationMode("both")).toBe(true);
  });

  test("無効な文字列で false を返す", () => {
    expect(isValidDiscountCombinationMode("invalid")).toBe(false);
    expect(isValidDiscountCombinationMode("BEST")).toBe(false);
    expect(isValidDiscountCombinationMode("")).toBe(false);
  });

  test("文字列以外で false を返す", () => {
    expect(isValidDiscountCombinationMode(null)).toBe(false);
    expect(isValidDiscountCombinationMode(undefined)).toBe(false);
    expect(isValidDiscountCombinationMode(42)).toBe(false);
  });
});

describe("getValidDiscountCombinationMode", () => {
  test("有効な値をそのまま返す", () => {
    expect(getValidDiscountCombinationMode("best")).toBe("best");
    expect(getValidDiscountCombinationMode("both")).toBe("both");
  });

  test('無効な値でデフォルト "best" を返す', () => {
    expect(getValidDiscountCombinationMode("invalid")).toBe("best");
  });

  test('null でデフォルト "best" を返す', () => {
    expect(getValidDiscountCombinationMode(null)).toBe("best");
  });

  test('undefined でデフォルト "best" を返す', () => {
    expect(getValidDiscountCombinationMode(undefined)).toBe("best");
  });

  test("カスタムデフォルト値を返す", () => {
    expect(getValidDiscountCombinationMode(null, "both")).toBe("both");
  });
});

// =============================================================================
// スペース固有割引計算
// =============================================================================

describe("calculateSpaceDiscount", () => {
  test("設定がnullの場合、割引なしを返す", () => {
    const result = calculateSpaceDiscount(10000, null);
    expect(result.discount).toBe(0);
    expect(result.applied).toBeNull();
  });

  test("設定がundefinedの場合、割引なしを返す", () => {
    const result = calculateSpaceDiscount(10000, undefined);
    expect(result.discount).toBe(0);
    expect(result.applied).toBeNull();
  });

  test('discountTypeが "none" の場合、割引なしを返す', () => {
    const settings: SpaceDiscountSettings = {
      discountType: "none",
      discountValue: 10,
      durationDiscountOverride: "inherit",
    };
    const result = calculateSpaceDiscount(10000, settings);
    expect(result.discount).toBe(0);
    expect(result.applied).toBeNull();
  });

  test("discountValueがnullの場合、割引なしを返す", () => {
    const settings: SpaceDiscountSettings = {
      discountType: "percentage",
      discountValue: null,
      durationDiscountOverride: "inherit",
    };
    const result = calculateSpaceDiscount(10000, settings);
    expect(result.discount).toBe(0);
    expect(result.applied).toBeNull();
  });

  describe("パーセント割引", () => {
    test("10%割引を正しく計算する", () => {
      const settings: SpaceDiscountSettings = {
        discountType: "percentage",
        discountValue: 10,
        durationDiscountOverride: "inherit",
      };
      const result = calculateSpaceDiscount(10000, settings);
      expect(result.discount).toBe(1000);
      expect(result.applied).toEqual({ type: "percentage", value: 10 });
    });

    test("50%割引を正しく計算する", () => {
      const settings: SpaceDiscountSettings = {
        discountType: "percentage",
        discountValue: 50,
        durationDiscountOverride: "inherit",
      };
      const result = calculateSpaceDiscount(10000, settings);
      expect(result.discount).toBe(5000);
      expect(result.applied).toEqual({ type: "percentage", value: 50 });
    });

    test("端数がfloorされる（切り捨て）", () => {
      const settings: SpaceDiscountSettings = {
        discountType: "percentage",
        discountValue: 33,
        durationDiscountOverride: "inherit",
      };
      // 10000 * 33 / 100 = 3300
      const result = calculateSpaceDiscount(10000, settings);
      expect(result.discount).toBe(3300);

      // 1999 * 33 / 100 = 659.67 → floor = 659
      const result2 = calculateSpaceDiscount(1999, settings);
      expect(result2.discount).toBe(659);
    });

    test("100%割引で基本料金全額を返す", () => {
      const settings: SpaceDiscountSettings = {
        discountType: "percentage",
        discountValue: 100,
        durationDiscountOverride: "inherit",
      };
      const result = calculateSpaceDiscount(10000, settings);
      expect(result.discount).toBe(10000);
    });

    test("0%割引で0を返す", () => {
      const settings: SpaceDiscountSettings = {
        discountType: "percentage",
        discountValue: 0,
        durationDiscountOverride: "inherit",
      };
      const result = calculateSpaceDiscount(10000, settings);
      expect(result.discount).toBe(0);
    });
  });

  describe("定額割引", () => {
    test("固定額を正しく返す", () => {
      const settings: SpaceDiscountSettings = {
        discountType: "fixed",
        discountValue: 1500,
        durationDiscountOverride: "inherit",
      };
      const result = calculateSpaceDiscount(10000, settings);
      expect(result.discount).toBe(1500);
      expect(result.applied).toEqual({ type: "fixed", value: 1500 });
    });

    test("割引額が基本料金を超えない", () => {
      const settings: SpaceDiscountSettings = {
        discountType: "fixed",
        discountValue: 15000,
        durationDiscountOverride: "inherit",
      };
      const result = calculateSpaceDiscount(10000, settings);
      expect(result.discount).toBe(10000); // min(15000, 10000)
    });

    test("割引額が基本料金と同額の場合、全額割引", () => {
      const settings: SpaceDiscountSettings = {
        discountType: "fixed",
        discountValue: 10000,
        durationDiscountOverride: "inherit",
      };
      const result = calculateSpaceDiscount(10000, settings);
      expect(result.discount).toBe(10000);
    });
  });
});

// =============================================================================
// 長時間割引計算
// =============================================================================

describe("calculateDurationDiscount", () => {
  const defaultRules: DurationDiscountRule[] = [
    { hours: 3, discountRate: 5 },
    { hours: 5, discountRate: 10 },
    { hours: 8, discountRate: 20 },
  ];

  test("ルールが空配列の場合、割引なしを返す", () => {
    const result = calculateDurationDiscount(10000, 5, []);
    expect(result.discount).toBe(0);
    expect(result.appliedRule).toBeNull();
  });

  test("時間が0以下の場合、割引なしを返す", () => {
    const result = calculateDurationDiscount(10000, 0, defaultRules);
    expect(result.discount).toBe(0);
    expect(result.appliedRule).toBeNull();

    const result2 = calculateDurationDiscount(10000, -1, defaultRules);
    expect(result2.discount).toBe(0);
    expect(result2.appliedRule).toBeNull();
  });

  test("基本料金が0以下の場合、割引なしを返す", () => {
    const result = calculateDurationDiscount(0, 5, defaultRules);
    expect(result.discount).toBe(0);
    expect(result.appliedRule).toBeNull();

    const result2 = calculateDurationDiscount(-1000, 5, defaultRules);
    expect(result2.discount).toBe(0);
    expect(result2.appliedRule).toBeNull();
  });

  test("最も長い時間ルールにマッチする場合、そのルールを適用する", () => {
    // 10時間予約 → 8時間以上ルール（20%OFF）
    const result = calculateDurationDiscount(10000, 10, defaultRules);
    expect(result.discount).toBe(2000); // 10000 * 20/100
    expect(result.appliedRule).toEqual({ hours: 8, discountRate: 20 });
  });

  test("中間のルールにマッチする場合", () => {
    // 6時間予約 → 5時間以上ルール（10%OFF）
    const result = calculateDurationDiscount(10000, 6, defaultRules);
    expect(result.discount).toBe(1000); // 10000 * 10/100
    expect(result.appliedRule).toEqual({ hours: 5, discountRate: 10 });
  });

  test("最小のルールにマッチする場合", () => {
    // 3時間予約 → 3時間以上ルール（5%OFF）
    const result = calculateDurationDiscount(10000, 3, defaultRules);
    expect(result.discount).toBe(500);
    expect(result.appliedRule).toEqual({ hours: 3, discountRate: 5 });
  });

  test("どのルールにもマッチしない場合、割引なしを返す", () => {
    // 2時間予約 → マッチなし
    const result = calculateDurationDiscount(10000, 2, defaultRules);
    expect(result.discount).toBe(0);
    expect(result.appliedRule).toBeNull();
  });

  test("ちょうどの時間でルールにマッチする", () => {
    // 5時間予約 → 5時間以上ルール（10%OFF）
    const result = calculateDurationDiscount(10000, 5, defaultRules);
    expect(result.discount).toBe(1000);
    expect(result.appliedRule).toEqual({ hours: 5, discountRate: 10 });
  });

  test("ルールが未ソートでも正しくソートして適用する", () => {
    const unsortedRules: DurationDiscountRule[] = [
      { hours: 8, discountRate: 20 },
      { hours: 3, discountRate: 5 },
      { hours: 5, discountRate: 10 },
    ];
    // 6時間予約 → 5時間以上ルール（10%OFF）
    const result = calculateDurationDiscount(10000, 6, unsortedRules);
    expect(result.discount).toBe(1000);
    expect(result.appliedRule).toEqual({ hours: 5, discountRate: 10 });
  });

  test("割引率が0のルールはスキップされる", () => {
    const rulesWithZero: DurationDiscountRule[] = [
      { hours: 3, discountRate: 0 },
      { hours: 5, discountRate: 10 },
    ];
    // 4時間予約 → 3時間以上ルールは discountRate=0 なのでスキップ
    const result = calculateDurationDiscount(10000, 4, rulesWithZero);
    expect(result.discount).toBe(0);
    expect(result.appliedRule).toBeNull();
  });

  test("割引額が切り捨てされる", () => {
    const rules: DurationDiscountRule[] = [{ hours: 2, discountRate: 7 }];
    // 3333 * 7/100 = 233.31 → floor = 233
    const result = calculateDurationDiscount(3333, 3, rules);
    expect(result.discount).toBe(233);
  });
});

// =============================================================================
// クーポン割引計算
// =============================================================================

describe("calculateCouponDiscount", () => {
  describe("パーセント割引", () => {
    test("20%割引を正しく計算する", () => {
      const coupon = {
        type: "PERCENTAGE" as const,
        discountValue: 20,
        maxDiscountAmount: null,
      };
      const result = calculateCouponDiscount(10000, coupon);
      expect(result).toBe(2000);
    });

    test("最大割引額が設定されている場合、制限する", () => {
      const coupon = {
        type: "PERCENTAGE" as const,
        discountValue: 50,
        maxDiscountAmount: 3000,
      };
      // 10000 * 50/100 = 5000 → min(5000, 3000) = 3000
      const result = calculateCouponDiscount(10000, coupon);
      expect(result).toBe(3000);
    });

    test("計算額が最大割引額以下なら制限されない", () => {
      const coupon = {
        type: "PERCENTAGE" as const,
        discountValue: 10,
        maxDiscountAmount: 5000,
      };
      // 10000 * 10/100 = 1000 → min(1000, 5000) = 1000
      const result = calculateCouponDiscount(10000, coupon);
      expect(result).toBe(1000);
    });

    test("maxDiscountAmountがnullの場合、制限なし", () => {
      const coupon = {
        type: "PERCENTAGE" as const,
        discountValue: 50,
        maxDiscountAmount: null,
      };
      const result = calculateCouponDiscount(10000, coupon);
      expect(result).toBe(5000);
    });

    test("maxDiscountAmountが0の場合、制限なし（falsyなので）", () => {
      const coupon = {
        type: "PERCENTAGE" as const,
        discountValue: 50,
        maxDiscountAmount: 0,
      };
      // 0 is falsy → no max discount limit applied
      const result = calculateCouponDiscount(10000, coupon);
      expect(result).toBe(5000);
    });

    test("端数がfloorされる", () => {
      const coupon = {
        type: "PERCENTAGE" as const,
        discountValue: 15,
        maxDiscountAmount: null,
      };
      // 1999 * 15/100 = 299.85 → floor = 299
      const result = calculateCouponDiscount(1999, coupon);
      expect(result).toBe(299);
    });
  });

  describe("定額割引", () => {
    test("固定額を返す", () => {
      const coupon = {
        type: "FIXED_AMOUNT" as const,
        discountValue: 1000,
        maxDiscountAmount: null,
      };
      const result = calculateCouponDiscount(10000, coupon);
      expect(result).toBe(1000);
    });

    test("割引額が価格を超えない", () => {
      const coupon = {
        type: "FIXED_AMOUNT" as const,
        discountValue: 15000,
        maxDiscountAmount: null,
      };
      const result = calculateCouponDiscount(10000, coupon);
      expect(result).toBe(10000); // min(15000, 10000)
    });

    test("割引額が価格と同額の場合、全額割引", () => {
      const coupon = {
        type: "FIXED_AMOUNT" as const,
        discountValue: 5000,
        maxDiscountAmount: null,
      };
      const result = calculateCouponDiscount(5000, coupon);
      expect(result).toBe(5000);
    });
  });

  test("価格が0以下の場合、0を返す", () => {
    const coupon = {
      type: "PERCENTAGE" as const,
      discountValue: 20,
      maxDiscountAmount: null,
    };
    expect(calculateCouponDiscount(0, coupon)).toBe(0);
    expect(calculateCouponDiscount(-100, coupon)).toBe(0);
  });

  test("Decimal型の値をNumber変換して計算する", () => {
    // Decimal互換オブジェクトをシミュレート
    const decimalLike = {
      toString: () => "20",
      valueOf: () => 20,
    };
    const coupon = {
      type: "PERCENTAGE" as const,
      discountValue: decimalLike as unknown as number,
      maxDiscountAmount: null,
    };
    const result = calculateCouponDiscount(10000, coupon);
    expect(result).toBe(2000);
  });
});

// =============================================================================
// 予約料金計算（メイン関数）
// =============================================================================

describe("calculateReservationPrice", () => {
  const baseDurationRules: DurationDiscountRule[] = [
    { hours: 3, discountRate: 5 },
    { hours: 5, discountRate: 10 },
    { hours: 8, discountRate: 20 },
  ];

  const baseCoupon = {
    id: "coupon-1",
    code: "TEST20",
    name: "テストクーポン20%OFF",
    type: "PERCENTAGE" as const,
    discountValue: 20,
    maxDiscountAmount: null,
    canCombineWithDurationDiscount: false,
  };

  describe("基本料金計算", () => {
    test("時間単価 x 時間数で基本料金を計算する", () => {
      const result = calculateReservationPrice({
        hourlyPrice: 1000,
        hours: 3,
        durationRules: [],
        durationDiscountEnabled: false,
        combinationMode: "best",
      });
      expect(result.basePrice).toBe(3000);
      expect(result.totalPrice).toBe(3000);
    });

    test("小数を含む時間数もfloorで処理する", () => {
      const result = calculateReservationPrice({
        hourlyPrice: 1000,
        hours: 2.5,
        durationRules: [],
        durationDiscountEnabled: false,
        combinationMode: "best",
      });
      // Math.floor(1000 * 2.5) = Math.floor(2500) = 2500
      expect(result.basePrice).toBe(2500);
    });

    test("割引なしの場合、全割引額が0で警告なし", () => {
      const result = calculateReservationPrice({
        hourlyPrice: 2000,
        hours: 4,
        durationRules: [],
        durationDiscountEnabled: false,
        combinationMode: "best",
      });
      expect(result.basePrice).toBe(8000);
      expect(result.spaceDiscount).toBe(0);
      expect(result.durationDiscount).toBe(0);
      expect(result.couponDiscount).toBe(0);
      expect(result.totalPrice).toBe(8000);
      expect(result.totalDiscountRate).toBe(0);
      expect(result.appliedSpaceDiscount).toBeNull();
      expect(result.appliedDurationRule).toBeNull();
      expect(result.appliedCoupon).toBeNull();
      expect(result.warnings).toEqual([]);
    });
  });

  describe("スペース割引のみ", () => {
    test("パーセント割引が適用される", () => {
      const result = calculateReservationPrice({
        hourlyPrice: 1000,
        hours: 5,
        durationRules: [],
        durationDiscountEnabled: false,
        spaceDiscount: {
          discountType: "percentage",
          discountValue: 10,
          durationDiscountOverride: "inherit",
        },
        combinationMode: "best",
      });
      expect(result.basePrice).toBe(5000);
      expect(result.spaceDiscount).toBe(500);
      expect(result.totalPrice).toBe(4500);
      expect(result.appliedSpaceDiscount).toEqual({
        type: "percentage",
        value: 10,
      });
    });

    test("定額割引が適用される", () => {
      const result = calculateReservationPrice({
        hourlyPrice: 1000,
        hours: 5,
        durationRules: [],
        durationDiscountEnabled: false,
        spaceDiscount: {
          discountType: "fixed",
          discountValue: 800,
          durationDiscountOverride: "inherit",
        },
        combinationMode: "best",
      });
      expect(result.basePrice).toBe(5000);
      expect(result.spaceDiscount).toBe(800);
      expect(result.totalPrice).toBe(4200);
    });
  });

  describe("長時間割引のみ", () => {
    test("durationDiscountEnabledがtrueの場合、長時間割引が適用される", () => {
      const result = calculateReservationPrice({
        hourlyPrice: 1000,
        hours: 5,
        durationRules: baseDurationRules,
        durationDiscountEnabled: true,
        combinationMode: "best",
      });
      expect(result.basePrice).toBe(5000);
      expect(result.durationDiscount).toBe(500); // 5000 * 10/100
      expect(result.totalPrice).toBe(4500);
      expect(result.appliedDurationRule).toEqual({
        hours: 5,
        discountRate: 10,
      });
    });

    test("durationDiscountEnabledがfalseの場合、長時間割引は適用されない", () => {
      const result = calculateReservationPrice({
        hourlyPrice: 1000,
        hours: 5,
        durationRules: baseDurationRules,
        durationDiscountEnabled: false,
        combinationMode: "best",
      });
      expect(result.durationDiscount).toBe(0);
      expect(result.appliedDurationRule).toBeNull();
    });
  });

  describe("長時間割引オーバーライド", () => {
    test('オーバーライド "inherit" はグローバル設定に従う（有効）', () => {
      const result = calculateReservationPrice({
        hourlyPrice: 1000,
        hours: 5,
        durationRules: baseDurationRules,
        durationDiscountEnabled: true,
        spaceDiscount: {
          discountType: "none",
          discountValue: null,
          durationDiscountOverride: "inherit",
        },
        combinationMode: "best",
      });
      expect(result.durationDiscount).toBe(500);
    });

    test('オーバーライド "inherit" はグローバル設定に従う（無効）', () => {
      const result = calculateReservationPrice({
        hourlyPrice: 1000,
        hours: 5,
        durationRules: baseDurationRules,
        durationDiscountEnabled: false,
        spaceDiscount: {
          discountType: "none",
          discountValue: null,
          durationDiscountOverride: "inherit",
        },
        combinationMode: "best",
      });
      expect(result.durationDiscount).toBe(0);
    });

    test('オーバーライド "enabled" はグローバル設定を上書きする（有効化）', () => {
      const result = calculateReservationPrice({
        hourlyPrice: 1000,
        hours: 5,
        durationRules: baseDurationRules,
        durationDiscountEnabled: false, // グローバルは無効
        spaceDiscount: {
          discountType: "none",
          discountValue: null,
          durationDiscountOverride: "enabled", // スペースレベルで有効化
        },
        combinationMode: "best",
      });
      expect(result.durationDiscount).toBe(500); // オーバーライドで有効
    });

    test('オーバーライド "disabled" はグローバル設定を上書きする（無効化）', () => {
      const result = calculateReservationPrice({
        hourlyPrice: 1000,
        hours: 5,
        durationRules: baseDurationRules,
        durationDiscountEnabled: true, // グローバルは有効
        spaceDiscount: {
          discountType: "none",
          discountValue: null,
          durationDiscountOverride: "disabled", // スペースレベルで無効化
        },
        combinationMode: "best",
      });
      expect(result.durationDiscount).toBe(0); // オーバーライドで無効
    });
  });

  describe("クーポン割引のみ", () => {
    test("パーセントクーポンが適用される", () => {
      const result = calculateReservationPrice({
        hourlyPrice: 1000,
        hours: 5,
        durationRules: [],
        durationDiscountEnabled: false,
        coupon: baseCoupon,
        combinationMode: "best",
      });
      expect(result.basePrice).toBe(5000);
      expect(result.couponDiscount).toBe(1000); // 5000 * 20/100
      expect(result.totalPrice).toBe(4000);
      expect(result.appliedCoupon).toEqual({
        id: "coupon-1",
        code: "TEST20",
        name: "テストクーポン20%OFF",
        type: "PERCENTAGE",
        discountValue: 20,
      });
    });

    test("定額クーポンが適用される", () => {
      const fixedCoupon = {
        ...baseCoupon,
        type: "FIXED_AMOUNT" as const,
        discountValue: 1500,
      };
      const result = calculateReservationPrice({
        hourlyPrice: 1000,
        hours: 5,
        durationRules: [],
        durationDiscountEnabled: false,
        coupon: fixedCoupon,
        combinationMode: "best",
      });
      expect(result.couponDiscount).toBe(1500);
      expect(result.totalPrice).toBe(3500);
    });

    test("クーポンがnullの場合、クーポン割引なし", () => {
      const result = calculateReservationPrice({
        hourlyPrice: 1000,
        hours: 5,
        durationRules: [],
        durationDiscountEnabled: false,
        coupon: null,
        combinationMode: "best",
      });
      expect(result.couponDiscount).toBe(0);
      expect(result.appliedCoupon).toBeNull();
    });
  });

  describe('併用モード "best"（最もお得な割引のみ適用）', () => {
    test("長時間割引 > クーポン割引の場合、長時間割引のみ適用", () => {
      // 8時間: basePrice=8000
      // 長時間割引: 8000 * 20/100 = 1600
      // クーポン割引: (8000-1600) * 20/100 = 1280 → 長時間 > クーポン
      const result = calculateReservationPrice({
        hourlyPrice: 1000,
        hours: 8,
        durationRules: baseDurationRules,
        durationDiscountEnabled: true,
        coupon: baseCoupon,
        combinationMode: "best",
      });
      expect(result.durationDiscount).toBe(1600);
      expect(result.couponDiscount).toBe(0);
      expect(result.appliedDurationRule).toEqual({
        hours: 8,
        discountRate: 20,
      });
      expect(result.appliedCoupon).toBeNull();
      expect(result.totalPrice).toBe(6400);
    });

    test("クーポン割引 > 長時間割引の場合、クーポン割引のみ適用", () => {
      // 3時間: basePrice=3000
      // 長時間割引: 3000 * 5/100 = 150
      // クーポン割引(先に計算): (3000-150) * 20/100 = 570 → クーポン > 長時間
      const smallDurationRules: DurationDiscountRule[] = [
        { hours: 3, discountRate: 5 },
      ];
      const bigCoupon = {
        ...baseCoupon,
        type: "PERCENTAGE" as const,
        discountValue: 20,
      };
      const result = calculateReservationPrice({
        hourlyPrice: 1000,
        hours: 3,
        durationRules: smallDurationRules,
        durationDiscountEnabled: true,
        coupon: bigCoupon,
        combinationMode: "best",
      });
      expect(result.durationDiscount).toBe(0);
      expect(result.couponDiscount).toBe(570);
      expect(result.appliedDurationRule).toBeNull();
      expect(result.appliedCoupon).not.toBeNull();
    });

    test("bestモードで両方割引ありの場合、警告メッセージが追加される", () => {
      const result = calculateReservationPrice({
        hourlyPrice: 1000,
        hours: 8,
        durationRules: baseDurationRules,
        durationDiscountEnabled: true,
        coupon: baseCoupon,
        combinationMode: "best",
        showWarning: true,
      });
      expect(result.warnings).toContain(
        "より大きな割引が自動的に適用されました",
      );
    });

    test("showWarningがfalseの場合、警告メッセージなし", () => {
      const result = calculateReservationPrice({
        hourlyPrice: 1000,
        hours: 8,
        durationRules: baseDurationRules,
        durationDiscountEnabled: true,
        coupon: baseCoupon,
        combinationMode: "best",
        showWarning: false,
      });
      expect(result.warnings).toEqual([]);
    });

    test("片方だけ割引がある場合、併用モードは影響しない", () => {
      // 長時間割引のみ（クーポンなし）
      const result = calculateReservationPrice({
        hourlyPrice: 1000,
        hours: 8,
        durationRules: baseDurationRules,
        durationDiscountEnabled: true,
        combinationMode: "best",
      });
      expect(result.durationDiscount).toBe(1600);
      expect(result.couponDiscount).toBe(0);
      expect(result.warnings).toEqual([]);
    });
  });

  describe('併用モード "both"（両方適用）', () => {
    test("canCombineWithDurationDiscountがtrueの場合、両方適用", () => {
      const combinableCoupon = {
        ...baseCoupon,
        canCombineWithDurationDiscount: true,
      };
      const result = calculateReservationPrice({
        hourlyPrice: 1000,
        hours: 8,
        durationRules: baseDurationRules,
        durationDiscountEnabled: true,
        coupon: combinableCoupon,
        combinationMode: "both",
      });
      // basePrice=8000, 長時間=8000*20/100=1600, クーポン=(8000-1600)*20/100=1280
      expect(result.durationDiscount).toBe(1600);
      expect(result.couponDiscount).toBe(1280);
      expect(result.totalPrice).toBe(5120); // 8000 - 1600 - 1280
    });

    test("canCombineWithDurationDiscountがfalseの場合、クーポン優先で長時間割引は無効", () => {
      const nonCombinableCoupon = {
        ...baseCoupon,
        canCombineWithDurationDiscount: false,
      };
      const result = calculateReservationPrice({
        hourlyPrice: 1000,
        hours: 8,
        durationRules: baseDurationRules,
        durationDiscountEnabled: true,
        coupon: nonCombinableCoupon,
        combinationMode: "both",
      });
      expect(result.durationDiscount).toBe(0);
      expect(result.appliedDurationRule).toBeNull();
      expect(result.couponDiscount).toBeGreaterThan(0);
    });

    test("併用不可クーポンの場合、警告メッセージが追加される", () => {
      const nonCombinableCoupon = {
        ...baseCoupon,
        canCombineWithDurationDiscount: false,
      };
      const result = calculateReservationPrice({
        hourlyPrice: 1000,
        hours: 8,
        durationRules: baseDurationRules,
        durationDiscountEnabled: true,
        coupon: nonCombinableCoupon,
        combinationMode: "both",
        showWarning: true,
      });
      expect(result.warnings).toContain(
        "このクーポンは他の割引と併用できません",
      );
    });

    test("併用可能で両方適用される場合、情報メッセージが追加される", () => {
      const combinableCoupon = {
        ...baseCoupon,
        canCombineWithDurationDiscount: true,
      };
      const result = calculateReservationPrice({
        hourlyPrice: 1000,
        hours: 8,
        durationRules: baseDurationRules,
        durationDiscountEnabled: true,
        coupon: combinableCoupon,
        combinationMode: "both",
        showWarning: true,
      });
      expect(result.warnings).toContain(
        "長時間割引とクーポン割引が両方適用されています",
      );
    });
  });

  describe("スペース割引 + 長時間割引の組み合わせ", () => {
    test("スペース割引適用後の価格に長時間割引が計算される", () => {
      // basePrice=5000, スペース割引=500(10%), 長時間割引=(5000-500)*10/100=450
      const result = calculateReservationPrice({
        hourlyPrice: 1000,
        hours: 5,
        durationRules: baseDurationRules,
        durationDiscountEnabled: true,
        spaceDiscount: {
          discountType: "percentage",
          discountValue: 10,
          durationDiscountOverride: "inherit",
        },
        combinationMode: "best",
      });
      expect(result.basePrice).toBe(5000);
      expect(result.spaceDiscount).toBe(500);
      expect(result.durationDiscount).toBe(450); // (5000-500)*10/100
      expect(result.totalPrice).toBe(4050); // 5000 - 500 - 450
    });
  });

  describe("全割引の組み合わせ", () => {
    test("スペース割引 + 長時間割引 + クーポン（bothモード・併用可能）", () => {
      const combinableCoupon = {
        ...baseCoupon,
        canCombineWithDurationDiscount: true,
      };
      const result = calculateReservationPrice({
        hourlyPrice: 1000,
        hours: 8,
        durationRules: baseDurationRules,
        durationDiscountEnabled: true,
        spaceDiscount: {
          discountType: "fixed",
          discountValue: 500,
          durationDiscountOverride: "inherit",
        },
        coupon: combinableCoupon,
        combinationMode: "both",
      });
      // basePrice=8000
      // スペース割引=500
      // 長時間割引=(8000-500)*20/100 = floor(7500*0.2) = 1500
      // クーポン=(8000-500-1500)*20/100 = floor(6000*0.2) = 1200
      expect(result.basePrice).toBe(8000);
      expect(result.spaceDiscount).toBe(500);
      expect(result.durationDiscount).toBe(1500);
      expect(result.couponDiscount).toBe(1200);
      expect(result.totalPrice).toBe(4800); // 8000-500-1500-1200
    });
  });

  describe("割引率計算", () => {
    test("割引率が正しく計算される", () => {
      const result = calculateReservationPrice({
        hourlyPrice: 1000,
        hours: 5,
        durationRules: baseDurationRules,
        durationDiscountEnabled: true,
        combinationMode: "best",
      });
      // basePrice=5000, durationDiscount=500, totalDiscountRate=10%
      expect(result.totalDiscountRate).toBe(10);
    });

    test("基本料金が0の場合、割引率は0", () => {
      const result = calculateReservationPrice({
        hourlyPrice: 0,
        hours: 5,
        durationRules: [],
        durationDiscountEnabled: false,
        combinationMode: "best",
      });
      expect(result.totalDiscountRate).toBe(0);
    });

    test("割引率が四捨五入される", () => {
      // basePrice=3000, 定額クーポン500 → 500/3000*100 = 16.666... → round = 17
      const fixedCoupon = {
        ...baseCoupon,
        type: "FIXED_AMOUNT" as const,
        discountValue: 500,
      };
      const result = calculateReservationPrice({
        hourlyPrice: 1000,
        hours: 3,
        durationRules: [],
        durationDiscountEnabled: false,
        coupon: fixedCoupon,
        combinationMode: "best",
      });
      expect(result.totalDiscountRate).toBe(17);
    });
  });

  describe("エッジケース", () => {
    test("最終価格がマイナスにならない（0が下限）", () => {
      // 大きな固定割引クーポンで過剰割引を試みる
      const bigCoupon = {
        ...baseCoupon,
        type: "FIXED_AMOUNT" as const,
        discountValue: 99999,
      };
      const result = calculateReservationPrice({
        hourlyPrice: 100,
        hours: 1,
        durationRules: [],
        durationDiscountEnabled: false,
        spaceDiscount: {
          discountType: "fixed",
          discountValue: 50,
          durationDiscountOverride: "inherit",
        },
        coupon: bigCoupon,
        combinationMode: "both",
      });
      // basePrice=100, spaceDiscount=50, coupon=min(99999,50)=50
      // total=100-50-50=0
      expect(result.totalPrice).toBe(0);
    });

    test("時間単価が0の場合", () => {
      const result = calculateReservationPrice({
        hourlyPrice: 0,
        hours: 5,
        durationRules: baseDurationRules,
        durationDiscountEnabled: true,
        combinationMode: "best",
      });
      expect(result.basePrice).toBe(0);
      expect(result.totalPrice).toBe(0);
      expect(result.durationDiscount).toBe(0);
    });

    test("spaceDiscountがundefinedの場合", () => {
      const result = calculateReservationPrice({
        hourlyPrice: 1000,
        hours: 3,
        durationRules: [],
        durationDiscountEnabled: false,
        combinationMode: "best",
      });
      expect(result.spaceDiscount).toBe(0);
      expect(result.appliedSpaceDiscount).toBeNull();
    });

    test("showWarningデフォルトはtrue", () => {
      const result = calculateReservationPrice({
        hourlyPrice: 1000,
        hours: 8,
        durationRules: baseDurationRules,
        durationDiscountEnabled: true,
        coupon: baseCoupon,
        combinationMode: "best",
        // showWarning省略（デフォルト=true）
      });
      // bestモードで両方割引ありなので警告あり
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });
});

// =============================================================================
// バリデーションヘルパー
// =============================================================================

describe("validateDurationDiscountRules", () => {
  test("有効なルール配列を検証する", () => {
    const rules = [
      { hours: 3, discountRate: 5 },
      { hours: 5, discountRate: 10 },
    ];
    const result = validateDurationDiscountRules(rules);
    expect(result.valid).toBe(true);
    expect(result.rules).toEqual(rules);
    expect(result.error).toBeUndefined();
  });

  test("空配列は有効", () => {
    const result = validateDurationDiscountRules([]);
    expect(result.valid).toBe(true);
    expect(result.rules).toEqual([]);
  });

  test("配列でない値は無効", () => {
    const result = validateDurationDiscountRules("not an array");
    expect(result.valid).toBe(false);
    expect(result.rules).toEqual([]);
    expect(result.error).toBe("割引ルールは配列である必要があります");
  });

  test("nullは無効", () => {
    const result = validateDurationDiscountRules(null);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("割引ルールは配列である必要があります");
  });

  test("undefinedは無効", () => {
    const result = validateDurationDiscountRules(undefined);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("割引ルールは配列である必要があります");
  });

  test("オブジェクトでないルールは無効", () => {
    const result = validateDurationDiscountRules([123]);
    expect(result.valid).toBe(false);
    expect(result.error).toBe(
      "各ルールは hours と discountRate を持つ必要があります",
    );
  });

  test("nullのルールは無効", () => {
    const result = validateDurationDiscountRules([null]);
    expect(result.valid).toBe(false);
    expect(result.error).toBe(
      "各ルールは hours と discountRate を持つ必要があります",
    );
  });

  test("hoursが数値でないルールは無効", () => {
    const result = validateDurationDiscountRules([
      { hours: "three", discountRate: 5 },
    ]);
    expect(result.valid).toBe(false);
    expect(result.error).toBe(
      "各ルールは hours と discountRate を持つ必要があります",
    );
  });

  test("discountRateが数値でないルールは無効", () => {
    const result = validateDurationDiscountRules([
      { hours: 3, discountRate: "five" },
    ]);
    expect(result.valid).toBe(false);
    expect(result.error).toBe(
      "各ルールは hours と discountRate を持つ必要があります",
    );
  });

  test("hoursが0以下は無効", () => {
    const result = validateDurationDiscountRules([
      { hours: 0, discountRate: 5 },
    ]);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("時間は0より大きい必要があります");

    const result2 = validateDurationDiscountRules([
      { hours: -1, discountRate: 5 },
    ]);
    expect(result2.valid).toBe(false);
    expect(result2.error).toBe("時間は0より大きい必要があります");
  });

  test("discountRateが0未満は無効", () => {
    const result = validateDurationDiscountRules([
      { hours: 3, discountRate: -1 },
    ]);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("割引率は0〜100の範囲で指定してください");
  });

  test("discountRateが100超は無効", () => {
    const result = validateDurationDiscountRules([
      { hours: 3, discountRate: 101 },
    ]);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("割引率は0〜100の範囲で指定してください");
  });

  test("discountRateが0は有効", () => {
    const result = validateDurationDiscountRules([
      { hours: 3, discountRate: 0 },
    ]);
    expect(result.valid).toBe(true);
    expect(result.rules).toEqual([{ hours: 3, discountRate: 0 }]);
  });

  test("discountRateが100は有効", () => {
    const result = validateDurationDiscountRules([
      { hours: 3, discountRate: 100 },
    ]);
    expect(result.valid).toBe(true);
    expect(result.rules).toEqual([{ hours: 3, discountRate: 100 }]);
  });

  test("複数ルールの途中に無効なルールがあれば全体が無効", () => {
    const rules = [
      { hours: 3, discountRate: 5 },
      { hours: -1, discountRate: 10 }, // 無効
      { hours: 8, discountRate: 20 },
    ];
    const result = validateDurationDiscountRules(rules);
    expect(result.valid).toBe(false);
    expect(result.rules).toEqual([]);
  });

  test("余分なプロパティは無視してhours/discountRateのみ抽出する", () => {
    const rules = [{ hours: 3, discountRate: 5, extra: "ignored" }];
    const result = validateDurationDiscountRules(rules);
    expect(result.valid).toBe(true);
    expect(result.rules).toEqual([{ hours: 3, discountRate: 5 }]);
  });
});

describe("parseDurationDiscountRules", () => {
  test("有効なルールをパースする", () => {
    const rules = [
      { hours: 3, discountRate: 5 },
      { hours: 5, discountRate: 10 },
    ];
    const result = parseDurationDiscountRules(rules);
    expect(result).toEqual(rules);
  });

  test("無効な入力は空配列を返す", () => {
    expect(parseDurationDiscountRules(null)).toEqual([]);
    expect(parseDurationDiscountRules("invalid")).toEqual([]);
    expect(
      parseDurationDiscountRules([{ hours: -1, discountRate: 5 }]),
    ).toEqual([]);
  });

  test("空配列はそのまま返す", () => {
    expect(parseDurationDiscountRules([])).toEqual([]);
  });
});

// =============================================================================
// フォーマットヘルパー
// =============================================================================

describe("formatDiscountAmount", () => {
  test("パーセント割引をフォーマットする", () => {
    expect(formatDiscountAmount("PERCENTAGE", 20)).toBe("20%OFF");
    expect(formatDiscountAmount("PERCENTAGE", 5)).toBe("5%OFF");
    expect(formatDiscountAmount("PERCENTAGE", 100)).toBe("100%OFF");
  });

  test("定額割引をフォーマットする", () => {
    expect(formatDiscountAmount("FIXED_AMOUNT", 1000)).toBe("¥1,000OFF");
    expect(formatDiscountAmount("FIXED_AMOUNT", 500)).toBe("¥500OFF");
    expect(formatDiscountAmount("FIXED_AMOUNT", 10000)).toBe("¥10,000OFF");
  });

  test("0円の定額割引をフォーマットする", () => {
    expect(formatDiscountAmount("FIXED_AMOUNT", 0)).toBe("¥0OFF");
  });

  test("0%のパーセント割引をフォーマットする", () => {
    expect(formatDiscountAmount("PERCENTAGE", 0)).toBe("0%OFF");
  });
});

describe("formatDiscountSummary", () => {
  test("割引なしの場合、空配列を返す", () => {
    const calculation: PriceCalculation = {
      basePrice: 5000,
      spaceDiscount: 0,
      durationDiscount: 0,
      couponDiscount: 0,
      totalPrice: 5000,
      totalDiscountRate: 0,
      appliedSpaceDiscount: null,
      appliedDurationRule: null,
      appliedCoupon: null,
      warnings: [],
    };
    expect(formatDiscountSummary(calculation)).toEqual([]);
  });

  test("スペースパーセント割引のサマリーを返す", () => {
    const calculation: PriceCalculation = {
      basePrice: 10000,
      spaceDiscount: 1000,
      durationDiscount: 0,
      couponDiscount: 0,
      totalPrice: 9000,
      totalDiscountRate: 10,
      appliedSpaceDiscount: { type: "percentage", value: 10 },
      appliedDurationRule: null,
      appliedCoupon: null,
      warnings: [],
    };
    const result = formatDiscountSummary(calculation);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("スペース割引（10%OFF）: -¥1,000");
  });

  test("スペース定額割引のサマリーを返す", () => {
    const calculation: PriceCalculation = {
      basePrice: 10000,
      spaceDiscount: 500,
      durationDiscount: 0,
      couponDiscount: 0,
      totalPrice: 9500,
      totalDiscountRate: 5,
      appliedSpaceDiscount: { type: "fixed", value: 500 },
      appliedDurationRule: null,
      appliedCoupon: null,
      warnings: [],
    };
    const result = formatDiscountSummary(calculation);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("スペース割引（¥500OFF）: -¥500");
  });

  test("長時間割引のサマリーを返す", () => {
    const calculation: PriceCalculation = {
      basePrice: 10000,
      spaceDiscount: 0,
      durationDiscount: 2000,
      couponDiscount: 0,
      totalPrice: 8000,
      totalDiscountRate: 20,
      appliedSpaceDiscount: null,
      appliedDurationRule: { hours: 8, discountRate: 20 },
      appliedCoupon: null,
      warnings: [],
    };
    const result = formatDiscountSummary(calculation);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("長時間割引（8時間以上）: -¥2,000");
  });

  test("クーポン割引のサマリーを返す（パーセント）", () => {
    const calculation: PriceCalculation = {
      basePrice: 10000,
      spaceDiscount: 0,
      durationDiscount: 0,
      couponDiscount: 2000,
      totalPrice: 8000,
      totalDiscountRate: 20,
      appliedSpaceDiscount: null,
      appliedDurationRule: null,
      appliedCoupon: {
        id: "c1",
        code: "SAVE20",
        name: "20%割引クーポン",
        type: "PERCENTAGE",
        discountValue: 20,
      },
      warnings: [],
    };
    const result = formatDiscountSummary(calculation);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("クーポン「SAVE20」20%OFF: -¥2,000");
  });

  test("クーポン割引のサマリーを返す（定額）", () => {
    const calculation: PriceCalculation = {
      basePrice: 10000,
      spaceDiscount: 0,
      durationDiscount: 0,
      couponDiscount: 1500,
      totalPrice: 8500,
      totalDiscountRate: 15,
      appliedSpaceDiscount: null,
      appliedDurationRule: null,
      appliedCoupon: {
        id: "c2",
        code: "FLAT1500",
        name: "1500円割引",
        type: "FIXED_AMOUNT",
        discountValue: 1500,
      },
      warnings: [],
    };
    const result = formatDiscountSummary(calculation);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("クーポン「FLAT1500」¥1,500OFF: -¥1,500");
  });

  test("複数割引のサマリーを返す", () => {
    const calculation: PriceCalculation = {
      basePrice: 10000,
      spaceDiscount: 1000,
      durationDiscount: 1800,
      couponDiscount: 1440,
      totalPrice: 5760,
      totalDiscountRate: 42,
      appliedSpaceDiscount: { type: "percentage", value: 10 },
      appliedDurationRule: { hours: 8, discountRate: 20 },
      appliedCoupon: {
        id: "c1",
        code: "SAVE20",
        name: "20%クーポン",
        type: "PERCENTAGE",
        discountValue: 20,
      },
      warnings: [],
    };
    const result = formatDiscountSummary(calculation);
    expect(result).toHaveLength(3);
    expect(result[0]).toContain("スペース割引");
    expect(result[1]).toContain("長時間割引");
    expect(result[2]).toContain("クーポン");
  });
});

// =============================================================================
// 税関連 型ガード & デフォルト値
// =============================================================================

describe("isValidTaxRateType", () => {
  test("有効な値で true を返す", () => {
    expect(isValidTaxRateType("standard")).toBe(true);
    expect(isValidTaxRateType("reduced")).toBe(true);
  });

  test("無効な文字列で false を返す", () => {
    expect(isValidTaxRateType("invalid")).toBe(false);
    expect(isValidTaxRateType("STANDARD")).toBe(false);
    expect(isValidTaxRateType("")).toBe(false);
  });

  test("文字列以外で false を返す", () => {
    expect(isValidTaxRateType(null)).toBe(false);
    expect(isValidTaxRateType(undefined)).toBe(false);
    expect(isValidTaxRateType(10)).toBe(false);
  });
});

describe("getValidTaxRateType", () => {
  test("有効な値をそのまま返す", () => {
    expect(getValidTaxRateType("standard")).toBe("standard");
    expect(getValidTaxRateType("reduced")).toBe("reduced");
  });

  test('無効な値でデフォルト "standard" を返す', () => {
    expect(getValidTaxRateType("invalid")).toBe("standard");
    expect(getValidTaxRateType(null)).toBe("standard");
    expect(getValidTaxRateType(undefined)).toBe("standard");
  });

  test("カスタムデフォルト値を返す", () => {
    expect(getValidTaxRateType(null, "reduced")).toBe("reduced");
  });
});

describe("isValidTaxDisplayMode", () => {
  test("有効な値で true を返す", () => {
    expect(isValidTaxDisplayMode("tax_excluded")).toBe(true);
    expect(isValidTaxDisplayMode("tax_included")).toBe(true);
    expect(isValidTaxDisplayMode("both")).toBe(true);
  });

  test("無効な値で false を返す", () => {
    expect(isValidTaxDisplayMode("invalid")).toBe(false);
    expect(isValidTaxDisplayMode("")).toBe(false);
    expect(isValidTaxDisplayMode(null)).toBe(false);
  });
});

describe("getValidTaxDisplayMode", () => {
  test("有効な値をそのまま返す", () => {
    expect(getValidTaxDisplayMode("tax_excluded")).toBe("tax_excluded");
    expect(getValidTaxDisplayMode("tax_included")).toBe("tax_included");
    expect(getValidTaxDisplayMode("both")).toBe("both");
  });

  test('無効な値でデフォルト "both" を返す', () => {
    expect(getValidTaxDisplayMode("invalid")).toBe("both");
    expect(getValidTaxDisplayMode(null)).toBe("both");
    expect(getValidTaxDisplayMode(undefined)).toBe("both");
  });

  test("カスタムデフォルト値を返す", () => {
    expect(getValidTaxDisplayMode(null, "tax_included")).toBe("tax_included");
  });
});

describe("isValidTaxInputMode", () => {
  test("有効な値で true を返す", () => {
    expect(isValidTaxInputMode("tax_excluded")).toBe(true);
    expect(isValidTaxInputMode("tax_included")).toBe(true);
  });

  test("無効な値で false を返す", () => {
    expect(isValidTaxInputMode("both")).toBe(false);
    expect(isValidTaxInputMode("invalid")).toBe(false);
    expect(isValidTaxInputMode(null)).toBe(false);
  });
});

describe("getValidTaxInputMode", () => {
  test("有効な値をそのまま返す", () => {
    expect(getValidTaxInputMode("tax_excluded")).toBe("tax_excluded");
    expect(getValidTaxInputMode("tax_included")).toBe("tax_included");
  });

  test('無効な値でデフォルト "tax_excluded" を返す', () => {
    expect(getValidTaxInputMode("invalid")).toBe("tax_excluded");
    expect(getValidTaxInputMode(null)).toBe("tax_excluded");
    expect(getValidTaxInputMode(undefined)).toBe("tax_excluded");
  });

  test("カスタムデフォルト値を返す", () => {
    expect(getValidTaxInputMode(null, "tax_included")).toBe("tax_included");
  });
});

// =============================================================================
// 税計算関数
// =============================================================================

describe("DEFAULT_TAX_SETTINGS", () => {
  test("デフォルト税設定が正しい", () => {
    expect(DEFAULT_TAX_SETTINGS.standardRate).toBe(10);
    expect(DEFAULT_TAX_SETTINGS.reducedRate).toBe(8);
    expect(DEFAULT_TAX_SETTINGS.displayModeAdmin).toBe("both");
    expect(DEFAULT_TAX_SETTINGS.displayModePublic).toBe("tax_included");
    expect(DEFAULT_TAX_SETTINGS.inputMode).toBe("tax_excluded");
  });
});

describe("getTaxRate", () => {
  test("標準税率を返す", () => {
    expect(getTaxRate("standard")).toBe(10);
  });

  test("軽減税率を返す", () => {
    expect(getTaxRate("reduced")).toBe(8);
  });

  test("カスタム設定の標準税率を返す", () => {
    const customSettings: TaxSettings = {
      ...DEFAULT_TAX_SETTINGS,
      standardRate: 15,
      reducedRate: 5,
    };
    expect(getTaxRate("standard", customSettings)).toBe(15);
    expect(getTaxRate("reduced", customSettings)).toBe(5);
  });
});

describe("calculateTaxIncludedPrice", () => {
  test("税抜1000円、税率10%で税込1100円", () => {
    expect(calculateTaxIncludedPrice(1000, 10)).toBe(1100);
  });

  test("税抜1000円、税率8%で税込1080円", () => {
    expect(calculateTaxIncludedPrice(1000, 8)).toBe(1080);
  });

  test("端数が四捨五入される", () => {
    // 999 * 1.10 = 1098.9 → round = 1099
    expect(calculateTaxIncludedPrice(999, 10)).toBe(1099);
  });

  test("税率0%の場合、価格はそのまま", () => {
    expect(calculateTaxIncludedPrice(1000, 0)).toBe(1000);
  });

  test("価格0の場合、0を返す", () => {
    expect(calculateTaxIncludedPrice(0, 10)).toBe(0);
  });

  test("大きな金額も正しく計算する", () => {
    // 100000 * 1.10 = 110000
    expect(calculateTaxIncludedPrice(100000, 10)).toBe(110000);
  });
});

describe("calculateTaxExcludedPrice", () => {
  test("税込1100円、税率10%で税抜1000円", () => {
    expect(calculateTaxExcludedPrice(1100, 10)).toBe(1000);
  });

  test("税込1080円、税率8%で税抜1000円", () => {
    expect(calculateTaxExcludedPrice(1080, 8)).toBe(1000);
  });

  test("端数が四捨五入される", () => {
    // 1099 / 1.10 = 999.0909... → round = 999
    expect(calculateTaxExcludedPrice(1099, 10)).toBe(999);
  });

  test("税率0%の場合、価格はそのまま", () => {
    expect(calculateTaxExcludedPrice(1000, 0)).toBe(1000);
  });

  test("価格0の場合、0を返す", () => {
    expect(calculateTaxExcludedPrice(0, 10)).toBe(0);
  });
});

describe("calculateTaxAmount", () => {
  test("税抜1000円、税率10%で税額100円", () => {
    expect(calculateTaxAmount(1000, 10)).toBe(100);
  });

  test("税抜1000円、税率8%で税額80円", () => {
    expect(calculateTaxAmount(1000, 8)).toBe(80);
  });

  test("端数が四捨五入される", () => {
    // 999 * 10/100 = 99.9 → round = 100
    expect(calculateTaxAmount(999, 10)).toBe(100);

    // 1001 * 10/100 = 100.1 → round = 100
    expect(calculateTaxAmount(1001, 10)).toBe(100);
  });

  test("税率0%の場合、税額は0", () => {
    expect(calculateTaxAmount(1000, 0)).toBe(0);
  });

  test("価格0の場合、税額は0", () => {
    expect(calculateTaxAmount(0, 10)).toBe(0);
  });
});

describe("税計算の往復変換", () => {
  test("税抜→税込→税抜で元の値に戻る（端数なし）", () => {
    const taxExcluded = 1000;
    const taxIncluded = calculateTaxIncludedPrice(taxExcluded, 10);
    const roundTrip = calculateTaxExcludedPrice(taxIncluded, 10);
    expect(roundTrip).toBe(taxExcluded);
  });

  test("税額 + 税抜 = 税込", () => {
    const price = 5000;
    const rate = 10;
    const taxAmount = calculateTaxAmount(price, rate);
    const taxIncluded = calculateTaxIncludedPrice(price, rate);
    expect(price + taxAmount).toBe(taxIncluded);
  });
});

// =============================================================================
// 価格フォーマット
// =============================================================================

describe("formatPrice", () => {
  test("通貨記号付きでフォーマットする（デフォルト）", () => {
    expect(formatPrice(1000)).toBe("¥1,000");
    expect(formatPrice(0)).toBe("¥0");
    expect(formatPrice(100000)).toBe("¥100,000");
  });

  test("通貨記号なしでフォーマットする", () => {
    expect(formatPrice(1000, { showCurrency: false })).toBe("1,000");
  });

  test("税ラベル付きでフォーマットする", () => {
    expect(formatPrice(1000, { showTaxLabel: true, taxLabel: "税込" })).toBe(
      "¥1,000（税込）",
    );
    expect(formatPrice(1000, { showTaxLabel: true, taxLabel: "税抜" })).toBe(
      "¥1,000（税抜）",
    );
  });

  test("税ラベル表示がtrueでもtaxLabelがない場合、ラベルなし", () => {
    expect(formatPrice(1000, { showTaxLabel: true })).toBe("¥1,000");
  });

  test("showTaxLabelがfalseの場合、taxLabelは表示されない", () => {
    expect(formatPrice(1000, { showTaxLabel: false, taxLabel: "税込" })).toBe(
      "¥1,000",
    );
  });

  test("全オプション指定", () => {
    expect(
      formatPrice(5000, {
        showCurrency: true,
        showTaxLabel: true,
        taxLabel: "税込",
      }),
    ).toBe("¥5,000（税込）");
  });

  test("通貨記号なし + 税ラベル付き", () => {
    expect(
      formatPrice(5000, {
        showCurrency: false,
        showTaxLabel: true,
        taxLabel: "税抜",
      }),
    ).toBe("5,000（税抜）");
  });
});

describe("formatPriceWithTax", () => {
  test("税抜表示モード", () => {
    const result = formatPriceWithTax({
      taxExcludedPrice: 1000,
      taxRate: 10,
      displayMode: "tax_excluded",
    });
    expect(result).toBe("¥1,000（税抜）");
  });

  test("税込表示モード", () => {
    const result = formatPriceWithTax({
      taxExcludedPrice: 1000,
      taxRate: 10,
      displayMode: "tax_included",
    });
    expect(result).toBe("¥1,100（税込）");
  });

  test("両方表示モード", () => {
    const result = formatPriceWithTax({
      taxExcludedPrice: 1000,
      taxRate: 10,
      displayMode: "both",
    });
    expect(result).toBe("¥1,100（税込）/ ¥1,000（税抜）");
  });

  test("軽減税率（8%）での表示", () => {
    const result = formatPriceWithTax({
      taxExcludedPrice: 1000,
      taxRate: 8,
      displayMode: "tax_included",
    });
    expect(result).toBe("¥1,080（税込）");
  });

  test("0円の場合", () => {
    const result = formatPriceWithTax({
      taxExcludedPrice: 0,
      taxRate: 10,
      displayMode: "both",
    });
    expect(result).toBe("¥0（税込）/ ¥0（税抜）");
  });

  test("大きな金額の場合", () => {
    const result = formatPriceWithTax({
      taxExcludedPrice: 100000,
      taxRate: 10,
      displayMode: "both",
    });
    expect(result).toBe("¥110,000（税込）/ ¥100,000（税抜）");
  });
});

describe("getTaxRateLabel", () => {
  test("標準税率のラベルを返す", () => {
    expect(getTaxRateLabel("standard", 10)).toBe("標準税率（10%）");
  });

  test("軽減税率のラベルを返す", () => {
    expect(getTaxRateLabel("reduced", 8)).toBe("軽減税率（8%）");
  });

  test("カスタム税率でもラベルを返す", () => {
    expect(getTaxRateLabel("standard", 15)).toBe("標準税率（15%）");
    expect(getTaxRateLabel("reduced", 5)).toBe("軽減税率（5%）");
  });
});
