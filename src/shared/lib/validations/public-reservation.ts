import { z } from "zod";

const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
  error: "日付の形式が正しくありません（YYYY-MM-DD）",
});

const timeStringSchema = z.string().regex(/^\d{2}:\d{2}$/, {
  error: "時間の形式が正しくありません（HH:MM）",
});

export const publicReservationSchema = z
  .object({
    spaceId: z.string().uuid({ error: "スペースを選択してください" }),
    date: dateStringSchema,
    startTime: timeStringSchema,
    endTime: timeStringSchema,
    numberOfGuests: z
      .number()
      .int()
      .min(1, { error: "利用人数は1名以上です" })
      .max(500, { error: "利用人数は500名以下です" }),
    lastName: z
      .string()
      .min(1, { error: "姓は必須です" })
      .max(50, { error: "姓は50文字以内で入力してください" }),
    firstName: z
      .string()
      .min(1, { error: "名は必須です" })
      .max(50, { error: "名は50文字以内で入力してください" }),
    email: z
      .string()
      .email({ error: "有効なメールアドレスを入力してください" }),
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
    agreeToTerms: z.literal(true, {
      error: "利用規約への同意が必要です",
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
  );

export type PublicReservationInput = z.input<typeof publicReservationSchema>;
