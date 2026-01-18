import { z } from 'zod'
import {
  type BusinessHours,
  type DayOfWeek,
  DAYS_OF_WEEK,
  isBusinessHours,
} from '@/shared/types'

/**
 * 場所（Location）バリデーションスキーマ
 */

/**
 * TimeSlotスキーマ
 */
const timeSlotSchema = z.object({
  open: z.string().regex(/^\d{2}:\d{2}$/, '開店時刻は HH:MM 形式で入力してください'),
  close: z.string().regex(/^\d{2}:\d{2}$/, '閉店時刻は HH:MM 形式で入力してください'),
})

/**
 * BusinessHoursスキーマ
 * 各曜日に対してTimeSlot | nullを許容
 */
const businessHoursSchema = z
  .object(
    Object.fromEntries(
      DAYS_OF_WEEK.map((day) => [day, timeSlotSchema.nullable()])
    ) as Record<DayOfWeek, z.ZodNullable<typeof timeSlotSchema>>
  )
  .refine(
    (value): value is BusinessHours => isBusinessHours(value),
    '無効な営業時間形式です'
  )

const imageUrlsSchema = z
  .array(z.string().url('有効なURLを入力してください'))
  .max(10, '画像は最大10枚までです')
  .default([])

export const locationFormSchema = z.object({
  name: z
    .string()
    .min(1, '名前を入力してください')
    .max(100, '名前は100文字以内で入力してください'),
  description: z
    .string()
    .max(1000, '説明は1000文字以内で入力してください')
    .optional()
    .or(z.literal('')),
  address: z
    .string()
    .min(1, '住所を入力してください')
    .max(500, '住所は500文字以内で入力してください'),
  access: z
    .string()
    .max(1000, 'アクセス情報は1000文字以内で入力してください')
    .optional()
    .or(z.literal('')),
  imageUrl: z
    .string()
    .min(1, '建物画像URLを入力してください')
    .url('有効なURLを入力してください'),
  imageUrls: imageUrlsSchema,
  businessHours: businessHoursSchema.optional().nullable(),
  sortOrder: z.number().int().min(0).default(0),
  isPublished: z.boolean().default(false),
})

export type LocationFormInput = z.input<typeof locationFormSchema>
export type LocationFormData = z.output<typeof locationFormSchema>

export const defaultLocationFormValues: LocationFormInput = {
  name: '',
  description: '',
  address: '',
  access: '',
  imageUrl: '',
  imageUrls: [],
  businessHours: null,
  sortOrder: 0,
  isPublished: false,
}

// 場所詳細型（スペース数を含む）
export type LocationWithStats = {
  id: string
  name: string
  description: string | null
  address: string
  access: string | null
  imageUrl: string
  imageUrls: string[]
  businessHours: BusinessHours | null
  sortOrder: number
  isPublished: boolean
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  _count: {
    spaces: number
  }
}

export type GetLocationsResult = {
  locations: LocationWithStats[]
  total: number
}
