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

export const businessHoursSettingsSchema = z
  .object({
    businessHours: businessHoursWeekSchema,
    expectedUpdatedAt: z.iso
      .datetime({
        error: "更新バージョンが不正です。ページを再読み込みしてください",
      })
      .or(z.date()),
    // 特別休業日は拠点（Location）ごとに管理（2026-04-27 に settings から移管済み）
    // HTMLタグを禁止してXSS対策
    holidayNotice: z
      .string()
      .trim()
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
  expectedUpdatedAt: z.iso
    .datetime({
      error: "更新バージョンが不正です。ページを再読み込みしてください",
    })
    .or(z.date()),
});

export type HeaderSettingsInput = z.infer<typeof headerSettingsSchema>;

// =============================================================================
// Reservation Schema
// =============================================================================

export const reservationSettingsSchema = z
  .object({
    defaultTimeSlot: z.number().int().min(15).max(240),
    minReservationDuration: z.number().int().min(15).max(480),
    maxReservationDuration: z.number().int().min(60).max(1440),
    cancellationDeadlineHours: z.number().int().min(1).max(720),
    modificationDeadlineHours: z.number().int().min(1).max(720),
    // Phase B.2 goal 9: 顧客が定期予約全体を series-all キャンセルできるか。
    // OFF (未送信) を許容するため switchBoolean() 経由 (bare z.boolean() は
    // parseWithZod で undefined 弾き)。
    customerCanCancelSeriesInFull: switchBoolean(),
    // 定期予約 (RRULE) 展開の上限。form validation / series-commands が参照する。
    // 104 = 週次×2年相当の上限として妥当なキャップ。
    maxRecurrenceInstances: z
      .number({ error: "定期予約の最大件数を入力してください" })
      .int({ error: "整数で入力してください" })
      .min(1, { error: "定期予約の最大件数は1以上で入力してください" })
      .max(104, { error: "定期予約の最大件数は104以下で入力してください" }),
    expectedUpdatedAt: z.iso
      .datetime({
        error: "更新バージョンが不正です。ページを再読み込みしてください",
      })
      .or(z.date()),
  })
  .superRefine((data, ctx) => {
    if (data.minReservationDuration > data.maxReservationDuration) {
      ctx.addIssue({
        code: "custom",
        path: ["minReservationDuration"],
        message: "最小予約時間は最大予約時間以下である必要があります",
      });
      ctx.addIssue({
        code: "custom",
        path: ["maxReservationDuration"],
        message: "最大予約時間は最小予約時間以上である必要があります",
      });
    }

    if (data.defaultTimeSlot % 15 !== 0) {
      ctx.addIssue({
        code: "custom",
        path: ["defaultTimeSlot"],
        message: "予約時間単位は15分刻みで入力してください",
      });
    }

    if (data.minReservationDuration % data.defaultTimeSlot !== 0) {
      ctx.addIssue({
        code: "custom",
        path: ["minReservationDuration"],
        message: "最小予約時間は予約時間単位の倍数である必要があります",
      });
    }

    if (data.maxReservationDuration % data.defaultTimeSlot !== 0) {
      ctx.addIssue({
        code: "custom",
        path: ["maxReservationDuration"],
        message: "最大予約時間は予約時間単位の倍数である必要があります",
      });
    }
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
  /** OFF→ON 時のみ server が必須とする（UI は data-retention ON 時に表示） */
  confirmDataRetentionEnable: switchBoolean(),
  expectedUpdatedAt: z.iso
    .datetime({
      error: "更新バージョンが不正です。ページを再読み込みしてください",
    })
    .or(z.date()),
});

export type FeatureModulesSettingsInput = z.infer<
  typeof featureModulesSettingsSchema
>;

// =============================================================================
// Data Retention（保持月数 — SettingsDataRetention.dataRetention JSON）
// =============================================================================

const retentionMonthsField = (label: string) =>
  z.coerce
    .number({ error: `${label}を入力してください` })
    .int({ error: `${label}は整数で入力してください` })
    .min(0, { error: `${label}は0以上で入力してください` });

export const dataRetentionSettingsSchema = z.object({
  sessionMonths: retentionMonthsField("セッション保持月数"),
  verificationMonths: retentionMonthsField("認証トークン保持月数"),
  reservationGuestMonths: retentionMonthsField("予約ゲスト情報保持月数"),
  inquiryMonths: retentionMonthsField("問い合わせ保持月数"),
  customerInactiveMonths: retentionMonthsField("非アクティブ顧客保持月数"),
  expectedUpdatedAt: z.iso
    .datetime({
      error: "更新バージョンが不正です。ページを再読み込みしてください",
    })
    .or(z.date()),
});

export type DataRetentionSettingsInput = z.infer<
  typeof dataRetentionSettingsSchema
>;

// Re-export from validations for sidebar
export { sidebarSettingsSchema } from "@/shared/lib/validations/sidebar";
