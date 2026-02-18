import { z } from 'zod'
import { ReservationStatus } from '@/shared/generated/prisma/enums'

/**
 * 管理者用予約作成バリデーションスキーマ
 *
 * 公開サイトとの違い:
 * - Turnstile不要（認証済み）
 * - 規約同意不要（電話確認済み想定）
 * - ステータス選択可能
 * - 料金手動調整可能
 * - 顧客は既存選択 or 新規作成
 */

// 日付文字列のバリデーション（YYYY-MM-DD形式）
const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: '日付の形式が正しくありません' })

// 時間文字列のバリデーション（HH:MM形式）
const timeStringSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: '時間の形式が正しくありません' })

/**
 * 新規顧客情報スキーマ
 */
export const newCustomerSchema = z.object({
  lastName: z
    .string()
    .min(1, { error: '姓を入力してください' })
    .max(50, { error: '姓は50文字以内で入力してください' }),
  firstName: z
    .string()
    .min(1, { error: '名を入力してください' })
    .max(50, { error: '名は50文字以内で入力してください' }),
  email: z
    .string()
    .min(1, { error: 'メールアドレスを入力してください' })
    .email({ error: '有効なメールアドレスを入力してください' }),
  phoneNumber: z
    .string()
    .max(20, { error: '電話番号は20文字以内で入力してください' })
    .optional()
    .or(z.literal('')),
})

/**
 * 管理者用予約作成スキーマ
 */
export const adminReservationSchema = z
  .object({
    // スペース
    spaceId: z.string().uuid({ error: 'スペースを選択してください' }),

    // 日時
    date: dateStringSchema,
    startTime: timeStringSchema,
    endTime: timeStringSchema,

    // 顧客情報（既存顧客 or 新規顧客）
    customerId: z.string().uuid().optional(),
    customerData: newCustomerSchema.optional(),

    // 料金オプション
    totalPrice: z.number().nonnegative({ error: '料金は0以上で入力してください' }).optional(),

    // 割引オプション
    couponCode: z.string().max(20).optional().or(z.literal('')),
    manualDiscountAmount: z.number().nonnegative({ error: '割引額は0以上で入力してください' }).optional(),
    manualDiscountReason: z.string().max(200, { error: '割引理由は200文字以内で入力してください' }).optional().or(z.literal('')),

    // その他オプション
    status: z.enum(ReservationStatus).default('CONFIRMED'),
    notes: z.string().max(1000, { error: 'メモは1000文字以内で入力してください' }).optional(),
    sendEmail: z.boolean().default(true),
  })
  .refine(
    (data) => data.customerId || data.customerData,
    {
      error: '顧客を選択するか、新規顧客情報を入力してください',
      path: ['customerId'],
    }
  )
  .refine(
    (data) => {
      const start = new Date(`${data.date}T${data.startTime}`)
      const end = new Date(`${data.date}T${data.endTime}`)
      return end > start
    },
    {
      error: '終了時間は開始時間より後に設定してください',
      path: ['endTime'],
    }
  )
  .refine(
    (data) => {
      const start = new Date(`${data.date}T${data.startTime}`)
      const end = new Date(`${data.date}T${data.endTime}`)
      const diffHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60)
      return diffHours >= 1
    },
    {
      error: '最低1時間以上の予約が必要です',
      path: ['endTime'],
    }
  )

export type AdminReservationInput = z.input<typeof adminReservationSchema>
export type AdminReservationData = z.output<typeof adminReservationSchema>
export type NewCustomerInput = z.input<typeof newCustomerSchema>

/**
 * 管理者用予約作成の結果型
 */
export type AdminReservationResult =
  | {
      success: true
      message: string
      reservationId: string
    }
  | {
      success: false
      error: string
      fieldErrors?: Record<string, string[]>
    }

// =============================================================================
// 予約編集スキーマ（既存予約の更新用）
// =============================================================================

/**
 * 管理者用予約更新バリデーションスキーマ
 *
 * 作成スキーマとの違い:
 * - customerId 必須（既存顧客のみ、新規作成なし）
 * - customerData 削除
 * - sendNotificationEmail 追加（デフォルト false）
 * - sendEmail 削除（作成時専用）
 */
export const updateReservationSchema = z
  .object({
    spaceId: z.string().uuid({ error: 'スペースを選択してください' }),
    date: dateStringSchema,
    startTime: timeStringSchema,
    endTime: timeStringSchema,
    customerId: z.string().uuid({ error: '顧客を選択してください' }),
    totalPrice: z
      .number()
      .nonnegative({ error: '料金は0以上で入力してください' })
      .optional(),
    couponCode: z.string().max(20).optional().or(z.literal('')),
    status: z.enum(ReservationStatus).default('CONFIRMED'),
    notes: z
      .string()
      .max(1000, { error: 'メモは1000文字以内で入力してください' })
      .optional()
      .or(z.literal('')),
    sendNotificationEmail: z.boolean().default(false),
  })
  .refine(
    (data) => {
      const start = new Date(`${data.date}T${data.startTime}`)
      const end = new Date(`${data.date}T${data.endTime}`)
      return end > start
    },
    {
      error: '終了時間は開始時間より後に設定してください',
      path: ['endTime'],
    }
  )
  .refine(
    (data) => {
      const start = new Date(`${data.date}T${data.startTime}`)
      const end = new Date(`${data.date}T${data.endTime}`)
      const diffHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60)
      return diffHours >= 1
    },
    {
      error: '最低1時間以上の予約が必要です',
      path: ['endTime'],
    }
  )

export type UpdateReservationInput = z.input<typeof updateReservationSchema>
export type UpdateReservationData = z.output<typeof updateReservationSchema>
