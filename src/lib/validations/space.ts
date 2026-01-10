import { z } from 'zod'

/**
 * スペースフォーム用バリデーションスキーマ
 *
 * クライアント・サーバー両方で使用
 */

/**
 * 画像URL配列のバリデーション
 */
const imageUrlsSchema = z
  .array(z.string().url('有効なURLを入力してください'))
  .max(10, '画像は最大10枚までです')
  .default([])

/**
 * 設備タグ配列のバリデーション
 */
const facilitiesSchema = z
  .array(z.string().min(1).max(50))
  .default([])

/**
 * スペース作成・編集フォームスキーマ
 */
export const spaceFormSchema = z.object({
  name: z
    .string()
    .min(1, '名前を入力してください')
    .max(100, '名前は100文字以内で入力してください'),
  description: z
    .string()
    .min(1, '説明を入力してください')
    .min(10, '説明は10文字以上で入力してください'),
  address: z
    .string()
    .min(1, '住所を入力してください'),
  access: z
    .string()
    .max(500, 'アクセス情報は500文字以内で入力してください')
    .optional()
    .or(z.literal('')),
  capacity: z
    .number()
    .int('整数を入力してください')
    .min(1, '定員は1以上で入力してください')
    .max(1000, '定員は1000以下で入力してください'),
  area: z
    .number()
    .positive('正の数を入力してください')
    .max(10000, '面積は10000以下で入力してください')
    .optional()
    .nullable(),
  hourlyPrice: z
    .number()
    .min(0, '時間料金は0以上で入力してください')
    .max(1000000, '時間料金は1000000以下で入力してください'),
  dailyPrice: z
    .number()
    .min(0, '日額料金は0以上で入力してください')
    .max(10000000, '日額料金は10000000以下で入力してください')
    .optional()
    .nullable(),
  mainImageUrl: z
    .string()
    .min(1, 'メイン画像URLを入力してください')
    .url('有効なURLを入力してください'),
  imageUrls: imageUrlsSchema,
  facilities: facilitiesSchema,
  isPublished: z.boolean().default(false),
})

/**
 * フォーム入力値の型
 */
export type SpaceFormInput = z.input<typeof spaceFormSchema>

/**
 * バリデーション後の型
 */
export type SpaceFormData = z.output<typeof spaceFormSchema>

/**
 * Server Action のレスポンス型
 */
export type SpaceActionResult =
  | {
      success: true
      message: string
      id?: string
    }
  | {
      success: false
      error: string
      fieldErrors?: Record<string, string[]>
    }

/**
 * フォームのデフォルト値
 */
export const defaultSpaceFormValues: SpaceFormInput = {
  name: '',
  description: '',
  address: '',
  access: '',
  capacity: 10,
  area: null,
  hourlyPrice: 0,
  dailyPrice: null,
  mainImageUrl: '',
  imageUrls: [],
  facilities: [],
  isPublished: false,
}

// =============================================================================
// Server Action 用の型定義
// =============================================================================

/**
 * 予約数を含むスペース型
 */
export type SpaceWithStats = {
  id: string
  name: string
  description: string
  address: string
  access: string | null
  capacity: number
  area: number | null
  hourlyPrice: number
  dailyPrice: number | null
  mainImageUrl: string
  imageUrls: string[]
  facilities: string[]
  businessHours: Record<string, unknown> | null
  isPublished: boolean
  publishedAt: Date | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  _count: {
    reservations: number
  }
}

/**
 * スペース一覧取得結果
 */
export type GetSpacesResult = {
  spaces: SpaceWithStats[]
  total: number
  page: number
  limit: number
  totalPages: number
}

/**
 * スペースフィルター
 */
export type SpaceFilters = {
  isPublished?: boolean | 'ALL'
  search?: string
}

/**
 * スペースページネーション
 */
export type SpacePagination = {
  page?: number
  limit?: number
  sortBy?: 'name' | 'createdAt' | 'hourlyPrice'
  sortOrder?: 'asc' | 'desc'
}
