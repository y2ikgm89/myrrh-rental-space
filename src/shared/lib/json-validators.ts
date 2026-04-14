/**
 * JSONフィールドバリデーション
 *
 * Prisma.JsonValueを型安全に変換するヘルパー関数
 */

import { z } from "zod";
import type { Prisma } from "@generated/prisma/client";

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

/**
 * 営業時間（週間）スキーマ
 */
const businessHoursSchema = z.object({
  monday: businessHoursDaySchema,
  tuesday: businessHoursDaySchema,
  wednesday: businessHoursDaySchema,
  thursday: businessHoursDaySchema,
  friday: businessHoursDaySchema,
  saturday: businessHoursDaySchema,
  sunday: businessHoursDaySchema,
});

/** 営業時間帯（開始・終了時刻のペア）*/
export type BusinessTimeSlot = z.infer<typeof businessTimeSlotSchema>;
export type BusinessHoursDay = z.infer<typeof businessHoursDaySchema>;
export type BusinessHours = z.infer<typeof businessHoursSchema>;

/**
 * unknown値をstring[]に安全に変換
 *
 * Prisma.JsonValueやunknown型のデータを安全に変換
 * バリデーション失敗時は空配列を返す
 *
 * @example
 * const imageUrls = parseStringArray(space.imageUrls)
 * const facilities = parseStringArray(space.facilities)
 * const tags = parseStringArray(post.tags)
 */
export function parseStringArray(value: unknown): string[] {
  const result = stringArraySchema.safeParse(value);
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
