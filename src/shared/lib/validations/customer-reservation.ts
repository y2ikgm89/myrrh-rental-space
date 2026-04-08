import { z } from "zod";

export const customerReservationEditSchema = z
  .object({
    reservationId: z.string().uuid({ error: "予約IDが不正です" }),
    spaceId: z.string().uuid({ error: "スペースを選択してください" }),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
      error: "日付の形式が正しくありません（YYYY-MM-DD）",
    }),
    startTime: z.string().regex(/^\d{2}:\d{2}$/, {
      error: "時間の形式が正しくありません（HH:MM）",
    }),
    endTime: z.string().regex(/^\d{2}:\d{2}$/, {
      error: "時間の形式が正しくありません（HH:MM）",
    }),
    numberOfGuests: z.number().int().min(1, { error: "利用人数は1名以上です" }),
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

export type CustomerReservationEditInput = z.input<
  typeof customerReservationEditSchema
>;
