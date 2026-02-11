import { z } from 'zod'
import { CustomerStatus, ReservationStatus } from '@/shared/lib/validations/enums'

// =============================================================================
// Customer Schemas
// =============================================================================

/**
 * 顧客作成・編集フォーム用スキーマ
 * コンポーネント・Server Actions両方で使用
 */
export const customerFormSchema = z.object({
  lastName: z.string().min(1, { error: '姓は必須です' }).max(50, { error: '姓は50文字以内で入力してください' }),
  firstName: z.string().min(1, { error: '名は必須です' }).max(50, { error: '名は50文字以内で入力してください' }),
  lastNameKana: z.string().max(50, { error: 'セイは50文字以内で入力してください' }).optional().or(z.literal('')),
  firstNameKana: z.string().max(50, { error: 'メイは50文字以内で入力してください' }).optional().or(z.literal('')),
  email: z.string().email({ error: '有効なメールアドレスを入力してください' }),
  phoneNumber: z.string().max(20, { error: '電話番号は20文字以内で入力してください' }).optional().or(z.literal('')),
  address: z.string().max(500, { error: '住所は500文字以内で入力してください' }).optional().or(z.literal('')),
  notes: z.string().max(2000, { error: 'メモは2000文字以内で入力してください' }).optional().or(z.literal('')),
})

/**
 * 顧客フォーム入力型
 */
export type CustomerFormInput = z.input<typeof customerFormSchema>

/**
 * 顧客フォームデータ型（バリデーション後）
 */
export type CustomerFormData = z.output<typeof customerFormSchema>

/**
 * 顧客ステータス更新スキーマ
 */
export const updateCustomerStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(CustomerStatus),
})

export type UpdateCustomerStatusInput = z.infer<typeof updateCustomerStatusSchema>

/**
 * 顧客メモ更新スキーマ
 */
export const updateCustomerNotesSchema = z.object({
  id: z.string().uuid(),
  notes: z.string().max(2000).nullable(),
})

export type UpdateCustomerNotesInput = z.infer<typeof updateCustomerNotesSchema>

// =============================================================================
// Server Action Types
// =============================================================================

/**
 * 顧客データ型
 */
export type CustomerData = {
  id: string
  lastName: string
  firstName: string
  lastNameKana: string | null
  firstNameKana: string | null
  email: string
  phoneNumber: string | null
  address: string | null
  status: CustomerStatus
  notes: string | null
  totalReservations: number
  totalSpent: number | null
  lastReservationAt: Date | null
  firstReservationAt: Date | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

/**
 * 予約情報付き顧客データ型
 */
export type CustomerWithReservations = CustomerData & {
  reservations: {
    id: string
    startTime: Date
    endTime: Date
    status: ReservationStatus
    totalPrice: number | null
    space: {
      id: string
      name: string
    }
  }[]
}

/**
 * 顧客一覧取得結果型
 */
export type GetCustomersResult = {
  customers: CustomerData[]
  total: number
  page: number
  limit: number
  totalPages: number
}

/**
 * 顧客フィルター型
 */
export type CustomerFilters = {
  status?: CustomerStatus | 'ALL'
  search?: string
  isActive?: boolean
}

/**
 * 顧客ページネーション型
 */
export type CustomerPagination = {
  page?: number
  limit?: number
  sortBy?: 'createdAt' | 'lastName' | 'totalReservations' | 'lastReservationAt'
  sortOrder?: 'asc' | 'desc'
}
