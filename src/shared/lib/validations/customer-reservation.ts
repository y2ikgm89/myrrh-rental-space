import { z } from "zod";
import { TIME_REGEX } from "./business-hours";
import { formatJstDateString } from "@/shared/lib/date-format";

export const customerReservationEditSchema = z
  .object({
    reservationId: z.uuid({ error: "予約IDが不正です" }),
    spaceId: z.uuid({ error: "スペースを選択してください" }),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
      error: "日付の形式が正しくありません（YYYY-MM-DD）",
    }),
    startTime: z.string().regex(TIME_REGEX, {
      error: "時間の形式が正しくありません（HH:MM）",
    }),
    endTime: z.string().regex(TIME_REGEX, {
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
  )
  // JST の今日以降のみ許可（クライアント min 属性のバイパス対策。サーバー権威）。
  .refine((data) => data.date >= formatJstDateString(new Date()), {
    error: "過去の日付は選択できません",
    path: ["date"],
  });

export type CustomerReservationEditInput = z.input<
  typeof customerReservationEditSchema
>;
