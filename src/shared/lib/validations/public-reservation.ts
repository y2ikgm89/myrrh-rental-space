import { z } from "zod";
import { TIME_REGEX } from "./business-hours";
import {
  customerTypeSchema,
  companyNameSchema,
  requireCompanyNameForCorporate,
  COMPANY_NAME_REFINE_ERROR,
} from "./customer-type";
import {
  emailFieldSchema,
  optionalPhoneNumberSchema,
  personNameFieldSchema,
} from "./customer-shared-fields";

const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
  error: "日付の形式が正しくありません（YYYY-MM-DD）",
});

const timeStringSchema = z.string().regex(TIME_REGEX, {
  error: "時間の形式が正しくありません（HH:MM）",
});

export const publicReservationSchema = z
  .object({
    locationId: z.uuid({ error: "場所を選択してください" }),
    spaceId: z.uuid({ error: "スペースを選択してください" }),
    date: dateStringSchema,
    startTime: timeStringSchema,
    endTime: timeStringSchema,
    numberOfGuests: z
      .number()
      .int()
      .min(1, { error: "利用人数は1名以上です" })
      .max(500, { error: "利用人数は500名以下です" }),
    customerType: customerTypeSchema,
    companyName: companyNameSchema,
    lastName: personNameFieldSchema("姓"),
    firstName: personNameFieldSchema("名"),
    email: emailFieldSchema,
    phoneNumber: optionalPhoneNumberSchema,
    notes: z
      .string()
      .max(2000, { error: "備考は2000文字以内で入力してください" })
      .optional()
      .or(z.literal("")),
    // クーポンコード (大文字英数字 4-20 桁)。空文字/undefined は「未入力」として扱う。
    // 実際の存在チェック・有効期限・利用回数チェックはサーバー側 validateCoupon で行う。
    couponCode: z
      .string()
      .max(20, { error: "クーポンコードは20文字以内です" })
      .optional()
      .or(z.literal("")),
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
  .refine(
    (data) => {
      const start = Number(data.startTime.replace(":", ""));
      const end = Number(data.endTime.replace(":", ""));
      return end > start;
    },
    { error: "終了時間は開始時間より後にしてください", path: ["endTime"] },
  )
  .refine(requireCompanyNameForCorporate, COMPANY_NAME_REFINE_ERROR);

export type PublicReservationInput = z.input<typeof publicReservationSchema>;
