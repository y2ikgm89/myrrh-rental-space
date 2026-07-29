/**
 * 税設定のZodスキーマ
 *
 * 割引設定のフォーム検証は `form-schemas-security-integrations.ts` の
 * `discountFormSchema` が担う（conform 経路）。ここは `taxSettingsSchema`
 * （`tax.ts` アクションが直接 conform スキーマとして使用）のみを定義する。
 */

import { z } from "zod";
import { TaxDisplayMode } from "@/shared/lib/validations/enums/prisma-types";
import { settingsExpectedUpdatedAtSchema } from "./form-schema-helpers";

// =============================================================================
// Tax Schemas
// =============================================================================

export const taxDisplayModeSchema = z.enum(TaxDisplayMode);

export const taxSettingsSchema = z.object({
  taxStandardRate: z.coerce.number().int().min(0).max(100),
  taxReducedRate: z.coerce.number().int().min(0).max(100),
  taxDisplayModePublic: taxDisplayModeSchema,
  expectedUpdatedAt: settingsExpectedUpdatedAtSchema,
});

export type TaxSettingsInput = z.infer<typeof taxSettingsSchema>;
