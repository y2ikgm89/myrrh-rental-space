/**
 * JSONフィールドバリデーション
 *
 * Prisma.JsonValueを型安全に変換するヘルパー関数
 */

import { z } from 'zod'
import type { Prisma } from '@/generated/prisma/client/client'

const stringArraySchema = z.array(z.string())

/**
 * 営業時間の1日分の型
 */
const businessHoursDaySchema = z.object({
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

export type BusinessHoursDay = z.infer<typeof businessHoursDaySchema>
export type BusinessHours = z.infer<typeof businessHoursSchema>

/**
 * Prisma.JsonValueをstring[]に安全に変換
 *
 * バリデーション失敗時は空配列を返す
 *
 * @example
 * const imageUrls = parseStringArray(space.imageUrls)
 * const facilities = parseStringArray(space.facilities)
 * const tags = parseStringArray(post.tags)
 */
export function parseStringArray(
  value: Prisma.JsonValue | null | undefined
): string[] {
  const result = stringArraySchema.safeParse(value)
  return result.success ? result.data : []
}

/**
 * Prisma.JsonValueをstring[] | nullに安全に変換
 *
 * nullableな配列フィールド用（regularHolidays, specialHolidays等）
 *
 * @example
 * const holidays = parseStringArrayOrNull(settings.regularHolidays)
 */
export function parseStringArrayOrNull(
  value: Prisma.JsonValue | null | undefined
): string[] | null {
  if (value === null || value === undefined) return null
  const result = stringArraySchema.safeParse(value)
  return result.success ? result.data : null
}

/**
 * Prisma.JsonValueをBusinessHoursに安全に変換
 *
 * @example
 * const hours = parseBusinessHours(settings.businessHours)
 */
export function parseBusinessHours(
  value: Prisma.JsonValue | null | undefined
): BusinessHours | null {
  const result = businessHoursSchema.safeParse(value)
  return result.success ? result.data : null
}
