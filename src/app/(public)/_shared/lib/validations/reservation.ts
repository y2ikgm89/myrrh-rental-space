import { z } from 'zod'

/**
 * 予約フォーム用バリデーションスキーマ
 *
 * クライアント・サーバー両方で使用
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
 * 予約顧客情報スキーマ
 */
export const customerInfoSchema = z.object({
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
    .min(1, { error: '電話番号を入力してください' })
    .regex(/^[0-9-]+$/, { error: '電話番号は数字とハイフンのみで入力してください' })
    .max(20, { error: '電話番号は20文字以内で入力してください' }),
})

/**
 * 予約日時スキーマ
 */
export const reservationDateTimeSchema = z
  .object({
    date: dateStringSchema,
    startTime: timeStringSchema,
    endTime: timeStringSchema,
  })
  .refine(
    (data) => {
      const start = new Date(`${data.date}T${data.startTime}`)
      const end = new Date(`${data.date}T${data.endTime}`)
      return end > start
    },
    {
      message: '終了時間は開始時間より後に設定してください',
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
      message: '最低1時間以上の予約が必要です',
      path: ['endTime'],
    }
  )
  .refine(
    (data) => {
      const reservationDate = new Date(`${data.date}T${data.startTime}`)
      const now = new Date()
      return reservationDate > now
    },
    {
      message: '過去の日時は予約できません',
      path: ['date'],
    }
  )

/**
 * 予約リクエストスキーマ（基本フィールド）
 */
export const baseReservationSchema = z.object({
  spaceId: z.string().uuid({ error: 'スペースIDが無効です' }),
  date: dateStringSchema,
  startTime: timeStringSchema,
  endTime: timeStringSchema,
  lastName: z
    .string()
    .min(1, { error: '姓を入力してください' })
    .max(50, { error: '姓は50文字以内で入力してください' }),
  firstName: z
    .string()
    .min(1, { error: '名を入力してください' })
    .max(50, { error: '名は50文字以内で入力してください' }),
  // カナ（IMEで自動取得、任意）
  lastNameKana: z
    .string()
    .max(50, { error: 'セイは50文字以内で入力してください' })
    .optional(),
  firstNameKana: z
    .string()
    .max(50, { error: 'メイは50文字以内で入力してください' })
    .optional(),
  email: z
    .string()
    .min(1, { error: 'メールアドレスを入力してください' })
    .email({ error: '有効なメールアドレスを入力してください' }),
  phoneNumber: z
    .string()
    .min(1, { error: '電話番号を入力してください' })
    .regex(/^[0-9-]+$/, { error: '電話番号は数字とハイフンのみで入力してください' })
    .max(20, { error: '電話番号は20文字以内で入力してください' }),
  notes: z
    .string()
    .max(1000, { error: '備考は1000文字以内で入力してください' })
    .optional(),
  // クーポンコード（オプション）
  couponCode: z
    .string()
    .max(20, { error: 'クーポンコードは20文字以内で入力してください' })
    .optional(),
})

/**
 * 規約同意スキーマ
 */
export const termsAgreementSchema = z.object({
  agreedToTerms: z
    .boolean()
    .refine((val) => val === true, {
      message: '利用規約とプライバシーポリシーに同意してください',
    }),
})

/**
 * 予約リクエストスキーマ（完全版 - 規約同意なし、後方互換性のため維持）
 */
export const reservationSchema = baseReservationSchema

/**
 * 予約リクエストスキーマ（規約同意あり）
 */
export const reservationWithTermsSchema = baseReservationSchema.merge(termsAgreementSchema)

export type ReservationInput = z.input<typeof reservationSchema>
export type ReservationData = z.output<typeof reservationSchema>
export type ReservationWithTermsInput = z.input<typeof reservationWithTermsSchema>
export type CustomerInfoInput = z.input<typeof customerInfoSchema>

/**
 * Server Action のレスポンス型
 */
export type ReservationActionResult =
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

// 時間枠・カレンダー日付の型は @/shared/lib/reservation から re-export
export type { TimeSlot, CalendarDate } from '@/shared/lib/reservation'
