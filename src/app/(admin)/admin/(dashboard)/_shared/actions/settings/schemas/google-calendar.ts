/**
 * Google Calendar設定のZodスキーマ
 */

import { z } from "zod";
import { CalendarSyncMethod } from "@/shared/lib/validations/enums/prisma-types";
import { parseGoogleServiceAccountCredentials } from "@/shared/lib/validations/google-service-account";

// =============================================================================
// Google Calendar Schemas
// =============================================================================

const CALENDAR_ID_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const optionalCalendarIdSchema = z
  .string()
  .max(200)
  .refine((value) => value === "primary" || CALENDAR_ID_REGEX.test(value), {
    error: "カレンダーIDの形式が無効です",
  });

const requiredCalendarIdSchema = z
  .string()
  .min(1, { error: "カレンダーIDを入力してください" })
  .max(200)
  .refine((value) => value === "primary" || CALENDAR_ID_REGEX.test(value), {
    error: "カレンダーIDの形式が無効です",
  });

export const googleCalendarSettingsSchema = z.object({
  googleCalendarEnabled: z.boolean(),
  googleCalendarId: optionalCalendarIdSchema.nullable(),
  serviceAccountJson: z
    .string()
    .nullable()
    .refine(
      (value) =>
        value === null || parseGoogleServiceAccountCredentials(value) !== null,
      { error: "サービスアカウントJSONの形式が無効です" },
    ), // 新規入力時のみ
  icalAttachmentEnabled: z.boolean(),
  addToCalendarLinksEnabled: z.boolean(),
  googleCalendarMeetEnabled: z.boolean(),
  /** null = Google Calendar 既定を使う, 0 = 通知なし, N = N分前にメール通知（最大 40320 = 4週間） */
  googleCalendarReminderMinutes: z
    .number()
    .int()
    .min(0, { error: "0 以上で入力してください" })
    .max(40320, { error: "40320（4週間）以下で入力してください" })
    .nullable(),
});

export type GoogleCalendarSettingsInput = z.infer<
  typeof googleCalendarSettingsSchema
>;

export const googleCalendarConnectionTestSchema = z.object({
  serviceAccountJson: z
    .string()
    .min(1, { error: "サービスアカウントJSONを入力してください" })
    .refine((value) => parseGoogleServiceAccountCredentials(value) !== null, {
      error: "サービスアカウントJSONの形式が無効です",
    }),
  calendarId: requiredCalendarIdSchema,
});

export type GoogleCalendarConnectionTestInput = z.infer<
  typeof googleCalendarConnectionTestSchema
>;

export const twoWaySyncSettingsSchema = z.object({
  enabled: z.boolean(),
  syncMethod: z.enum(CalendarSyncMethod),
  pollingIntervalMin: z.number().int().min(1).max(60),
});

export type TwoWaySyncSettingsInput = z.infer<typeof twoWaySyncSettingsSchema>;
