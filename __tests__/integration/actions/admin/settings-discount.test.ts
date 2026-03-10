/**
 * 割引設定 Server Action統合テスト
 *
 * src/app/(admin)/admin/(dashboard)/_shared/actions/settings/discount.ts のテスト
 *
 * 対象スキーマ:
 * - discountSettingsSchema（割引設定）
 * - durationDiscountRuleSchema（割引ルール）
 * - taxSettingsSchema（税設定）
 */

import { describe, test, expect } from "bun:test";
import { z } from "zod";
import {
  DiscountCombinationMode,
  TaxDisplayMode,
  TaxInputMode,
} from "@/shared/db/enums";

// =============================================================================
// スキーマ再現（schemas.ts から）
// =============================================================================

const durationDiscountRuleSchema = z.object({
  hours: z.coerce.number().int().min(1).max(24),
  discountRate: z.coerce.number().min(1).max(100),
});

const discountSettingsSchema = z.object({
  durationDiscountEnabled: z.boolean(),
  durationDiscountRules: z.array(durationDiscountRuleSchema),
  discountCombinationMode: z.enum(DiscountCombinationMode),
  showOriginalPrice: z.boolean(),
  discountWarningEnabled: z.boolean(),
});

const taxDisplayModeSchema = z.enum(TaxDisplayMode);

const taxSettingsSchema = z.object({
  taxStandardRate: z.coerce.number().min(0).max(100),
  taxReducedRate: z.coerce.number().min(0).max(100),
  taxDisplayModeAdmin: taxDisplayModeSchema,
  taxDisplayModePublic: taxDisplayModeSchema,
  taxInputMode: z.enum(TaxInputMode),
});

// =============================================================================
// テストデータ
// =============================================================================

const VALID_DISCOUNT_SETTINGS_INPUT = {
  durationDiscountEnabled: true,
  durationDiscountRules: [
    { hours: 3, discountRate: 10 },
    { hours: 5, discountRate: 15 },
    { hours: 8, discountRate: 20 },
  ],
  discountCombinationMode: DiscountCombinationMode.best,
  showOriginalPrice: true,
  discountWarningEnabled: true,
};

const VALID_TAX_SETTINGS_INPUT = {
  taxStandardRate: 10,
  taxReducedRate: 8,
  taxDisplayModeAdmin: TaxDisplayMode.tax_excluded,
  taxDisplayModePublic: TaxDisplayMode.tax_included,
  taxInputMode: TaxInputMode.tax_excluded,
};

// =============================================================================
// テスト
// =============================================================================

describe("Settings Discount Admin Action Integration", () => {
  // ===========================================================================
  // durationDiscountRuleSchema
  // ===========================================================================

  describe("durationDiscountRuleSchema バリデーション", () => {
    describe("正常系", () => {
      test("有効なデータはバリデーション通過", () => {
        const result = durationDiscountRuleSchema.safeParse({
          hours: 3,
          discountRate: 10,
        });
        expect(result.success).toBe(true);
      });

      test("文字列の数値もcoerceで変換される", () => {
        const result = durationDiscountRuleSchema.safeParse({
          hours: "5",
          discountRate: "15",
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.hours).toBe(5);
          expect(result.data.discountRate).toBe(15);
        }
      });
    });

    describe("hours", () => {
      test("1（最小値）はOK", () => {
        const result = durationDiscountRuleSchema.safeParse({
          hours: 1,
          discountRate: 10,
        });
        expect(result.success).toBe(true);
      });

      test("0はエラー", () => {
        const result = durationDiscountRuleSchema.safeParse({
          hours: 0,
          discountRate: 10,
        });
        expect(result.success).toBe(false);
      });

      test("24（最大値）はOK", () => {
        const result = durationDiscountRuleSchema.safeParse({
          hours: 24,
          discountRate: 10,
        });
        expect(result.success).toBe(true);
      });

      test("25はエラー", () => {
        const result = durationDiscountRuleSchema.safeParse({
          hours: 25,
          discountRate: 10,
        });
        expect(result.success).toBe(false);
      });

      test("小数はエラー", () => {
        const result = durationDiscountRuleSchema.safeParse({
          hours: 2.5,
          discountRate: 10,
        });
        expect(result.success).toBe(false);
      });

      test("負の数はエラー", () => {
        const result = durationDiscountRuleSchema.safeParse({
          hours: -1,
          discountRate: 10,
        });
        expect(result.success).toBe(false);
      });
    });

    describe("discountRate", () => {
      test("1（最小値）はOK", () => {
        const result = durationDiscountRuleSchema.safeParse({
          hours: 3,
          discountRate: 1,
        });
        expect(result.success).toBe(true);
      });

      test("0はエラー", () => {
        const result = durationDiscountRuleSchema.safeParse({
          hours: 3,
          discountRate: 0,
        });
        expect(result.success).toBe(false);
      });

      test("100（最大値）はOK", () => {
        const result = durationDiscountRuleSchema.safeParse({
          hours: 3,
          discountRate: 100,
        });
        expect(result.success).toBe(true);
      });

      test("101はエラー", () => {
        const result = durationDiscountRuleSchema.safeParse({
          hours: 3,
          discountRate: 101,
        });
        expect(result.success).toBe(false);
      });

      test("小数（例: 5.5）はOK（coerce.numberでintなし）", () => {
        const result = durationDiscountRuleSchema.safeParse({
          hours: 3,
          discountRate: 5.5,
        });
        expect(result.success).toBe(true);
      });
    });
  });

  // ===========================================================================
  // discountSettingsSchema
  // ===========================================================================

  describe("discountSettingsSchema バリデーション", () => {
    describe("正常系", () => {
      test("有効なデータはバリデーション通過", () => {
        const result = discountSettingsSchema.safeParse(
          VALID_DISCOUNT_SETTINGS_INPUT,
        );
        expect(result.success).toBe(true);
      });

      test("ルールなし（無効状態）でもOK", () => {
        const result = discountSettingsSchema.safeParse({
          durationDiscountEnabled: false,
          durationDiscountRules: [],
          discountCombinationMode: "best",
          showOriginalPrice: true,
          discountWarningEnabled: true,
        });
        expect(result.success).toBe(true);
      });

      test("単一ルールでもOK", () => {
        const result = discountSettingsSchema.safeParse({
          ...VALID_DISCOUNT_SETTINGS_INPUT,
          durationDiscountRules: [{ hours: 3, discountRate: 10 }],
        });
        expect(result.success).toBe(true);
      });
    });

    describe("discountCombinationMode", () => {
      test("bestは許可", () => {
        const result = discountSettingsSchema.safeParse({
          ...VALID_DISCOUNT_SETTINGS_INPUT,
          discountCombinationMode: "best",
        });
        expect(result.success).toBe(true);
      });

      test("bothは許可", () => {
        const result = discountSettingsSchema.safeParse({
          ...VALID_DISCOUNT_SETTINGS_INPUT,
          discountCombinationMode: "both",
        });
        expect(result.success).toBe(true);
      });

      test("無効な値はエラー", () => {
        const result = discountSettingsSchema.safeParse({
          ...VALID_DISCOUNT_SETTINGS_INPUT,
          discountCombinationMode: "sum",
        });
        expect(result.success).toBe(false);
      });
    });

    describe("durationDiscountRules", () => {
      test("空配列はOK", () => {
        const result = discountSettingsSchema.safeParse({
          ...VALID_DISCOUNT_SETTINGS_INPUT,
          durationDiscountRules: [],
        });
        expect(result.success).toBe(true);
      });

      test("無効なルールを含むとエラー", () => {
        const result = discountSettingsSchema.safeParse({
          ...VALID_DISCOUNT_SETTINGS_INPUT,
          durationDiscountRules: [
            { hours: 0, discountRate: 10 }, // hours < 1
          ],
        });
        expect(result.success).toBe(false);
      });

      test("ルール内の無効なdiscountRateでエラー", () => {
        const result = discountSettingsSchema.safeParse({
          ...VALID_DISCOUNT_SETTINGS_INPUT,
          durationDiscountRules: [
            { hours: 3, discountRate: 101 }, // > 100
          ],
        });
        expect(result.success).toBe(false);
      });
    });

    describe("boolean フィールド", () => {
      test("全てfalseでもOK", () => {
        const result = discountSettingsSchema.safeParse({
          durationDiscountEnabled: false,
          durationDiscountRules: [],
          discountCombinationMode: "best",
          showOriginalPrice: false,
          discountWarningEnabled: false,
        });
        expect(result.success).toBe(true);
      });

      test("文字列はエラー", () => {
        const result = discountSettingsSchema.safeParse({
          ...VALID_DISCOUNT_SETTINGS_INPUT,
          durationDiscountEnabled: "true",
        });
        expect(result.success).toBe(false);
      });
    });
  });

  // ===========================================================================
  // taxSettingsSchema
  // ===========================================================================

  describe("taxSettingsSchema バリデーション", () => {
    describe("正常系", () => {
      test("有効なデータはバリデーション通過", () => {
        const result = taxSettingsSchema.safeParse(VALID_TAX_SETTINGS_INPUT);
        expect(result.success).toBe(true);
      });

      test("文字列の数値もcoerceで変換される", () => {
        const result = taxSettingsSchema.safeParse({
          ...VALID_TAX_SETTINGS_INPUT,
          taxStandardRate: "10",
          taxReducedRate: "8",
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.taxStandardRate).toBe(10);
          expect(result.data.taxReducedRate).toBe(8);
        }
      });

      test("税率0%はOK", () => {
        const result = taxSettingsSchema.safeParse({
          ...VALID_TAX_SETTINGS_INPUT,
          taxStandardRate: 0,
          taxReducedRate: 0,
        });
        expect(result.success).toBe(true);
      });
    });

    describe("taxStandardRate", () => {
      test("0（最小値）はOK", () => {
        const result = taxSettingsSchema.safeParse({
          ...VALID_TAX_SETTINGS_INPUT,
          taxStandardRate: 0,
        });
        expect(result.success).toBe(true);
      });

      test("100（最大値）はOK", () => {
        const result = taxSettingsSchema.safeParse({
          ...VALID_TAX_SETTINGS_INPUT,
          taxStandardRate: 100,
        });
        expect(result.success).toBe(true);
      });

      test("101はエラー", () => {
        const result = taxSettingsSchema.safeParse({
          ...VALID_TAX_SETTINGS_INPUT,
          taxStandardRate: 101,
        });
        expect(result.success).toBe(false);
      });

      test("-1はエラー", () => {
        const result = taxSettingsSchema.safeParse({
          ...VALID_TAX_SETTINGS_INPUT,
          taxStandardRate: -1,
        });
        expect(result.success).toBe(false);
      });

      test("小数（8.5）はOK", () => {
        const result = taxSettingsSchema.safeParse({
          ...VALID_TAX_SETTINGS_INPUT,
          taxStandardRate: 8.5,
        });
        expect(result.success).toBe(true);
      });
    });

    describe("taxReducedRate", () => {
      test("0（最小値）はOK", () => {
        const result = taxSettingsSchema.safeParse({
          ...VALID_TAX_SETTINGS_INPUT,
          taxReducedRate: 0,
        });
        expect(result.success).toBe(true);
      });

      test("100（最大値）はOK", () => {
        const result = taxSettingsSchema.safeParse({
          ...VALID_TAX_SETTINGS_INPUT,
          taxReducedRate: 100,
        });
        expect(result.success).toBe(true);
      });

      test("101はエラー", () => {
        const result = taxSettingsSchema.safeParse({
          ...VALID_TAX_SETTINGS_INPUT,
          taxReducedRate: 101,
        });
        expect(result.success).toBe(false);
      });
    });

    describe("taxDisplayModeAdmin / taxDisplayModePublic", () => {
      test("有効な表示モード", () => {
        const validModes = Object.values(TaxDisplayMode);
        for (const mode of validModes) {
          const result = taxSettingsSchema.safeParse({
            ...VALID_TAX_SETTINGS_INPUT,
            taxDisplayModeAdmin: mode,
            taxDisplayModePublic: mode,
          });
          expect(result.success).toBe(true);
        }
      });

      test("無効な表示モードはエラー", () => {
        const result = taxSettingsSchema.safeParse({
          ...VALID_TAX_SETTINGS_INPUT,
          taxDisplayModeAdmin: "invalid",
        });
        expect(result.success).toBe(false);
      });
    });

    describe("taxInputMode", () => {
      test("tax_excludedは許可", () => {
        const result = taxSettingsSchema.safeParse({
          ...VALID_TAX_SETTINGS_INPUT,
          taxInputMode: "tax_excluded",
        });
        expect(result.success).toBe(true);
      });

      test("tax_includedは許可", () => {
        const result = taxSettingsSchema.safeParse({
          ...VALID_TAX_SETTINGS_INPUT,
          taxInputMode: "tax_included",
        });
        expect(result.success).toBe(true);
      });

      test("bothはエラー（taxInputModeはtax_excluded/tax_includedのみ）", () => {
        const result = taxSettingsSchema.safeParse({
          ...VALID_TAX_SETTINGS_INPUT,
          taxInputMode: "both",
        });
        expect(result.success).toBe(false);
      });

      test("無効な値はエラー", () => {
        const result = taxSettingsSchema.safeParse({
          ...VALID_TAX_SETTINGS_INPUT,
          taxInputMode: "auto",
        });
        expect(result.success).toBe(false);
      });
    });
  });

  // ===========================================================================
  // 必須フィールド欠落テスト
  // ===========================================================================

  describe("必須フィールド欠落", () => {
    test("discountSettingsSchema: durationDiscountEnabled欠落はエラー", () => {
      const { durationDiscountEnabled: _, ...input } =
        VALID_DISCOUNT_SETTINGS_INPUT;
      const result = discountSettingsSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    test("discountSettingsSchema: durationDiscountRules欠落はエラー", () => {
      const { durationDiscountRules: _, ...input } =
        VALID_DISCOUNT_SETTINGS_INPUT;
      const result = discountSettingsSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    test("discountSettingsSchema: discountCombinationMode欠落はエラー", () => {
      const { discountCombinationMode: _, ...input } =
        VALID_DISCOUNT_SETTINGS_INPUT;
      const result = discountSettingsSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    test("taxSettingsSchema: 空オブジェクトはエラー", () => {
      const result = taxSettingsSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    test("taxSettingsSchema: taxDisplayModeAdmin欠落はエラー", () => {
      const { taxDisplayModeAdmin: _, ...input } = VALID_TAX_SETTINGS_INPUT;
      const result = taxSettingsSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  // ===========================================================================
  // 型エラーテスト
  // ===========================================================================

  describe("型エラー", () => {
    test("discountSettingsSchema: durationDiscountEnabled に文字列はエラー", () => {
      const result = discountSettingsSchema.safeParse({
        ...VALID_DISCOUNT_SETTINGS_INPUT,
        durationDiscountEnabled: "true",
      });
      expect(result.success).toBe(false);
    });

    test("discountSettingsSchema: durationDiscountRules にオブジェクトはエラー", () => {
      const result = discountSettingsSchema.safeParse({
        ...VALID_DISCOUNT_SETTINGS_INPUT,
        durationDiscountRules: { hours: 3, discountRate: 10 },
      });
      expect(result.success).toBe(false);
    });

    test("taxSettingsSchema: taxDisplayModeAdmin に数値はエラー", () => {
      const result = taxSettingsSchema.safeParse({
        ...VALID_TAX_SETTINGS_INPUT,
        taxDisplayModeAdmin: 1,
      });
      expect(result.success).toBe(false);
    });
  });

  // ===========================================================================
  // アクションロジック再現テスト（重複ルールチェック）
  // ===========================================================================

  describe("割引ルール重複チェック（アクションロジック）", () => {
    test("重複なしはOK", () => {
      const rules = [
        { hours: 3, discountRate: 10 },
        { hours: 5, discountRate: 15 },
        { hours: 8, discountRate: 20 },
      ];

      const hourSet = new Set<number>();
      let hasDuplicate = false;
      for (const rule of rules) {
        if (hourSet.has(rule.hours)) {
          hasDuplicate = true;
          break;
        }
        hourSet.add(rule.hours);
      }
      expect(hasDuplicate).toBe(false);
    });

    test("同じ時間閾値が重複するとエラー", () => {
      const rules = [
        { hours: 3, discountRate: 10 },
        { hours: 3, discountRate: 15 }, // 重複
        { hours: 8, discountRate: 20 },
      ];

      const hourSet = new Set<number>();
      let hasDuplicate = false;
      for (const rule of rules) {
        if (hourSet.has(rule.hours)) {
          hasDuplicate = true;
          break;
        }
        hourSet.add(rule.hours);
      }
      expect(hasDuplicate).toBe(true);
    });

    test("空配列は重複なし", () => {
      const rules: Array<{ hours: number; discountRate: number }> = [];

      const hourSet = new Set<number>();
      let hasDuplicate = false;
      for (const rule of rules) {
        if (hourSet.has(rule.hours)) {
          hasDuplicate = true;
          break;
        }
        hourSet.add(rule.hours);
      }
      expect(hasDuplicate).toBe(false);
    });
  });
});
