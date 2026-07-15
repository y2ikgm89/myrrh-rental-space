/**
 * 設定ドメインスキーマ — 営業時間 / ヘッダー / 予約 / Feature Modules / robots.txt。
 *
 * 入力テキストの「空欄保存」を扱うフォーム系スキーマは `form-schemas-*.ts` に集約済み
 * （conform の空→undefined 変換に整合）。ここには object 入力で検証する domain スキーマ、
 * および client/server 共用の宣言的スキーマ（feature modules 等）のみを残す。
 */

import { z } from "zod";
import {
  HeaderScrollBehavior,
  HeaderBackgroundMode,
} from "@/shared/lib/validations/enums/prisma-types";
import {
  TIME_REGEX,
  collectBusinessHoursWeekIssues,
} from "@/shared/lib/validations/business-hours";
import {
  WEEKDAY_VALUES,
  MONTHLY_CLOSURE_WEEK_VALUES,
} from "@/shared/lib/json-validators";
import { switchBoolean } from "./form-schema-helpers";

// =============================================================================
// Business Hours Schemas
// =============================================================================

const timeSlotObjectSchema = z.object({
  openTime: z.string().regex(TIME_REGEX, {
    error: "正しい時刻形式（HH:mm）で入力してください",
  }),
  closeTime: z.string().regex(TIME_REGEX, {
    error: "正しい時刻形式（HH:mm）で入力してください",
  }),
});

const businessHoursDayObjectSchema = z.object({
  isOpen: z.boolean(),
  slots: z.array(timeSlotObjectSchema),
});

const monthlyClosureObjectSchema = z.object({
  weekday: z.enum(WEEKDAY_VALUES),
  week: z.enum(MONTHLY_CLOSURE_WEEK_VALUES),
});

const businessHoursWeekSchema = z.object({
  monday: businessHoursDayObjectSchema,
  tuesday: businessHoursDayObjectSchema,
  wednesday: businessHoursDayObjectSchema,
  thursday: businessHoursDayObjectSchema,
  friday: businessHoursDayObjectSchema,
  saturday: businessHoursDayObjectSchema,
  sunday: businessHoursDayObjectSchema,
  monthlyClosures: z.array(monthlyClosureObjectSchema).max(20).optional(),
});

// 各日付は React key の stable ID として機能するため、重複を禁止する
const uniqueDateArraySchema = (label: string) =>
  z
    .array(z.string())
    .refine((arr) => new Set(arr).size === arr.length, {
      error: `同じ${label}を複数登録することはできません`,
    })
    .nullable();

export const businessHoursSettingsSchema = z
  .object({
    businessHours: businessHoursWeekSchema,
    regularHolidays: uniqueDateArraySchema("定休日"),
    // 特別休業日は拠点（Location）ごとに管理（2026-04-27 に settings から移管済み）
    // HTMLタグを禁止してXSS対策
    holidayNotice: z
      .string()
      .max(1000, { error: "お知らせは1000文字以内で入力してください" })
      .regex(/^[^<>]*$/, { error: "HTMLタグは使用できません" })
      .nullable()
      .or(z.literal(""))
      .transform((v) => v || null),
  })
  .superRefine((data, ctx) => {
    collectBusinessHoursWeekIssues(data.businessHours, ["businessHours"], ctx);
  });

export type BusinessHoursSettingsInput = z.infer<
  typeof businessHoursSettingsSchema
>;

// =============================================================================
// Header Schema
// =============================================================================

export const headerSettingsSchema = z.object({
  headerScrollBehavior: z.enum(HeaderScrollBehavior),
  headerBackgroundMode: z.enum(HeaderBackgroundMode),
});

export type HeaderSettingsInput = z.infer<typeof headerSettingsSchema>;

// =============================================================================
// Reservation Schema
// =============================================================================

export const reservationSettingsSchema = z.object({
  defaultTimeSlot: z.number().int().min(15).max(240),
  minReservationDuration: z.number().int().min(15).max(480),
  maxReservationDuration: z.number().int().min(60).max(1440),
  cancellationDeadlineHours: z.number().int().min(1).max(720),
  modificationDeadlineHours: z.number().int().min(1).max(720),
});

export type ReservationSettingsInput = z.infer<
  typeof reservationSettingsSchema
>;

// =============================================================================
// Feature Modules（Sanity / Stripe Capabilities 流の declarative composition）
// =============================================================================
// 全 11 module を boolean として扱う。client は Switch（"on" / ""）で送るため
// `switchBoolean()` で OFF（未送信）= false を担保する。
// SSoT: `@/shared/lib/features/registry` の FEATURE_MODULES_LIST。
// 新規 module 追加時はここにキーを追加（4 箇所同時更新の 1 つ）。
export const featureModulesSettingsSchema = z.object({
  spaces: switchBoolean(),
  reservation: switchBoolean(),
  events: switchBoolean(),
  posts: switchBoolean(),
  news: switchBoolean(),
  faq: switchBoolean(),
  access: switchBoolean(),
  contact: switchBoolean(),
  reviews: switchBoolean(),
  payment: switchBoolean(),
  "data-retention": switchBoolean(),
});

export type FeatureModulesSettingsInput = z.infer<
  typeof featureModulesSettingsSchema
>;

// Re-export from validations for sidebar
export { sidebarSettingsSchema } from "@/shared/lib/validations/sidebar";
