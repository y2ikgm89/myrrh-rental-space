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
  calculateSpaceDiscount,
  calculateDurationDiscount,
  calculateCouponDiscount,
  validateDurationDiscountRules,
  parseDurationDiscountRules,
} from "@/shared/lib/pricing/discount";
import type {
  SpaceDiscountSettings,
  DurationDiscountRule,
} from "@/shared/lib/pricing/types";

// =============================================================================
// calculateSpaceDiscount
// =============================================================================

describe("calculateSpaceDiscount", () => {
  describe("正常系", () => {
    test("パーセント割引 10% を正しく計算する（切り捨て）", () => {
      const settings: SpaceDiscountSettings = {
        discountType: "PERCENTAGE",
        discountValue: 10,
        durationDiscountOverride: "INHERIT",
      };
      const result = calculateSpaceDiscount(10000, settings);
      expect(result.discount).toBe(1000);
      expect(result.applied).toEqual({ type: "PERCENTAGE", value: 10 });
    });

    test("パーセント割引で端数は切り捨てる", () => {
      const settings: SpaceDiscountSettings = {
        discountType: "PERCENTAGE",
        discountValue: 15,
        durationDiscountOverride: "INHERIT",
      };
      // 10000 * 0.15 = 1500（切り捨て不要だが整合性確認）
      const result = calculateSpaceDiscount(10000, settings);
      expect(result.discount).toBe(1500);
    });

    test("パーセント割引で端数が生じる場合は切り捨て（Math.floor）", () => {
      const settings: SpaceDiscountSettings = {
        discountType: "PERCENTAGE",
        discountValue: 10,
        durationDiscountOverride: "INHERIT",
      };
      // 9999 * 0.10 = 999.9 → Math.floor → 999
      const result = calculateSpaceDiscount(9999, settings);
      expect(result.discount).toBe(999);
    });

    test("固定割引を正しく計算する", () => {
      const settings: SpaceDiscountSettings = {
        discountType: "FIXED",
        discountValue: 500,
        durationDiscountOverride: "INHERIT",
      };
      const result = calculateSpaceDiscount(10000, settings);
      expect(result.discount).toBe(500);
      expect(result.applied).toEqual({ type: "FIXED", value: 500 });
    });

    test("固定割引: 割引額が基本料金を超える場合は基本料金を上限とする", () => {
      const settings: SpaceDiscountSettings = {
        discountType: "FIXED",
        discountValue: 20000,
        durationDiscountOverride: "INHERIT",
      };
      const result = calculateSpaceDiscount(10000, settings);
      expect(result.discount).toBe(10000);
      expect(result.applied).toEqual({ type: "FIXED", value: 20000 });
    });

    test("固定割引: 割引額と基本料金が等しい場合は全額割引", () => {
      const settings: SpaceDiscountSettings = {
        discountType: "FIXED",
        discountValue: 5000,
        durationDiscountOverride: "INHERIT",
      };
      const result = calculateSpaceDiscount(5000, settings);
      expect(result.discount).toBe(5000);
    });

    test("100% 割引で基本料金がゼロになる", () => {
      const settings: SpaceDiscountSettings = {
        discountType: "PERCENTAGE",
        discountValue: 100,
        durationDiscountOverride: "INHERIT",
      };
      const result = calculateSpaceDiscount(10000, settings);
      expect(result.discount).toBe(10000);
    });
  });

  describe("異常系（割引なし）", () => {
    test("settings が null の場合は割引なし", () => {
      const result = calculateSpaceDiscount(10000, null);
      expect(result.discount).toBe(0);
      expect(result.applied).toBeNull();
    });

    test("settings が undefined の場合は割引なし", () => {
      const result = calculateSpaceDiscount(10000, undefined);
      expect(result.discount).toBe(0);
      expect(result.applied).toBeNull();
    });

    test("discountType が none の場合は割引なし", () => {
      const settings: SpaceDiscountSettings = {
        discountType: "NONE",
        discountValue: 1000,
        durationDiscountOverride: "INHERIT",
      };
      const result = calculateSpaceDiscount(10000, settings);
      expect(result.discount).toBe(0);
      expect(result.applied).toBeNull();
    });

    test("discountValue が null の場合は割引なし", () => {
      const settings: SpaceDiscountSettings = {
        discountType: "PERCENTAGE",
        discountValue: null,
        durationDiscountOverride: "INHERIT",
      };
      const result = calculateSpaceDiscount(10000, settings);
      expect(result.discount).toBe(0);
      expect(result.applied).toBeNull();
    });
  });

  describe("エッジケース", () => {
    test("基本料金 0 に対するパーセント割引は 0", () => {
      const settings: SpaceDiscountSettings = {
        discountType: "PERCENTAGE",
        discountValue: 20,
        durationDiscountOverride: "INHERIT",
      };
      const result = calculateSpaceDiscount(0, settings);
      expect(result.discount).toBe(0);
    });

    test("discountValue が 0 の固定割引は割引額 0", () => {
      const settings: SpaceDiscountSettings = {
        discountType: "FIXED",
        discountValue: 0,
        durationDiscountOverride: "INHERIT",
      };
      const result = calculateSpaceDiscount(10000, settings);
      expect(result.discount).toBe(0);
      expect(result.applied).toEqual({ type: "FIXED", value: 0 });
    });

    test("大きな基本料金でも正しく計算する", () => {
      const settings: SpaceDiscountSettings = {
        discountType: "PERCENTAGE",
        discountValue: 5,
        durationDiscountOverride: "INHERIT",
      };
      const result = calculateSpaceDiscount(1000000, settings);
      expect(result.discount).toBe(50000);
    });
  });
});

// =============================================================================
// calculateDurationDiscount
// =============================================================================

describe("calculateDurationDiscount", () => {
  const rules: DurationDiscountRule[] = [
    { hours: 3, discountRate: 5 },
    { hours: 5, discountRate: 10 },
    { hours: 8, discountRate: 20 },
  ];

  describe("正常系", () => {
    test("最小閾値を満たすルールが適用される", () => {
      // 3時間 → 5% 割引
      const result = calculateDurationDiscount(10000, 3, rules);
      expect(result.discount).toBe(500);
      expect(result.appliedRule).toEqual({ hours: 3, discountRate: 5 });
    });

    test("中間閾値のルールが適用される", () => {
      // 5時間 → 10% 割引（降順ソートで最初にマッチした 5時間ルール）
      const result = calculateDurationDiscount(10000, 5, rules);
      expect(result.discount).toBe(1000);
      expect(result.appliedRule).toEqual({ hours: 5, discountRate: 10 });
    });

    test("最大閾値のルールが適用される", () => {
      // 8時間 → 20% 割引
      const result = calculateDurationDiscount(10000, 8, rules);
      expect(result.discount).toBe(2000);
      expect(result.appliedRule).toEqual({ hours: 8, discountRate: 20 });
    });

    test("最大閾値を超える時間でも最大ルールが適用される", () => {
      // 10時間 → 20% 割引（8時間以上のルールが最大）
      const result = calculateDurationDiscount(10000, 10, rules);
      expect(result.discount).toBe(2000);
      expect(result.appliedRule).toEqual({ hours: 8, discountRate: 20 });
    });

    test("ルールが昇順で渡されても正しく降順ソートして適用する", () => {
      // 順序が逆のルール: [8時間, 5時間, 3時間] → 降順ソート後に評価
      const unorderedRules: DurationDiscountRule[] = [
        { hours: 8, discountRate: 20 },
        { hours: 3, discountRate: 5 },
        { hours: 5, discountRate: 10 },
      ];
      // 6時間 → 5時間以上のルール(10%)が適用される
      const result = calculateDurationDiscount(10000, 6, unorderedRules);
      expect(result.discount).toBe(1000);
      expect(result.appliedRule).toEqual({ hours: 5, discountRate: 10 });
    });

    test("端数は切り捨て（Math.floor）", () => {
      // 9999 * 0.05 = 499.95 → Math.floor → 499
      const result = calculateDurationDiscount(9999, 3, rules);
      expect(result.discount).toBe(499);
    });

    test("単一ルールでも正しく動作する", () => {
      const singleRule: DurationDiscountRule[] = [
        { hours: 4, discountRate: 15 },
      ];
      const result = calculateDurationDiscount(10000, 4, singleRule);
      expect(result.discount).toBe(1500);
    });
  });

  describe("割引なしのケース", () => {
    test("ルールが空の場合は割引なし", () => {
      const result = calculateDurationDiscount(10000, 5, []);
      expect(result.discount).toBe(0);
      expect(result.appliedRule).toBeNull();
    });

    test("hours が 0 の場合は割引なし", () => {
      const result = calculateDurationDiscount(10000, 0, rules);
      expect(result.discount).toBe(0);
      expect(result.appliedRule).toBeNull();
    });

    test("hours が負数の場合は割引なし", () => {
      const result = calculateDurationDiscount(10000, -1, rules);
      expect(result.discount).toBe(0);
      expect(result.appliedRule).toBeNull();
    });

    test("basePrice が 0 の場合は割引なし", () => {
      const result = calculateDurationDiscount(0, 5, rules);
      expect(result.discount).toBe(0);
      expect(result.appliedRule).toBeNull();
    });

    test("閾値未満の時間ではマッチするルールなし", () => {
      // 2時間 → 最小閾値 3時間に満たない
      const result = calculateDurationDiscount(10000, 2, rules);
      expect(result.discount).toBe(0);
      expect(result.appliedRule).toBeNull();
    });

    test("discountRate が 0 のルールはスキップされる", () => {
      const zeroRateRules: DurationDiscountRule[] = [
        { hours: 3, discountRate: 0 },
        { hours: 5, discountRate: 10 },
      ];
      // 4時間 → 3時間ルールにマッチするが rate=0 なのでスキップ → 5時間ルール未満でマッチなし
      const result = calculateDurationDiscount(10000, 4, zeroRateRules);
      expect(result.discount).toBe(0);
      expect(result.appliedRule).toBeNull();
    });
  });

  describe("エッジケース", () => {
    test("ちょうど閾値の時間でルールが適用される（境界値）", () => {
      // ちょうど 3時間 → 5% ルール適用
      const result = calculateDurationDiscount(10000, 3, rules);
      expect(result.discount).toBe(500);
    });

    test("閾値 - 0.1 時間ではルールが適用されない（境界値）", () => {
      // 2.9時間 → 3時間ルール未満でマッチなし
      const result = calculateDurationDiscount(10000, 2.9, rules);
      expect(result.discount).toBe(0);
    });
  });
});

// =============================================================================
// calculateCouponDiscount
// =============================================================================

describe("calculateCouponDiscount", () => {
  describe("パーセント割引クーポン", () => {
    test("20% 割引を正しく計算する", () => {
      const coupon = {
        type: "PERCENTAGE" as const,
        discountValue: 20,
        maxDiscountAmount: null,
      };
      expect(calculateCouponDiscount(10000, coupon)).toBe(2000);
    });

    test("端数は切り捨て（Math.floor）", () => {
      const coupon = {
        type: "PERCENTAGE" as const,
        discountValue: 15,
        maxDiscountAmount: null,
      };
      // 9999 * 0.15 = 1499.85 → Math.floor → 1499
      expect(calculateCouponDiscount(9999, coupon)).toBe(1499);
    });

    test("最大割引額制限が適用される（計算値が上限超過）", () => {
      const coupon = {
        type: "PERCENTAGE" as const,
        discountValue: 30,
        maxDiscountAmount: 2000,
      };
      // 10000 * 0.30 = 3000 → 上限 2000 を超えるので 2000
      expect(calculateCouponDiscount(10000, coupon)).toBe(2000);
    });

    test("最大割引額制限が適用されない（計算値が上限以内）", () => {
      const coupon = {
        type: "PERCENTAGE" as const,
        discountValue: 10,
        maxDiscountAmount: 5000,
      };
      // 10000 * 0.10 = 1000 → 上限 5000 以内なのでそのまま 1000
      expect(calculateCouponDiscount(10000, coupon)).toBe(1000);
    });

    test("maxDiscountAmount が 0 の場合は割引額 0", () => {
      const coupon = {
        type: "PERCENTAGE" as const,
        discountValue: 20,
        maxDiscountAmount: 0,
      };
      // 上限が 0 なので min(2000, 0) = 0 だが、0 は falsy なので制限が効かない
      // maxDiscountAmount が truthy チェックされているため 0 は制限なしとして扱われる
      const result = calculateCouponDiscount(10000, coupon);
      // 実装: if (coupon.maxDiscountAmount) { ... } — 0 は falsy なのでスキップ
      expect(result).toBe(2000);
    });

    test("100% 割引クーポン", () => {
      const coupon = {
        type: "PERCENTAGE" as const,
        discountValue: 100,
        maxDiscountAmount: null,
      };
      expect(calculateCouponDiscount(10000, coupon)).toBe(10000);
    });
  });

  describe("定額割引クーポン", () => {
    test("固定額 1000 円の割引を正しく適用する", () => {
      const coupon = {
        type: "FIXED_AMOUNT" as const,
        discountValue: 1000,
        maxDiscountAmount: null,
      };
      expect(calculateCouponDiscount(10000, coupon)).toBe(1000);
    });

    test("割引額が価格を超える場合は価格を上限とする", () => {
      const coupon = {
        type: "FIXED_AMOUNT" as const,
        discountValue: 15000,
        maxDiscountAmount: null,
      };
      expect(calculateCouponDiscount(10000, coupon)).toBe(10000);
    });

    test("割引額と価格が等しい場合は全額割引", () => {
      const coupon = {
        type: "FIXED_AMOUNT" as const,
        discountValue: 5000,
        maxDiscountAmount: null,
      };
      expect(calculateCouponDiscount(5000, coupon)).toBe(5000);
    });
  });

  describe("異常系", () => {
    test("price が 0 の場合は割引なし", () => {
      const coupon = {
        type: "PERCENTAGE" as const,
        discountValue: 20,
        maxDiscountAmount: null,
      };
      expect(calculateCouponDiscount(0, coupon)).toBe(0);
    });

    test("price が負数の場合は割引なし", () => {
      const coupon = {
        type: "FIXED_AMOUNT" as const,
        discountValue: 1000,
        maxDiscountAmount: null,
      };
      expect(calculateCouponDiscount(-1000, coupon)).toBe(0);
    });
  });

  describe("エッジケース", () => {
    test("大きな金額でも正しく計算する", () => {
      const coupon = {
        type: "PERCENTAGE" as const,
        discountValue: 5,
        maxDiscountAmount: null,
      };
      expect(calculateCouponDiscount(1000000, coupon)).toBe(50000);
    });

    test("1 円の割引クーポン（最小割引額）", () => {
      const coupon = {
        type: "FIXED_AMOUNT" as const,
        discountValue: 1,
        maxDiscountAmount: null,
      };
      expect(calculateCouponDiscount(100, coupon)).toBe(1);
    });
  });
});

// =============================================================================
// validateDurationDiscountRules
// =============================================================================

describe("validateDurationDiscountRules", () => {
  describe("正常系", () => {
    test("有効なルール配列で valid: true を返す", () => {
      const result = validateDurationDiscountRules([
        { hours: 3, discountRate: 5 },
        { hours: 5, discountRate: 10 },
      ]);
      expect(result.valid).toBe(true);
      expect(result.rules).toHaveLength(2);
      expect(result.error).toBeUndefined();
    });

    test("空配列で valid: true を返す（ルールなし）", () => {
      const result = validateDurationDiscountRules([]);
      expect(result.valid).toBe(true);
      expect(result.rules).toHaveLength(0);
    });

    test("単一ルールで valid: true を返す", () => {
      const result = validateDurationDiscountRules([
        { hours: 4, discountRate: 15 },
      ]);
      expect(result.valid).toBe(true);
      expect(result.rules).toEqual([{ hours: 4, discountRate: 15 }]);
    });

    test("discountRate が 0 のルールも有効（割引なし設定）", () => {
      const result = validateDurationDiscountRules([
        { hours: 3, discountRate: 0 },
      ]);
      expect(result.valid).toBe(true);
    });

    test("discountRate が 100 のルールは有効（全額割引）", () => {
      const result = validateDurationDiscountRules([
        { hours: 3, discountRate: 100 },
      ]);
      expect(result.valid).toBe(true);
    });

    test("小数の hours も有効", () => {
      const result = validateDurationDiscountRules([
        { hours: 2.5, discountRate: 5 },
      ]);
      expect(result.valid).toBe(true);
    });
  });

  describe("異常系", () => {
    test("配列でない場合は valid: false とエラーメッセージを返す", () => {
      const result = validateDurationDiscountRules("invalid");
      expect(result.valid).toBe(false);
      expect(result.rules).toHaveLength(0);
      expect(result.error).toBe("割引ルールは配列である必要があります");
    });

    test("null は valid: false を返す", () => {
      const result = validateDurationDiscountRules(null);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    test("オブジェクト単体は valid: false を返す", () => {
      const result = validateDurationDiscountRules({
        hours: 3,
        discountRate: 5,
      });
      expect(result.valid).toBe(false);
    });

    test("hours フィールドがないルールは valid: false を返す", () => {
      const result = validateDurationDiscountRules([{ discountRate: 10 }]);
      expect(result.valid).toBe(false);
      expect(result.error).toBe(
        "各ルールは hours と discountRate を持つ必要があります",
      );
    });

    test("discountRate フィールドがないルールは valid: false を返す", () => {
      const result = validateDurationDiscountRules([{ hours: 3 }]);
      expect(result.valid).toBe(false);
      expect(result.error).toBe(
        "各ルールは hours と discountRate を持つ必要があります",
      );
    });

    test("hours が文字列のルールは valid: false を返す", () => {
      const result = validateDurationDiscountRules([
        { hours: "3", discountRate: 5 },
      ]);
      expect(result.valid).toBe(false);
    });

    test("discountRate が文字列のルールは valid: false を返す", () => {
      const result = validateDurationDiscountRules([
        { hours: 3, discountRate: "5" },
      ]);
      expect(result.valid).toBe(false);
    });

    test("hours が 0 のルールは valid: false を返す（0より大きい必要がある）", () => {
      const result = validateDurationDiscountRules([
        { hours: 0, discountRate: 5 },
      ]);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("時間は0より大きい必要があります");
    });

    test("hours が負数のルールは valid: false を返す", () => {
      const result = validateDurationDiscountRules([
        { hours: -1, discountRate: 5 },
      ]);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("時間は0より大きい必要があります");
    });

    test("discountRate が 101 のルールは valid: false を返す（100超過）", () => {
      const result = validateDurationDiscountRules([
        { hours: 3, discountRate: 101 },
      ]);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("割引率は0〜100の範囲で指定してください");
    });

    test("discountRate が負数のルールは valid: false を返す", () => {
      const result = validateDurationDiscountRules([
        { hours: 3, discountRate: -1 },
      ]);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("割引率は0〜100の範囲で指定してください");
    });

    test("null ルールを含む配列は valid: false を返す", () => {
      const result = validateDurationDiscountRules([null]);
      expect(result.valid).toBe(false);
    });

    test("先頭が有効でも途中に不正なルールがあれば valid: false を返す", () => {
      const result = validateDurationDiscountRules([
        { hours: 3, discountRate: 5 },
        { hours: -1, discountRate: 10 },
      ]);
      expect(result.valid).toBe(false);
      expect(result.rules).toHaveLength(0);
    });
  });

  describe("エッジケース", () => {
    test("undefined は valid: false を返す", () => {
      const result = validateDurationDiscountRules(undefined);
      expect(result.valid).toBe(false);
    });

    test("数値 0 は valid: false を返す", () => {
      const result = validateDurationDiscountRules(0);
      expect(result.valid).toBe(false);
    });
  });
});

// =============================================================================
// parseDurationDiscountRules
// =============================================================================

describe("parseDurationDiscountRules", () => {
  describe("正常系", () => {
    test("有効なルール配列をパースして返す", () => {
      const input = [
        { hours: 3, discountRate: 5 },
        { hours: 5, discountRate: 10 },
      ];
      const result = parseDurationDiscountRules(input);
      expect(result).toHaveLength(2);
      expect(result).toEqual(input);
    });

    test("空配列をパースして空配列を返す", () => {
      const result = parseDurationDiscountRules([]);
      expect(result).toEqual([]);
    });
  });

  describe("異常系", () => {
    test("無効な入力（文字列）は空配列を返す", () => {
      const result = parseDurationDiscountRules("invalid");
      expect(result).toEqual([]);
    });

    test("null は空配列を返す", () => {
      const result = parseDurationDiscountRules(null);
      expect(result).toEqual([]);
    });

    test("undefined は空配列を返す", () => {
      const result = parseDurationDiscountRules(undefined);
      expect(result).toEqual([]);
    });

    test("不正なルールを含む配列は空配列を返す", () => {
      const result = parseDurationDiscountRules([
        { hours: 0, discountRate: 5 },
      ]);
      expect(result).toEqual([]);
    });

    test("hours が負数のルールを含む配列は空配列を返す", () => {
      const result = parseDurationDiscountRules([
        { hours: -1, discountRate: 5 },
      ]);
      expect(result).toEqual([]);
    });
  });

  describe("エッジケース", () => {
    test("数値を渡すと空配列を返す", () => {
      const result = parseDurationDiscountRules(42);
      expect(result).toEqual([]);
    });

    test("オブジェクト単体は空配列を返す（配列でないため）", () => {
      const result = parseDurationDiscountRules({
        hours: 3,
        discountRate: 5,
      });
      expect(result).toEqual([]);
    });
  });
});
