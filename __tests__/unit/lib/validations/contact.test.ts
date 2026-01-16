/**
 * お問い合わせバリデーションテスト
 *
 * src/lib/validations/contact.ts のユニットテスト
 */

import { describe, test, expect } from 'bun:test'
import { contactSchema } from '@/lib/validations/contact'

// 有効なお問い合わせデータ
const VALID_CONTACT_INPUT = {
  name: '山田 太郎',
  email: 'yamada@example.com',
  phone: '090-1234-5678',
  subject: 'お問い合わせの件名',
  message: 'お問い合わせの本文です。',
}

describe('contactSchema', () => {
  describe('正常系', () => {
    test('有効なデータは検証を通過', () => {
      const result = contactSchema.safeParse(VALID_CONTACT_INPUT)
      expect(result.success).toBe(true)
    })

    test('phoneはオプショナル', () => {
      const { phone, ...withoutPhone } = VALID_CONTACT_INPUT
      const result = contactSchema.safeParse(withoutPhone)
      expect(result.success).toBe(true)
    })

    test('空のphoneは許可', () => {
      const result = contactSchema.safeParse({
        ...VALID_CONTACT_INPUT,
        phone: '',
      })
      expect(result.success).toBe(true)
    })
  })

  describe('name', () => {
    test('空文字はエラー', () => {
      const result = contactSchema.safeParse({
        ...VALID_CONTACT_INPUT,
        name: '',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('お名前')
      }
    })

    test('100文字超過はエラー', () => {
      const result = contactSchema.safeParse({
        ...VALID_CONTACT_INPUT,
        name: 'あ'.repeat(101),
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('100文字以内')
      }
    })

    test('100文字ちょうどは許可', () => {
      const result = contactSchema.safeParse({
        ...VALID_CONTACT_INPUT,
        name: 'あ'.repeat(100),
      })
      expect(result.success).toBe(true)
    })
  })

  describe('email', () => {
    test('空文字はエラー', () => {
      const result = contactSchema.safeParse({
        ...VALID_CONTACT_INPUT,
        email: '',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('メールアドレス')
      }
    })

    test('無効なメールアドレス形式', () => {
      const invalidEmails = ['invalid', 'test@', '@example.com', 'test@.com']

      for (const email of invalidEmails) {
        const result = contactSchema.safeParse({
          ...VALID_CONTACT_INPUT,
          email,
        })
        expect(result.success).toBe(false)
      }
    })

    test('有効なメールアドレス形式', () => {
      const validEmails = [
        'test@example.com',
        'user.name@domain.co.jp',
        'user+tag@example.org',
      ]

      for (const email of validEmails) {
        const result = contactSchema.safeParse({
          ...VALID_CONTACT_INPUT,
          email,
        })
        expect(result.success).toBe(true)
      }
    })
  })

  describe('phone', () => {
    test('文字が含まれるとエラー', () => {
      const result = contactSchema.safeParse({
        ...VALID_CONTACT_INPUT,
        phone: '090-ABCD-5678',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('数字とハイフンのみ')
      }
    })

    test('20文字超過はエラー', () => {
      const result = contactSchema.safeParse({
        ...VALID_CONTACT_INPUT,
        phone: '0'.repeat(21),
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('20文字以内')
      }
    })

    test('有効な電話番号形式', () => {
      const validPhones = [
        '090-1234-5678',
        '03-1234-5678',
        '0312345678',
      ]

      for (const phone of validPhones) {
        const result = contactSchema.safeParse({
          ...VALID_CONTACT_INPUT,
          phone,
        })
        expect(result.success).toBe(true)
      }
    })

    test('undefinedは許可', () => {
      const { phone, ...withoutPhone } = VALID_CONTACT_INPUT
      const result = contactSchema.safeParse(withoutPhone)
      expect(result.success).toBe(true)
    })
  })

  describe('subject', () => {
    test('空文字はエラー', () => {
      const result = contactSchema.safeParse({
        ...VALID_CONTACT_INPUT,
        subject: '',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('件名')
      }
    })

    test('200文字超過はエラー', () => {
      const result = contactSchema.safeParse({
        ...VALID_CONTACT_INPUT,
        subject: 'あ'.repeat(201),
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('200文字以内')
      }
    })

    test('200文字ちょうどは許可', () => {
      const result = contactSchema.safeParse({
        ...VALID_CONTACT_INPUT,
        subject: 'あ'.repeat(200),
      })
      expect(result.success).toBe(true)
    })
  })

  describe('message', () => {
    test('空文字はエラー', () => {
      const result = contactSchema.safeParse({
        ...VALID_CONTACT_INPUT,
        message: '',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('お問い合わせ内容')
      }
    })

    test('5000文字超過はエラー', () => {
      const result = contactSchema.safeParse({
        ...VALID_CONTACT_INPUT,
        message: 'あ'.repeat(5001),
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('5000文字以内')
      }
    })

    test('5000文字ちょうどは許可', () => {
      const result = contactSchema.safeParse({
        ...VALID_CONTACT_INPUT,
        message: 'あ'.repeat(5000),
      })
      expect(result.success).toBe(true)
    })
  })
})
