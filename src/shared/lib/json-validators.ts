/**
 * JSONフィールドバリデーション
 *
 * Prisma.JsonValueを型安全に変換するヘルパー関数
 */

import { z } from 'zod'
import type { Prisma } from '@/shared/generated/prisma/client'
import { DiscountType, DurationDiscountOverride, TaxRateType } from '@/shared/generated/prisma/enums'

const stringArraySchema = z.array(z.string())

/**
 * 営業時間帯スキーマ（開始・終了時刻のペア）
 *
 * NOTE: 予約時間枠用のTimeSlot（{time, available}）とは異なる
 * @see src/shared/lib/reservation/types.ts - 予約時間枠用
 */
const businessTimeSlotSchema = z.object({
  openTime: z.string(),
  closeTime: z.string(),
})

/**
 * 営業時間の1日分の型（新形式: slots配列）
 */
const businessHoursDaySchema = z.object({
  isOpen: z.boolean(),
  slots: z.array(businessTimeSlotSchema),
})

/**
 * 旧形式の営業時間（openTime/closeTime）スキーマ
 * DBマイグレーション前の既存データ用
 */
const legacyBusinessHoursDaySchema = z.object({
  isOpen: z.boolean(),
  openTime: z.string().nullable(),
  closeTime: z.string().nullable(),
})

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
})

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const
type Weekday = typeof WEEKDAYS[number]

/**
 * 旧形式の営業時間（週間）スキーマ
 */
const legacyBusinessHoursSchema = z.object(
  Object.fromEntries(WEEKDAYS.map((day) => [day, legacyBusinessHoursDaySchema])) as Record<Weekday, typeof legacyBusinessHoursDaySchema>
)

/** 営業時間帯（開始・終了時刻のペア）*/
export type BusinessTimeSlot = z.infer<typeof businessTimeSlotSchema>
export type BusinessHoursDay = z.infer<typeof businessHoursDaySchema>
export type BusinessHours = z.infer<typeof businessHoursSchema>

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
  const result = stringArraySchema.safeParse(value)
  return result.success ? result.data : []
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
  if (value === null || value === undefined) return null
  const result = stringArraySchema.safeParse(value)
  return result.success ? result.data : null
}

/**
 * 旧形式のBusinessHoursDayを新形式に変換
 *
 * - 休業日: { isOpen: false, slots: [] }
 * - 営業日（時刻あり）: { isOpen: true, slots: [{ openTime, closeTime }] }
 * - 営業日（時刻なし）: デフォルト営業時間を設定（データ不整合対策）
 */
function migrateLegacyDay(day: z.infer<typeof legacyBusinessHoursDaySchema>): BusinessHoursDay {
  // 休業日
  if (!day.isOpen) {
    return { isOpen: false, slots: [] }
  }
  // 営業日で時刻が正しく設定されている場合
  if (day.openTime && day.closeTime) {
    return {
      isOpen: true,
      slots: [{ openTime: day.openTime, closeTime: day.closeTime }],
    }
  }
  // 営業日だが時刻が未設定の場合（データ不整合）→ デフォルト値を設定
  return {
    isOpen: true,
    slots: [{ openTime: '09:00', closeTime: '21:00' }],
  }
}

/**
 * Prisma.JsonValueをBusinessHoursに安全に変換
 *
 * 旧形式（openTime/closeTime）のデータも新形式（slots）に自動変換
 *
 * @example
 * const hours = parseBusinessHours(settings.businessHours)
 */
export function parseBusinessHours(
  value: Prisma.JsonValue | null | undefined
): BusinessHours | null {
  // 新形式でパース
  const newResult = businessHoursSchema.safeParse(value)
  if (newResult.success) {
    return newResult.data
  }

  // 旧形式でパースして変換
  const legacyResult = legacyBusinessHoursSchema.safeParse(value)
  if (legacyResult.success) {
    const legacy = legacyResult.data
    return Object.fromEntries(
      WEEKDAYS.map((day) => [day, migrateLegacyDay(legacy[day])])
    ) as BusinessHours
  }

  return null
}

/**
 * Space discount type validation
 */
const discountTypeValues = Object.values(DiscountType)
const discountTypeSet = new Set<string>(discountTypeValues)

export function parseDiscountType(value: unknown): DiscountType {
  if (typeof value === 'string' && discountTypeSet.has(value)) {
    return value as DiscountType
  }
  return DiscountType.none
}

/**
 * Duration discount override validation
 */
const durationDiscountOverrideValues = Object.values(DurationDiscountOverride)
const durationDiscountOverrideSet = new Set<string>(durationDiscountOverrideValues)

export function parseDurationDiscountOverride(value: unknown): DurationDiscountOverride {
  if (typeof value === 'string' && durationDiscountOverrideSet.has(value)) {
    return value as DurationDiscountOverride
  }
  return DurationDiscountOverride.inherit
}

/**
 * Tax rate type validation
 */
const taxRateTypeValues = Object.values(TaxRateType)
const taxRateTypeSet = new Set<string>(taxRateTypeValues)

export function parseTaxRateType(value: unknown): TaxRateType {
  if (typeof value === 'string' && taxRateTypeSet.has(value)) {
    return value as TaxRateType
  }
  return TaxRateType.standard
}

// =============================================================================
// Business Attributes (MEO)
// =============================================================================

/**
 * JSON値をRecord<string, boolean>にパース（施設属性用）
 */
export function parseBusinessAttributes(value: unknown): Record<string, boolean> | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'object' || Array.isArray(value)) return null

  const record = value as Record<string, unknown>
  const result: Record<string, boolean> = {}
  for (const [key, val] of Object.entries(record)) {
    if (typeof val === 'boolean') {
      result[key] = val
    }
  }
  return Object.keys(result).length > 0 ? result : null
}
