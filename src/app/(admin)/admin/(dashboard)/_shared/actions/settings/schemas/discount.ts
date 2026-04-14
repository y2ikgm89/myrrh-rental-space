/**
 * 割引・税設定のZodスキーマ
 */

import { z } from "zod";
import {
  DiscountCombinationMode,
  TaxDisplayMode,
  TaxInputMode,
} from "@/shared/lib/validations/enums/prisma-types";

// =============================================================================
// Discount Schemas
// =============================================================================

export const durationDiscountRuleSchema = z.object({
  hours: z.coerce.number().int().min(1).max(24),
  discountRate: z.coerce.number().min(1).max(100),
});

export const discountSettingsSchema = z.object({
  durationDiscountEnabled: z.boolean(),
  // hours は割引マップのキーとして機能するため、重複を禁止する
  durationDiscountRules: z
    .array(durationDiscountRuleSchema)
    .refine(
      (rules) => new Set(rules.map((r) => r.hours)).size === rules.length,
      { error: "同じ時間数の割引ルールを複数登録することはできません" },
    ),
  discountCombinationMode: z.enum(DiscountCombinationMode),
  showOriginalPrice: z.boolean(),
  discountWarningEnabled: z.boolean(),
});

export type DurationDiscountRuleInput = z.infer<
  typeof durationDiscountRuleSchema
>;
export type DiscountSettingsInput = z.infer<typeof discountSettingsSchema>;

// =============================================================================
// Tax Schemas
// =============================================================================

export const taxDisplayModeSchema = z.enum(TaxDisplayMode);

export const taxSettingsSchema = z.object({
  taxStandardRate: z.coerce.number().min(0).max(100),
  taxReducedRate: z.coerce.number().min(0).max(100),
  taxDisplayModeAdmin: taxDisplayModeSchema,
  taxDisplayModePublic: taxDisplayModeSchema,
  taxInputMode: z.enum(TaxInputMode),
});

export type TaxSettingsInput = z.infer<typeof taxSettingsSchema>;
