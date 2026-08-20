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
      .trim()
      .max(20, { error: "電話番号は20文字以内で入力してください" })
      .optional(),
    subject: z
      .string({ error: "件名は必須です" })
      .trim()
      .min(1, { error: "件名は必須です" })
      .max(200, { error: "件名は200文字以内で入力してください" }),
    message: z
      .string({ error: "お問い合わせ内容は必須です" })
      .trim()
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
    // formRenderTokenは表示から 3 秒未満の送信を弾く時間トラップ。サーバーが発行した purpose 付きトークンで、クライアントの時計は一切見ない（監査 F-71）。
    // どちらもZodではエラー化せずServer Action側のcheckBotHeuristicsで判定する
    // (validationエラーとして出すとbotに手がかりを与えるため)。
    website: z.string().optional(),
    formRenderToken: z.string().optional(),
  })
  .refine(requireCompanyNameForCorporate, COMPANY_NAME_REFINE_ERROR);

export type PublicInquiryInput = z.input<typeof publicInquirySchema>;

export const customerInquiryReplySchema = z.object({
  inquiryId: z.uuid({ error: "お問い合わせIDが不正です" }),
  // `.trim()` を挟まないと空白だけの返信が `.min(1)` を通り、
  // 見た目が空の返信が保存されて通知メールまで飛ぶ。
  body: z
    .string({ error: "返信内容を入力してください" })
    .trim()
    .min(1, { error: "返信内容を入力してください" })
    .max(5000, { error: "返信内容は5000文字以内で入力してください" }),
  turnstileToken: z.string().optional(),
});

export type CustomerInquiryReplyInput = z.input<
  typeof customerInquiryReplySchema
>;
