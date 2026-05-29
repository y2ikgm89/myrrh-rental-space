/**
 * クーポン関連のバリデーションスキーマ
 *
 * 設計方針:
 * - `validFrom` / `validUntil` は `<input type="datetime-local">` の value
 *   形式（`"YYYY-MM-DDTHH:mm"`）を受け取る `z.string().datetime({ local: true })` に統一
 *   （`zod-patterns/validation-schemas.md` §datetime-local input との連携）
 * - 受信した文字列は domain command 側で `parseDateTimeLocalAsJst()` を通して
 *   JST 固定で UTC Date に変換する（サーバ tz / ブラウザ tz に依存しない）
 */

import { z } from "zod";
import { parseDateTimeLocalAsJst } from "@/shared/lib/date-format";
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
 * base schema（refine 前 — `.extend()` / `.omit()` 可能な ZodObject）
 * Event の `eventFormBaseSchema` と同じ分離パターン。
 */
export const couponFormBaseSchema = z.object({
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
  // `local: true` は `<input type="datetime-local">` の値（"YYYY-MM-DDTHH:mm" / "...:ss"）
  // と full ISO（Z 付き）の両方を許容する Zod 4 公式オプション。
  // 実体（UTC Date）への変換は domain command 側で `parseDateTimeLocalAsJst` 経由で行う。
  validFrom: z
    .string()
    .datetime({ local: true, error: "有効開始日を入力してください" }),
  // 空欄 = 無期限。`<input type="datetime-local">` が未入力時 `""` を返すため
  // `.or(z.literal(""))` で許容、command 層で falsy 判定により null 化。
  validUntil: z
    .string()
    .datetime({ local: true, error: "有効な日時を入力してください" })
    .or(z.literal(""))
    .nullable()
    .optional(),
  usageLimit: z.coerce
    .number()
    .int({ error: "利用回数上限は整数で入力してください" })
    .positive({ error: "利用回数上限は1以上で入力してください" })
    .optional()
    .nullable(),
  isActive: z.boolean().default(true),
  canCombineWithDurationDiscount: z.boolean().default(true),
});

/**
 * cross-field validation を集約。base を破壊しないために `superRefine` を使う
 * （複数 `.refine()` の chain より公式推奨 — `zod-patterns/validation-schemas.md`）
 */
export const couponFormSchema = couponFormBaseSchema.superRefine(
  (data, ctx) => {
    // パーセント割引の場合、100%を超えないこと
    if (data.type === CouponType.PERCENTAGE && data.discountValue > 100) {
      ctx.addIssue({
        code: "custom",
        message: "パーセント割引は100%以下で入力してください",
        path: ["discountValue"],
      });
    }
    // 有効期限が開始日以降であること
    if (data.validUntil && data.validUntil !== "") {
      const from = parseDateTimeLocalAsJst(data.validFrom);
      const until = parseDateTimeLocalAsJst(data.validUntil);
      if (from > until) {
        ctx.addIssue({
          code: "custom",
          message: "有効期限は開始日より後に設定してください",
          path: ["validUntil"],
        });
      }
    }
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
