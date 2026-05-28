/**
 * JSONフィールドバリデーション
 *
 * Prisma.JsonValueを型安全に変換するヘルパー関数
 */

import { z } from "zod";
import type { Prisma } from "@/shared/lib/validations/enums/prisma-types";

// 読み取り側では重複を silent に除去する（React key の stable ID 保証のため）。
// 書き込み側の Zod スキーマは `.refine()` で厳格に重複を拒否しているため、
// 重複が残る場合は historical data のみ。`transform` で自己修復する。
const stringArraySchema = z
  .array(z.string())
  .transform((arr) => Array.from(new Set(arr)));

/**
 * 営業時間帯スキーマ（開始・終了時刻のペア）
 *
 * NOTE: 予約時間枠用のTimeSlot（{time, available}）とは異なる
 * @see src/shared/lib/reservation/types.ts - 予約時間枠用
 */
const businessTimeSlotSchema = z.object({
  openTime: z.string(),
  closeTime: z.string(),
});

/**
 * 営業時間の1日分の型（新形式: slots配列）
 */
const businessHoursDaySchema = z.object({
  isOpen: z.boolean(),
  slots: z.array(businessTimeSlotSchema),
});

/** 曜日キー（businessHours の曜日と一致） */
export const WEEKDAY_VALUES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

/** 月内の第N週（last = 最終週） */
export const MONTHLY_CLOSURE_WEEK_VALUES = [
  "first",
  "second",
  "third",
  "fourth",
  "last",
] as const;

/**
 * 毎月の繰り返し定休（例: 第3月曜）。
 * 曜日定休（週次）を補完する月次の繰り返し休業。BlockedDate（単発期間）とは別。
 */
const monthlyClosureSchema = z.object({
  weekday: z.enum(WEEKDAY_VALUES),
  week: z.enum(MONTHLY_CLOSURE_WEEK_VALUES),
});

/**
 * 営業時間（週間）スキーマ。
 * `monthlyClosures` は毎月の繰り返し定休（後方互換のため default []）。
 */
const businessHoursSchema = z.object({
  monday: businessHoursDaySchema,
  tuesday: businessHoursDaySchema,
  wednesday: businessHoursDaySchema,
  thursday: businessHoursDaySchema,
  friday: businessHoursDaySchema,
  saturday: businessHoursDaySchema,
  sunday: businessHoursDaySchema,
  monthlyClosures: z.array(monthlyClosureSchema).optional(),
});

/** 営業時間帯（開始・終了時刻のペア）*/
export type BusinessTimeSlot = z.infer<typeof businessTimeSlotSchema>;
export type BusinessHoursDay = z.infer<typeof businessHoursDaySchema>;
export type BusinessHours = z.infer<typeof businessHoursSchema>;
export type MonthlyClosure = z.infer<typeof monthlyClosureSchema>;
export type MonthlyClosureWeek = (typeof MONTHLY_CLOSURE_WEEK_VALUES)[number];
/** businessHours の曜日キー（monthlyClosures を除外した weekday 限定キー） */
export type WeekdayKey = (typeof WEEKDAY_VALUES)[number];

/**
 * unknown値をstring[]に安全に変換
 *
 * Prisma.JsonValueやunknown型のデータを安全に変換
 * バリデーション失敗時は空配列を返す
 *
 * @example
 * const imageUrls = parseStringArray(space.imageUrls)
 * const tags = parseStringArray(post.tags)
 */
export function parseStringArray(value: unknown): string[] {
  const result = stringArraySchema.safeParse(value);
  return result.success ? result.data : [];
}

// ============================================================================
// Space.facilities ({ name, iconName }[])
// ============================================================================

const facilityItemSchema = z.object({
  name: z
    .string()
    .min(1, { error: "設備名を入力してください" })
    .max(50, { error: "設備名は50文字以内で入力してください" }),
  // 空文字許容（icon 未指定 — UI で fallback として text のみ表示）
  iconName: z.string().max(64),
});

/**
 * 設備配列の canonical SSoT スキーマ。
 *
 * - 各設備は `{ name: string; iconName: string }` の object（Airbnb / Booking.com 標準）
 * - `name` は React key の stable ID として機能するため重複禁止
 * - `iconName` は `@/shared/lib/icon-curation` の curation 識別子（空文字 = icon 未指定）
 *
 * write-side（フォーム / Server Action）からは `.default([])` を chain して使う。
 * read-side（DB JSON パース）は `parseFacilities()` ヘルパー経由で使う。
 */
export const facilitiesSchema = z
  .array(facilityItemSchema)
  .refine((arr) => new Set(arr.map((f) => f.name)).size === arr.length, {
    error: "同じ名前の設備を複数登録することはできません",
  });

export type FacilityItem = z.infer<typeof facilityItemSchema>;

/**
 * unknown 値を `FacilityItem[]` に安全に変換
 *
 * `Space.facilities` は構造化された設備リスト（Airbnb / Booking.com 標準）。
 * `{ name: string; iconName: string }[]` 形式で保存。
 * 旧 `string[]` 形式はマイグレーション 20260507163006 で object 化済み。
 *
 * バリデーション失敗時は空配列を返す（防御的読み取り、historical data の自己修復）。
 *
 * @example
 * const facilities = parseFacilities(space.facilities)
 * // facilities[0].name / facilities[0].iconName でアクセス
 */
export function parseFacilities(value: unknown): FacilityItem[] {
  const result = facilitiesSchema.safeParse(value);
  return result.success ? result.data : [];
}

/**
 * unknown値をstring[] | nullに安全に変換
 *
 * nullableな配列フィールド用（regularHolidays, specialHolidays等）
 *
 * @example
 * const holidays = parseStringArrayOrNull(settings.regularHolidays)
 */
export function parseStringArrayOrNull(value: unknown): string[] | null {
  if (value === null || value === undefined) return null;
  const result = stringArraySchema.safeParse(value);
  return result.success ? result.data : null;
}

/**
 * Prisma.JsonValueをBusinessHoursに安全に変換
 *
 * @example
 * const hours = parseBusinessHours(settings.businessHours)
 */
export function parseBusinessHours(
  value: Prisma.JsonValue | null | undefined,
): BusinessHours | null {
  const result = businessHoursSchema.safeParse(value);
  return result.success ? result.data : null;
}

// =============================================================================
// Business Attributes (MEO)
// =============================================================================

const businessAttributesSchema = z.record(z.string(), z.boolean());

/**
 * JSON値をRecord<string, boolean>にパース（施設属性用）
 */
export function parseBusinessAttributes(
  value: unknown,
): Record<string, boolean> | null {
  if (value === null || value === undefined) return null;
  const result = businessAttributesSchema.safeParse(value);
  if (!result.success) return null;
  return Object.keys(result.data).length > 0 ? result.data : null;
}

const featureModulesSchema = z.record(z.string(), z.boolean());

/**
 * JSON値をRecord<string, boolean>にパース（Feature Module ON/OFF map 用）。
 *
 * - 空オブジェクト / 不正値 / null / undefined → `{}`
 * - boolean 以外の値を持つ key は silently 除外
 *
 * SSoT: `Settings.featureModules` JSON column。registry: `@/shared/lib/features/registry`。
 * 解決ロジック: `@/shared/lib/features/check.ts` の `getEnabledFeatures`。
 */
export function parseFeatureModules(value: unknown): Record<string, boolean> {
  if (value === null || value === undefined) return {};
  const result = featureModulesSchema.safeParse(value);
  return result.success ? result.data : {};
}
