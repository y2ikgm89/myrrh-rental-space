import { z } from "zod";
import { parseJstDateOnly } from "@/shared/lib/date-format";
import {
  DayOfWeek,
  HolidayMode,
} from "@/shared/lib/validations/enums/prisma-types";
import { uuidIdSchema } from "@/shared/lib/validations/params";

/**
 * SpaceRatePlan 管理フォーム用バリデーションスキーマ。
 *
 * create / update で共有する。update 側は spaceId も parse するが、
 * `UpdateSpaceRatePlanInput`（Task 6 `rate-plan-commands.ts`）は spaceId を
 * 持たないため、呼び出し側（Server Action）で除外してから domain command に渡す
 * （親 Space の付け替えは想定しない設計）。
 *
 * `startTime` / `endTime` は `"HH:MM"`（24h）文字列。`endTime` のみ半開区間の
 * 終端を表す `"24:00"` を許容する（`rate-plan-resolver.ts` の
 * `timeStrToMinutes(t, endMode=true)` と同じ意味論）。
 *
 * `effectiveFrom` / `effectiveTo` は `<input type="date">` の値
 * （`"YYYY-MM-DD"`、JST カレンダー日付）を `z.iso.date()` で受け取り、
 * `parseJstDateOnly` で `@db.Date` 保存用の UTC 深夜 Date に変換する
 * （`src/shared/lib/validations/blocked-date.ts` の startDate/endDate と同じ規約。
 * Task 6 の command input 型が `Date | null` を要求するため、ここで変換まで
 * 完結させる）。
 */

const timePattern = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const endTimePattern = /^([01][0-9]|2[0-3]|24):[0-5][0-9]$/;

function toEffectiveDate(value: string | null): Date | null {
  return value === null ? null : parseJstDateOnly(value);
}

export const spaceRatePlanFormSchema = z
  .object({
    spaceId: uuidIdSchema("スペース"),
    name: z
      .string()
      .min(1, { error: "名称を入力してください" })
      .max(100, { error: "名称は100文字以内で入力してください" }),
    hourlyPrice: z.coerce
      .number()
      .int({ error: "時間料金は整数で入力してください" })
      .min(0, { error: "時間料金は0以上で入力してください" })
      .max(1_000_000, { error: "時間料金が上限を超えています" }),
    daysOfWeek: z.array(z.enum(DayOfWeek)).default([]),
    holidayMode: z.enum(HolidayMode).default(HolidayMode.any),
    startTime: z
      .string()
      .regex(timePattern, {
        error: "開始時刻は HH:MM 形式で入力してください",
      })
      .nullable()
      .default(null),
    endTime: z
      .string()
      .regex(endTimePattern, {
        error: "終了時刻は HH:MM 形式で入力してください",
      })
      .nullable()
      .default(null),
    effectiveFrom: z.iso
      .date({ error: "有効開始日を正しく入力してください" })
      .nullable()
      .default(null)
      .transform(toEffectiveDate),
    effectiveTo: z.iso
      .date({ error: "有効終了日を正しく入力してください" })
      .nullable()
      .default(null)
      .transform(toEffectiveDate),
  })
  .refine(
    (data) => !data.startTime || !data.endTime || data.startTime < data.endTime,
    {
      // startTime < endTime を要求（cross-midnight は 2 plan 登録で対応、spec 参照）
      error: "終了時刻は開始時刻より後にしてください",
      path: ["endTime"],
    },
  )
  .refine(
    (data) =>
      !data.effectiveFrom ||
      !data.effectiveTo ||
      data.effectiveFrom <= data.effectiveTo,
    {
      error: "有効終了日は有効開始日以降にしてください",
      path: ["effectiveTo"],
    },
  );

export type SpaceRatePlanFormData = z.infer<typeof spaceRatePlanFormSchema>;
