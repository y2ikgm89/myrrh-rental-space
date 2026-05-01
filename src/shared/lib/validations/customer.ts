import { z } from "zod";
import {
  CustomerStatus,
  CustomerType,
} from "@/shared/lib/validations/enums/prisma-types";

// =============================================================================
// Customer Schemas
// =============================================================================

/**
 * 顧客作成・編集フォーム用スキーマ
 * コンポーネント・Server Actions両方で使用
 */
export const customerFormSchema = z.object({
  customerType: z.enum(CustomerType).default(CustomerType.PERSONAL),
  lastName: z
    .string()
    .min(1, { error: "姓は必須です" })
    .max(50, { error: "姓は50文字以内で入力してください" }),
  firstName: z
    .string()
    .min(1, { error: "名は必須です" })
    .max(50, { error: "名は50文字以内で入力してください" }),
  lastNameKana: z
    .string()
    .max(50, { error: "セイは50文字以内で入力してください" })
    .optional()
    .or(z.literal("")),
  firstNameKana: z
    .string()
    .max(50, { error: "メイは50文字以内で入力してください" })
    .optional()
    .or(z.literal("")),
  companyName: z
    .string()
    .max(100, { error: "会社名は100文字以内で入力してください" })
    .optional()
    .or(z.literal("")),
  email: z.string().email({ error: "有効なメールアドレスを入力してください" }),
  phoneNumber: z
    .string()
    .max(20, { error: "電話番号は20文字以内で入力してください" })
    .regex(/^[\d\-+() ]+$/, {
      error: "電話番号は数字・ハイフン・+・括弧・空白のみ使用できます",
    })
    .optional()
    .or(z.literal("")),
  postalCode: z
    .string()
    .regex(/^\d{3}-?\d{4}$/, {
      error: "郵便番号は 123-4567 または 1234567 の形式で入力してください",
    })
    .optional()
    .or(z.literal("")),
  prefecture: z
    .string()
    .max(10, { error: "都道府県は10文字以内で入力してください" })
    .optional()
    .or(z.literal("")),
  city: z
    .string()
    .max(100, { error: "市区町村は100文字以内で入力してください" })
    .optional()
    .or(z.literal("")),
  streetAddress: z
    .string()
    .max(200, { error: "町名・番地は200文字以内で入力してください" })
    .optional()
    .or(z.literal("")),
  building: z
    .string()
    .max(200, { error: "建物名は200文字以内で入力してください" })
    .optional()
    .or(z.literal("")),
  notes: z
    .string()
    .max(2000, { error: "メモは2000文字以内で入力してください" })
    .optional()
    .or(z.literal("")),
  marketingOptIn: z.boolean().default(false),
  phoneContactOptIn: z.boolean().default(true),
});

/**
 * 顧客フォーム入力型
 */
export type CustomerFormInput = z.input<typeof customerFormSchema>;

/**
 * 顧客フォームデータ型（バリデーション後）
 */
export type CustomerFormData = z.output<typeof customerFormSchema>;

/**
 * 顧客ステータス更新スキーマ
 */
export const updateCustomerStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(CustomerStatus),
});

export type UpdateCustomerStatusInput = z.infer<
  typeof updateCustomerStatusSchema
>;

/**
 * 顧客メモ更新スキーマ
 */
export const updateCustomerNotesSchema = z.object({
  id: z.string().uuid(),
  notes: z.string().max(2000).nullable(),
});

export type UpdateCustomerNotesInput = z.infer<
  typeof updateCustomerNotesSchema
>;
