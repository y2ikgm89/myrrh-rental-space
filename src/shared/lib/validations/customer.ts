import { z } from "zod";
import { CustomerStatus } from "@/shared/db/enums";

// =============================================================================
// Customer Schemas
// =============================================================================

/**
 * 顧客作成・編集フォーム用スキーマ
 * コンポーネント・Server Actions両方で使用
 */
export const customerFormSchema = z.object({
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
  email: z.string().email({ error: "有効なメールアドレスを入力してください" }),
  phoneNumber: z
    .string()
    .max(20, { error: "電話番号は20文字以内で入力してください" })
    .optional()
    .or(z.literal("")),
  address: z
    .string()
    .max(500, { error: "住所は500文字以内で入力してください" })
    .optional()
    .or(z.literal("")),
  notes: z
    .string()
    .max(2000, { error: "メモは2000文字以内で入力してください" })
    .optional()
    .or(z.literal("")),
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
