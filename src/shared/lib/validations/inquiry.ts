import { z } from "zod";
import {
  customerTypeSchema,
  companyNameSchema,
  requireCompanyNameForCorporate,
  COMPANY_NAME_REFINE_ERROR,
} from "./customer-type";
import {
  emailFieldSchema,
  personNameFieldSchema,
} from "./customer-shared-fields";

export { CustomerType } from "./customer-type";

export const publicInquirySchema = z
  .object({
    customerType: customerTypeSchema,
    companyName: companyNameSchema,
    lastName: personNameFieldSchema("姓"),
    firstName: personNameFieldSchema("名"),
    email: emailFieldSchema,
    phoneNumber: z
      .string()
      .max(20, { error: "電話番号は20文字以内で入力してください" })
      .optional(),
    subject: z
      .string()
      .min(1, { error: "件名は必須です" })
      .max(200, { error: "件名は200文字以内で入力してください" }),
    message: z
      .string()
      .min(1, { error: "お問い合わせ内容は必須です" })
      .max(5000, {
        error: "お問い合わせ内容は5000文字以内で入力してください",
      }),
    agreedTermsIds: z
      .array(z.uuid({ error: "規約IDが不正です" }))
      .default([])
      .refine((ids) => new Set(ids).size === ids.length, {
        error: "同じ規約に複数回同意することはできません",
      }),
    turnstileToken: z.string().optional(),
    // bot対策のhoneypotフィールド。フォームに実在しない項目("website")を装い、
    // botが機械的に埋めやすい名前にする(OWASP Automated Threats Handbook推奨)。
    // formRenderedAtは表示から3秒未満の送信を拒否する時間トラップ。
    // どちらもZodではエラー化せずServer Action側のcheckBotHeuristicsで判定する
    // (validationエラーとして出すとbotに手がかりを与えるため)。
    website: z.string().optional(),
    formRenderedAt: z.coerce.number().optional(),
  })
  .refine(requireCompanyNameForCorporate, COMPANY_NAME_REFINE_ERROR);

export type PublicInquiryInput = z.input<typeof publicInquirySchema>;

export const customerInquiryReplySchema = z.object({
  inquiryId: z.uuid({ error: "お問い合わせIDが不正です" }),
  // `.trim()` を挟まないと空白だけの返信が `.min(1)` を通り、
  // 見た目が空の返信が保存されて通知メールまで飛ぶ。
  body: z
    .string()
    .trim()
    .min(1, { error: "返信内容を入力してください" })
    .max(5000, { error: "返信内容は5000文字以内で入力してください" }),
  turnstileToken: z.string().optional(),
});

export type CustomerInquiryReplyInput = z.input<
  typeof customerInquiryReplySchema
>;
