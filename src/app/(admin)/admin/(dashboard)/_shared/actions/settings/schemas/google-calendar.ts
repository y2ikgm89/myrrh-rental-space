/**
 * Google Calendar設定のZodスキーマ
 *
 * 設定保存フォームの検証は `form-schemas-security-integrations.ts` の
 * `googleCalendarFormSchema` / `twoWaySyncFormSchema` が担う（conform 経路）。
 * ここは接続テスト用の `googleCalendarConnectionTestSchema`
 * （object 入力で `safeParse` する LIVE スキーマ）のみを定義する。
 */

import { z } from "zod";
import { isValidCalendarId } from "@/shared/lib/google-calendar/calendar-id";
import { parseGoogleServiceAccountCredentials } from "@/shared/lib/validations/google-service-account";

// =============================================================================
// Google Calendar Schemas
// =============================================================================

const requiredCalendarIdSchema = z
  .string()
  .trim()
  .min(1, { error: "カレンダーIDを入力してください" })
  .max(200)
  .refine((value) => isValidCalendarId(value), {
    error: "カレンダーIDの形式が無効です",
  });

export const googleCalendarConnectionTestSchema = z.object({
  serviceAccountJson: z
    .string()
    .trim()
    .min(1, { error: "サービスアカウントJSONを入力してください" })
    .refine((value) => parseGoogleServiceAccountCredentials(value) !== null, {
      error: "サービスアカウントJSONの形式が無効です",
    }),
  calendarId: requiredCalendarIdSchema,
});

export type GoogleCalendarConnectionTestInput = z.infer<
  typeof googleCalendarConnectionTestSchema
>;
