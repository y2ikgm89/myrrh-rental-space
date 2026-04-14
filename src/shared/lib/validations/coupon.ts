/**
 * クーポン関連のバリデーションスキーマ
 */

import { z } from "zod";
import { CouponType } from "@/shared/lib/validations/enums/prisma-types";

// =============================================================================
// Base Schemas
// =============================================================================

/**
 * クーポンコードのバリデーション
 * - 大文字英数字のみ
 * - 4〜20文字
 */
export const couponCodeSchema = z
  .string()
  .min(4, { error: "クーポンコードは4文字以上で入力してください" })
  .max(20, { error: "クーポンコードは20文字以内で入力してください" })
  .regex(/^[A-Z0-9]+$/, {
    error: "クーポンコードは大文字英数字のみ使用できます",
  })
  .transform((val) => val.toUpperCase());

/**
 * クーポンタイプ
 */
export const couponTypeSchema = z.enum(CouponType);

/**
 * 割引値のバリデーション（タイプに応じた範囲チェック）
 */
export const discountValueSchema = z.coerce
  .number()
  .positive({ error: "割引値は0より大きい必要があります" });

// =============================================================================
// Coupon Form Schema (Admin)
// =============================================================================

/**
 * クーポン作成・編集フォームのスキーマ
 */
export const couponFormSchema = z
  .object({
    code: couponCodeSchema,
    name: z
      .string()
      .min(1, { error: "名称を入力してください" })
      .max(100, { error: "名称は100文字以内で入力してください" }),
    description: z
      .string()
      .max(500, { error: "説明は500文字以内で入力してください" })
      .optional()
      .or(z.literal("")),
    type: couponTypeSchema,
    discountValue: discountValueSchema,
    minReservationAmount: z.coerce
      .number()
      .nonnegative({ error: "最低利用金額は0以上で入力してください" })
      .optional()
      .nullable(),
    maxDiscountAmount: z.coerce
      .number()
      .positive({ error: "最大割引額は0より大きい必要があります" })
      .optional()
      .nullable(),
    validFrom: z.coerce.date({ error: "有効開始日を入力してください" }),
    validUntil: z.coerce.date().optional().nullable(),
    usageLimit: z.coerce
      .number()
      .int({ error: "利用回数上限は整数で入力してください" })
      .positive({ error: "利用回数上限は1以上で入力してください" })
      .optional()
      .nullable(),
    isActive: z.boolean().default(true),
    canCombineWithDurationDiscount: z.boolean().default(true),
  })
  .refine(
    (data) => {
      // パーセント割引の場合、100%を超えないこと
      if (data.type === "PERCENTAGE" && data.discountValue > 100) {
        return false;
      }
      return true;
    },
    {
      error: "パーセント割引は100%以下で入力してください",
      path: ["discountValue"],
    },
  )
  .refine(
    (data) => {
      // 有効期限が開始日より後であること
      if (data.validUntil && data.validFrom > data.validUntil) {
        return false;
      }
      return true;
    },
    {
      error: "有効期限は開始日より後に設定してください",
      path: ["validUntil"],
    },
  );

export type CouponFormInput = z.input<typeof couponFormSchema>;
export type CouponFormOutput = z.output<typeof couponFormSchema>;

// =============================================================================
// Coupon Code Input Schema (Public)
// =============================================================================

/**
 * クーポンコード入力のスキーマ（公開ページ用）
 */
export const couponCodeInputSchema = z.object({
  code: couponCodeSchema,
});

export type CouponCodeInput = z.infer<typeof couponCodeInputSchema>;
