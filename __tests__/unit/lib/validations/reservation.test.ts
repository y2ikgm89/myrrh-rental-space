/**
 * 予約バリデーションテスト
 *
 * src/lib/validations/reservation.ts のユニットテスト
 */

import { describe, test, expect } from 'bun:test'
import {
  reservationSchema,
  reservationWithTermsSchema,
  customerInfoSchema,
  reservationDateTimeSchema,
} from '@/lib/validations/reservation'
import {
  VALID_RESERVATION_INPUT,
  VALID_RESERVATION_WITH_TERMS_INPUT,
} from '../../../fixtures/reservations'

describe('reservationSchema', () => {
  describe('正常系', () => {
    test('有効なデータは検証を通過', () => {
      const result = reservationSchema.safeParse(VALID_RESERVATION_INPUT)
      expect(result.success).toBe(true)
    })

    test('notesはオプショナル', () => {
      const { notes, ...withoutNotes } = VALID_RESERVATION_INPUT
      const result = reservationSchema.safeParse(withoutNotes)
      expect(result.success).toBe(true)
    })

    test('空のnotesは許可', () => {
      const result = reservationSchema.safeParse({
        ...VALID_RESERVATION_INPUT,
        notes: '',
      })
      expect(result.success).toBe(true)
    })
  })

  describe('spaceId', () => {
    test('無効なUUID', () => {
      const result = reservationSchema.safeParse({
        ...VALID_RESERVATION_INPUT,
        spaceId: 'invalid-uuid',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('スペースIDが無効')
      }
    })

    test('空文字', () => {
      const result = reservationSchema.safeParse({
        ...VALID_RESERVATION_INPUT,
        spaceId: '',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('date', () => {
    test('YYYY-MM-DD形式が必要', () => {
      const invalidDates = [
        '2024/12/01',
        '12-01-2024',
        '2024-1-1',
        '24-12-01',
        'invalid',
      ]

      for (const date of invalidDates) {
        const result = reservationSchema.safeParse({
          ...VALID_RESERVATION_INPUT,
          date,
        })
        expect(result.success).toBe(false)
      }
    })

    test('有効な日付形式', () => {
      const validDates = ['2099-01-01', '2099-12-31', '2100-06-15']

      for (const date of validDates) {
        const result = reservationSchema.safeParse({
          ...VALID_RESERVATION_INPUT,
          date,
        })
        expect(result.success).toBe(true)
      }
    })
  })

  describe('time', () => {
    test('HH:MM形式が必要', () => {
      const invalidTimes = ['10:00:00', '10', '10am', '25:00', '10:60']

      for (const time of invalidTimes) {
        const result = reservationSchema.safeParse({
          ...VALID_RESERVATION_INPUT,
          startTime: time,
        })
        expect(result.success).toBe(false)
      }
    })

    test('有効な時間形式', () => {
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

  describe('顧客情報', () => {
    test('姓が空', () => {
      const result = reservationSchema.safeParse({
        ...VALID_RESERVATION_INPUT,
        lastName: '',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('姓')
      }
    })

    test('名が空', () => {
      const result = reservationSchema.safeParse({
        ...VALID_RESERVATION_INPUT,
        firstName: '',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('名')
      }
    })

    test('姓が50文字超過', () => {
      const result = reservationSchema.safeParse({
        ...VALID_RESERVATION_INPUT,
        lastName: 'あ'.repeat(51),
      })
      expect(result.success).toBe(false)
    })

    test('無効なメールアドレス', () => {
      const invalidEmails = ['invalid', 'test@', '@example.com', 'test@.com']

      for (const email of invalidEmails) {
        const result = reservationSchema.safeParse({
          ...VALID_RESERVATION_INPUT,
          email,
        })
        expect(result.success).toBe(false)
      }
    })

    test('有効なメールアドレス', () => {
      const validEmails = [
        'test@example.com',
        'user.name@domain.co.jp',
        'user+tag@example.org',
      ]

      for (const email of validEmails) {
        const result = reservationSchema.safeParse({
          ...VALID_RESERVATION_INPUT,
          email,
        })
        expect(result.success).toBe(true)
      }
    })

    test('電話番号に文字が含まれる', () => {
      const result = reservationSchema.safeParse({
        ...VALID_RESERVATION_INPUT,
        phoneNumber: '090-ABCD-5678',
      })
      expect(result.success).toBe(false)
    })

    test('電話番号が20文字超過', () => {
      const result = reservationSchema.safeParse({
        ...VALID_RESERVATION_INPUT,
        phoneNumber: '0'.repeat(21),
      })
      expect(result.success).toBe(false)
    })

    test('有効な電話番号形式', () => {
      const validPhones = [
        '090-1234-5678',
        '03-1234-5678',
        '0312345678',
        '090-1234-5678',
      ]

      for (const phoneNumber of validPhones) {
        const result = reservationSchema.safeParse({
          ...VALID_RESERVATION_INPUT,
          phoneNumber,
        })
        expect(result.success).toBe(true)
      }
    })
  })

  describe('notes', () => {
    test('1000文字超過', () => {
      const result = reservationSchema.safeParse({
        ...VALID_RESERVATION_INPUT,
        notes: 'あ'.repeat(1001),
      })
      expect(result.success).toBe(false)
    })

    test('1000文字ちょうど', () => {
      const result = reservationSchema.safeParse({
        ...VALID_RESERVATION_INPUT,
        notes: 'あ'.repeat(1000),
      })
      expect(result.success).toBe(true)
    })
  })
})

describe('reservationWithTermsSchema', () => {
  test('規約同意ありで検証を通過', () => {
    const result = reservationWithTermsSchema.safeParse(
      VALID_RESERVATION_WITH_TERMS_INPUT
    )
    expect(result.success).toBe(true)
  })

  test('規約未同意はエラー', () => {
    const result = reservationWithTermsSchema.safeParse({
      ...VALID_RESERVATION_WITH_TERMS_INPUT,
      agreedToTerms: false,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('利用規約')
    }
  })

  test('agreedToTermsが未定義', () => {
    const { agreedToTerms, ...withoutTerms } = VALID_RESERVATION_WITH_TERMS_INPUT
    const result = reservationWithTermsSchema.safeParse(withoutTerms)
    expect(result.success).toBe(false)
  })
})

describe('customerInfoSchema', () => {
  const validCustomer = {
    lastName: '山田',
    firstName: '太郎',
    email: 'yamada@example.com',
    phoneNumber: '090-1234-5678',
  }

  test('正常な顧客情報', () => {
    const result = customerInfoSchema.safeParse(validCustomer)
    expect(result.success).toBe(true)
  })

  test('姓が空', () => {
    const result = customerInfoSchema.safeParse({
      ...validCustomer,
      lastName: '',
    })
    expect(result.success).toBe(false)
  })

  test('名が空', () => {
    const result = customerInfoSchema.safeParse({
      ...validCustomer,
      firstName: '',
    })
    expect(result.success).toBe(false)
  })

  test('無効なメールアドレス', () => {
    const result = customerInfoSchema.safeParse({
      ...validCustomer,
      email: 'invalid-email',
    })
    expect(result.success).toBe(false)
  })

  test('不正な電話番号（文字含む）', () => {
    const result = customerInfoSchema.safeParse({
      ...validCustomer,
      phoneNumber: '090-ABCD-5678',
    })
    expect(result.success).toBe(false)
  })
})

describe('reservationDateTimeSchema', () => {
  const futureDate = new Date()
  futureDate.setDate(futureDate.getDate() + 30)
  const dateStr = futureDate.toISOString().split('T')[0]

  const validDateTime = {
    date: dateStr,
    startTime: '10:00',
    endTime: '12:00',
  }

  test('有効な日時データ', () => {
    const result = reservationDateTimeSchema.safeParse(validDateTime)
    expect(result.success).toBe(true)
  })

  test('終了時間が開始時間より前', () => {
    const result = reservationDateTimeSchema.safeParse({
      ...validDateTime,
      startTime: '12:00',
      endTime: '10:00',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const endTimeError = result.error.issues.find(
        (i) => i.path.includes('endTime')
      )
      expect(endTimeError?.message).toContain('終了時間は開始時間より後')
    }
  })

  test('1時間未満の予約', () => {
    const result = reservationDateTimeSchema.safeParse({
      ...validDateTime,
      startTime: '10:00',
      endTime: '10:30',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const endTimeError = result.error.issues.find(
        (i) => i.path.includes('endTime')
      )
      expect(endTimeError?.message).toContain('最低1時間以上')
    }
  })

  test('ちょうど1時間は許可', () => {
    const result = reservationDateTimeSchema.safeParse({
      ...validDateTime,
      startTime: '10:00',
      endTime: '11:00',
    })
    expect(result.success).toBe(true)
  })

  test('過去の日時', () => {
    const pastDate = new Date()
    pastDate.setDate(pastDate.getDate() - 1)
    const pastDateStr = pastDate.toISOString().split('T')[0]

    const result = reservationDateTimeSchema.safeParse({
      ...validDateTime,
      date: pastDateStr,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const dateError = result.error.issues.find((i) => i.path.includes('date'))
      expect(dateError?.message).toContain('過去の日時')
    }
  })
})
