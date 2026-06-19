/**
 * 税設定のZodスキーマ
 *
 * 割引設定のフォーム検証は `form-schemas-security-integrations.ts` の
 * `discountFormSchema` が担う（conform 経路）。ここは `taxSettingsSchema`
 * （`tax.ts` アクションが直接 conform スキーマとして使用）のみを定義する。
 */

import { z } from "zod";
import { TaxDisplayMode } from "@/shared/lib/validations/enums/prisma-types";

// =============================================================================
// Tax Schemas
// =============================================================================

export const taxDisplayModeSchema = z.enum(TaxDisplayMode);

export const taxSettingsSchema = z.object({
  taxStandardRate: z.coerce.number().min(0).max(100),
  taxReducedRate: z.coerce.number().min(0).max(100),
  taxDisplayModeAdmin: taxDisplayModeSchema,
  taxDisplayModePublic: taxDisplayModeSchema,
});

export type TaxSettingsInput = z.infer<typeof taxSettingsSchema>;
