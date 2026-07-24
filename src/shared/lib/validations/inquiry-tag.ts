import { z } from "zod";

/**
 * お問い合わせタグマスタ（InquiryTag）バリデーションスキーマ
 *
 * `SpaceCategory` の color 正規表現 (`space-category.ts`) と同一パターン。
 */
export const inquiryTagFormSchema = z.object({
  name: z
    .string()
    .min(1, { error: "タグ名を入力してください" })
    .max(50, { error: "タグ名は50文字以内で入力してください" }),
  color: z
    .string()
    .regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, {
      error: "有効なカラーコードを入力してください",
    })
    .optional()
    .or(z.literal("")),
});

export type InquiryTagFormInput = z.input<typeof inquiryTagFormSchema>;
export type InquiryTagFormData = z.output<typeof inquiryTagFormSchema>;
