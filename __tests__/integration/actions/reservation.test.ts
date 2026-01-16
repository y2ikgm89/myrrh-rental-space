/**
 * 予約Server Action統合テスト
 *
 * src/actions/reservation.ts のテスト
 *
 * 注: Server Actionsの直接テストは複雑なため、
 *     バリデーション + action-helpers の組み合わせをテスト
 */

import { describe, test, expect, mock, beforeEach } from 'bun:test'
import {
  reservationSchema,
  reservationWithTermsSchema,
} from '@/lib/validations/reservation'
import {
  extractFieldErrors,
  createValidationError,
  withValidation,
} from '@/lib/action-helpers'

// テスト用の未来日付を生成
const getFutureDate = (daysAhead: number): string => {
  const date = new Date()
  date.setDate(date.getDate() + daysAhead)
  return date.toISOString().split('T')[0]
}

// 有効な予約入力データ
const VALID_RESERVATION_INPUT = {
  spaceId: '550e8400-e29b-41d4-a716-446655440000',
  date: getFutureDate(30),
  startTime: '10:00',
  endTime: '12:00',
  lastName: '山田',
  firstName: '太郎',
  email: 'yamada@example.com',
  phoneNumber: '090-1234-5678',
  notes: 'テスト予約です',
}

const VALID_RESERVATION_WITH_TERMS_INPUT = {
  ...VALID_RESERVATION_INPUT,
  agreedToTerms: true,
}

describe('Reservation Action Integration', () => {
  describe('バリデーション + エラー抽出', () => {
    test('有効なデータはバリデーション通過', () => {
      const result = reservationSchema.safeParse(VALID_RESERVATION_INPUT)
      expect(result.success).toBe(true)
    })

    test('規約同意ありでバリデーション通過', () => {
      const result = reservationWithTermsSchema.safeParse(
        VALID_RESERVATION_WITH_TERMS_INPUT
      )
      expect(result.success).toBe(true)
    })

    test('spaceIdが空の場合フィールドエラーが抽出される', () => {
      const result = reservationSchema.safeParse({
        ...VALID_RESERVATION_INPUT,
        spaceId: '',
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        const fieldErrors = extractFieldErrors(result.error)
        expect(fieldErrors.spaceId).toBeDefined()
        expect(fieldErrors.spaceId.length).toBeGreaterThan(0)
      }
    })

    test('複数フィールドエラーが同時に抽出される', () => {
      const result = reservationSchema.safeParse({
        ...VALID_RESERVATION_INPUT,
        spaceId: 'invalid',
        lastName: '',
        email: 'invalid-email',
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        const fieldErrors = extractFieldErrors(result.error)
        expect(fieldErrors.spaceId).toBeDefined()
        expect(fieldErrors.lastName).toBeDefined()
        expect(fieldErrors.email).toBeDefined()
      }
    })
  })

  describe('createValidationError', () => {
    test('ActionFailure形式でエラーを返す', () => {
      const result = reservationSchema.safeParse({
        ...VALID_RESERVATION_INPUT,
        lastName: '',
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        const error = createValidationError(result.error)

        expect(error.success).toBe(false)
        expect(error.error).toBe('入力内容に誤りがあります')
        expect(error.fieldErrors?.lastName).toBeDefined()
      }
    })
  })

  describe('withValidation', () => {
    test('バリデーション成功時にハンドラーが実行される', async () => {
      const handler = mock(() =>
        Promise.resolve({
          success: true,
          message: '予約を受け付けました',
          reservationId: 'test-id',
        })
      )

      const result = await withValidation(
        reservationSchema,
        VALID_RESERVATION_INPUT,
        handler
      )

      expect(handler).toHaveBeenCalled()
      expect(result).toEqual({
        success: true,
        message: '予約を受け付けました',
        reservationId: 'test-id',
      })
    })

    test('バリデーション失敗時にハンドラーは実行されない', async () => {
      const handler = mock(() =>
        Promise.resolve({
          success: true,
          message: '予約を受け付けました',
          reservationId: 'test-id',
        })
      )

      const result = await withValidation(
        reservationSchema,
        { ...VALID_RESERVATION_INPUT, email: 'invalid' },
        handler
      )

      expect(handler).not.toHaveBeenCalled()
      expect(result.success).toBe(false)
    })

    test('ハンドラーに型安全なデータが渡される', async () => {
      let receivedData: unknown = null

      await withValidation(
        reservationSchema,
        VALID_RESERVATION_INPUT,
        async (data) => {
          receivedData = data
          return {
            success: true,
            message: '予約を受け付けました',
            reservationId: 'test-id',
          }
        }
      )

      expect(receivedData).toEqual(VALID_RESERVATION_INPUT)
    })
  })

  describe('日時バリデーション', () => {
    test('無効な日付形式はエラー', () => {
      const invalidDates = ['2024/12/01', '12-01-2024', '2024-1-1', 'invalid']

      for (const date of invalidDates) {
        const result = reservationSchema.safeParse({
          ...VALID_RESERVATION_INPUT,
          date,
        })
        expect(result.success).toBe(false)
      }
    })

    test('無効な時刻形式はエラー', () => {
      const invalidTimes = ['10:00:00', '10', '25:00', '10:60']

      for (const time of invalidTimes) {
        const result = reservationSchema.safeParse({
          ...VALID_RESERVATION_INPUT,
          startTime: time,
        })
        expect(result.success).toBe(false)
      }
    })

    test('有効な時刻形式はOK', () => {
      const validTimes = ['00:00', '09:30', '12:00', '18:45', '23:59']

      for (const time of validTimes) {
        const result = reservationSchema.safeParse({
          ...VALID_RESERVATION_INPUT,
          startTime: time,
          endTime: '23:59',
        })
        expect(result.success).toBe(true)
      }
    })
  })

  describe('顧客情報バリデーション', () => {
    test('姓が必須', () => {
      const result = reservationSchema.safeParse({
        ...VALID_RESERVATION_INPUT,
        lastName: '',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        const fieldErrors = extractFieldErrors(result.error)
        expect(fieldErrors.lastName).toBeDefined()
      }
    })

    test('名が必須', () => {
      const result = reservationSchema.safeParse({
        ...VALID_RESERVATION_INPUT,
        firstName: '',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        const fieldErrors = extractFieldErrors(result.error)
        expect(fieldErrors.firstName).toBeDefined()
      }
    })

    test('有効なメールアドレス形式が必須', () => {
      const invalidEmails = ['invalid', 'test@', '@example.com', 'test@.com']

      for (const email of invalidEmails) {
        const result = reservationSchema.safeParse({
          ...VALID_RESERVATION_INPUT,
          email,
        })
        expect(result.success).toBe(false)
      }
    })

    test('電話番号は数字とハイフンのみ', () => {
      const result = reservationSchema.safeParse({
        ...VALID_RESERVATION_INPUT,
        phoneNumber: '090-ABCD-5678',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('フィールド境界値テスト', () => {
    test('姓50文字はOK', () => {
      const result = reservationSchema.safeParse({
        ...VALID_RESERVATION_INPUT,
        lastName: 'あ'.repeat(50),
      })
      expect(result.success).toBe(true)
    })

    test('姓51文字はNG', () => {
      const result = reservationSchema.safeParse({
        ...VALID_RESERVATION_INPUT,
        lastName: 'あ'.repeat(51),
      })
      expect(result.success).toBe(false)
    })

    test('名50文字はOK', () => {
      const result = reservationSchema.safeParse({
        ...VALID_RESERVATION_INPUT,
        firstName: 'あ'.repeat(50),
      })
      expect(result.success).toBe(true)
    })

    test('名51文字はNG', () => {
      const result = reservationSchema.safeParse({
        ...VALID_RESERVATION_INPUT,
        firstName: 'あ'.repeat(51),
      })
      expect(result.success).toBe(false)
    })

    test('電話番号20文字はOK', () => {
      const result = reservationSchema.safeParse({
        ...VALID_RESERVATION_INPUT,
        phoneNumber: '0'.repeat(20),
      })
      expect(result.success).toBe(true)
    })

    test('電話番号21文字はNG', () => {
      const result = reservationSchema.safeParse({
        ...VALID_RESERVATION_INPUT,
        phoneNumber: '0'.repeat(21),
      })
      expect(result.success).toBe(false)
    })

    test('備考1000文字はOK', () => {
      const result = reservationSchema.safeParse({
        ...VALID_RESERVATION_INPUT,
        notes: 'あ'.repeat(1000),
      })
      expect(result.success).toBe(true)
    })

    test('備考1001文字はNG', () => {
      const result = reservationSchema.safeParse({
        ...VALID_RESERVATION_INPUT,
        notes: 'あ'.repeat(1001),
      })
      expect(result.success).toBe(false)
    })
  })

  describe('規約同意バリデーション', () => {
    test('agreedToTerms=trueで検証通過', () => {
      const result = reservationWithTermsSchema.safeParse(
        VALID_RESERVATION_WITH_TERMS_INPUT
      )
      expect(result.success).toBe(true)
    })

    test('agreedToTerms=falseはエラー', () => {
      const result = reservationWithTermsSchema.safeParse({
        ...VALID_RESERVATION_WITH_TERMS_INPUT,
        agreedToTerms: false,
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        const fieldErrors = extractFieldErrors(result.error)
        expect(fieldErrors.agreedToTerms).toBeDefined()
      }
    })

    test('agreedToTerms未定義はエラー', () => {
      const { agreedToTerms, ...withoutTerms } =
        VALID_RESERVATION_WITH_TERMS_INPUT
      const result = reservationWithTermsSchema.safeParse(withoutTerms)
      expect(result.success).toBe(false)
    })
  })

  describe('spaceId UUID形式', () => {
    test('有効なUUID v4は許可', () => {
      const validUUIDs = [
        '550e8400-e29b-41d4-a716-446655440000',
        '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
        'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      ]

      for (const spaceId of validUUIDs) {
        const result = reservationSchema.safeParse({
          ...VALID_RESERVATION_INPUT,
          spaceId,
        })
        expect(result.success).toBe(true)
      }
    })

    test('無効なUUIDはエラー', () => {
      const invalidUUIDs = [
        'invalid-uuid',
        '550e8400-e29b-41d4-a716',
        'not-a-uuid',
        '',
      ]

      for (const spaceId of invalidUUIDs) {
        const result = reservationSchema.safeParse({
          ...VALID_RESERVATION_INPUT,
          spaceId,
        })
        expect(result.success).toBe(false)
      }
    })
  })
})
