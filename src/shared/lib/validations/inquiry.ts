import { z } from "zod";

export const publicInquirySchema = z.object({
  name: z
    .string()
    .min(1, { error: "お名前は必須です" })
    .max(100, { error: "お名前は100文字以内で入力してください" }),
  email: z.string().email({ error: "有効なメールアドレスを入力してください" }),
  subject: z
    .string()
    .min(1, { error: "件名は必須です" })
    .max(200, { error: "件名は200文字以内で入力してください" }),
  message: z
    .string()
    .min(1, { error: "お問い合わせ内容は必須です" })
    .max(5000, { error: "お問い合わせ内容は5000文字以内で入力してください" }),
  turnstileToken: z.string().optional(),
});

export type PublicInquiryInput = z.input<typeof publicInquirySchema>;
