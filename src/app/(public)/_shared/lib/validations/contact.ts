import { z } from 'zod'

/**
 * お問い合わせフォーム用バリデーションスキーマ
 *
 * クライアント・サーバー両方で使用
 */
export const contactSchema = z.object({
  name: z
    .string()
    .min(1, { message: 'お名前を入力してください' })
    .max(100, { message: 'お名前は100文字以内で入力してください' }),
  email: z
    .string()
    .min(1, { message: 'メールアドレスを入力してください' })
    .email({ message: '有効なメールアドレスを入力してください' }),
  phone: z
    .string()
    .optional()
    .refine(
      (val) => !val || /^[0-9-]+$/.test(val),
      { message: '電話番号は数字とハイフンのみで入力してください' }
    )
    .refine(
      (val) => !val || val.length <= 20,
      { message: '電話番号は20文字以内で入力してください' }
    ),
  subject: z
    .string()
    .min(1, { message: '件名を入力してください' })
    .max(200, { message: '件名は200文字以内で入力してください' }),
  message: z
    .string()
    .min(1, { message: 'お問い合わせ内容を入力してください' })
    .max(5000, { message: 'お問い合わせ内容は5000文字以内で入力してください' }),
})

export type ContactInput = z.input<typeof contactSchema>
export type ContactData = z.output<typeof contactSchema>

/**
 * Server Action のレスポンス型
 */
export type ContactActionResult =
  | { success: true; message: string }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> }
