import { z } from "zod";
import { TIME_REGEX } from "./business-hours";
import {
  customerTypeSchema,
  companyNameSchema,
  requireCompanyNameForCorporate,
  COMPANY_NAME_REFINE_ERROR,
} from "./customer-type";

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
    lastName: z
      .string()
      .min(1, { error: "姓は必須です" })
      .max(50, { error: "姓は50文字以内で入力してください" }),
    firstName: z
      .string()
      .min(1, { error: "名は必須です" })
      .max(50, { error: "名は50文字以内で入力してください" }),
    email: z.email({ error: "有効なメールアドレスを入力してください" }),
    phoneNumber: z
      .string()
      .max(20, { error: "電話番号は20文字以内で入力してください" })
      .optional()
      .or(z.literal("")),
    notes: z
      .string()
      .max(2000, { error: "備考は2000文字以内で入力してください" })
      .optional()
      .or(z.literal("")),
    agreedTermsIds: z
      .array(z.uuid({ error: "規約IDが不正です" }))
      .default([])
      .refine((ids) => new Set(ids).size === ids.length, {
        error: "同じ規約に複数回同意することはできません",
      }),
    turnstileToken: z.string().optional(),
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
