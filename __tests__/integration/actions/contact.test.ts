/**
 * お問い合わせServer Action統合テスト
 *
 * src/actions/contact.ts のテスト
 *
 * 注: Server Actionsの直接テストは複雑なため、
 *     バリデーション + action-helpers の組み合わせをテスト
 */

import { describe, test, expect, mock, beforeEach } from 'bun:test'
import { contactSchema } from '@/lib/validations/contact'
import {
  extractFieldErrors,
  createValidationError,
  withValidation,
} from '@/lib/action-helpers'

// 有効なお問い合わせデータ
const VALID_CONTACT_INPUT = {
  name: '山田 太郎',
  email: 'yamada@example.com',
  phone: '090-1234-5678',
  subject: 'お問い合わせテスト',
  message: 'これはテストメッセージです。',
}

describe('Contact Action Integration', () => {
  describe('バリデーション + エラー抽出', () => {
    test('有効なデータはバリデーション通過', () => {
      const result = contactSchema.safeParse(VALID_CONTACT_INPUT)
      expect(result.success).toBe(true)
    })

    test('電話番号なしでもバリデーション通過', () => {
      const { phone, ...withoutPhone } = VALID_CONTACT_INPUT
      const result = contactSchema.safeParse(withoutPhone)
      expect(result.success).toBe(true)
    })

    test('名前が空の場合フィールドエラーが抽出される', () => {
      const result = contactSchema.safeParse({
        ...VALID_CONTACT_INPUT,
        name: '',
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        const fieldErrors = extractFieldErrors(result.error)
        expect(fieldErrors.name).toBeDefined()
        expect(fieldErrors.name.length).toBeGreaterThan(0)
      }
    })

    test('メールアドレスが無効な場合フィールドエラーが抽出される', () => {
      const result = contactSchema.safeParse({
        ...VALID_CONTACT_INPUT,
        email: 'invalid-email',
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        const fieldErrors = extractFieldErrors(result.error)
        expect(fieldErrors.email).toBeDefined()
      }
    })

    test('複数フィールドエラーが同時に抽出される', () => {
      const result = contactSchema.safeParse({
        ...VALID_CONTACT_INPUT,
        name: '',
        email: 'invalid',
        subject: '',
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        const fieldErrors = extractFieldErrors(result.error)
        expect(fieldErrors.name).toBeDefined()
        expect(fieldErrors.email).toBeDefined()
        expect(fieldErrors.subject).toBeDefined()
      }
    })
  })

  describe('createValidationError', () => {
    test('ActionFailure形式でエラーを返す', () => {
      const result = contactSchema.safeParse({
        ...VALID_CONTACT_INPUT,
        name: '',
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        const error = createValidationError(result.error)

        expect(error.success).toBe(false)
        expect(error.error).toBe('入力内容に誤りがあります')
        expect(error.fieldErrors?.name).toBeDefined()
      }
    })

    test('カスタムエラーメッセージを設定可能', () => {
      const result = contactSchema.safeParse({
        ...VALID_CONTACT_INPUT,
        name: '',
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        const error = createValidationError(result.error, 'カスタムエラー')

        expect(error.error).toBe('カスタムエラー')
      }
    })
  })

  describe('withValidation', () => {
    test('バリデーション成功時にハンドラーが実行される', async () => {
      const handler = mock(() =>
        Promise.resolve({ success: true, message: '送信完了' })
      )

      const result = await withValidation(
        contactSchema,
        VALID_CONTACT_INPUT,
        handler
      )

      expect(handler).toHaveBeenCalled()
      expect(result).toEqual({ success: true, message: '送信完了' })
    })

    test('バリデーション失敗時にハンドラーは実行されない', async () => {
      const handler = mock(() =>
        Promise.resolve({ success: true, message: '送信完了' })
      )

      const result = await withValidation(
        contactSchema,
        { ...VALID_CONTACT_INPUT, name: '' },
        handler
      )

      expect(handler).not.toHaveBeenCalled()
      expect(result.success).toBe(false)
    })

    test('ハンドラーに型安全なデータが渡される', async () => {
      let receivedData: unknown = null

      await withValidation(contactSchema, VALID_CONTACT_INPUT, async (data) => {
        receivedData = data
        return { success: true, message: '送信完了' }
      })

      expect(receivedData).toEqual(VALID_CONTACT_INPUT)
    })
  })

  describe('フィールド境界値テスト', () => {
    test('名前100文字はOK', () => {
      const result = contactSchema.safeParse({
        ...VALID_CONTACT_INPUT,
        name: 'あ'.repeat(100),
      })
      expect(result.success).toBe(true)
    })

    test('名前101文字はNG', () => {
      const result = contactSchema.safeParse({
        ...VALID_CONTACT_INPUT,
        name: 'あ'.repeat(101),
      })
      expect(result.success).toBe(false)
    })

    test('件名200文字はOK', () => {
      const result = contactSchema.safeParse({
        ...VALID_CONTACT_INPUT,
        subject: 'あ'.repeat(200),
      })
      expect(result.success).toBe(true)
    })

    test('件名201文字はNG', () => {
      const result = contactSchema.safeParse({
        ...VALID_CONTACT_INPUT,
        subject: 'あ'.repeat(201),
      })
      expect(result.success).toBe(false)
    })

    test('メッセージ5000文字はOK', () => {
      const result = contactSchema.safeParse({
        ...VALID_CONTACT_INPUT,
        message: 'あ'.repeat(5000),
      })
      expect(result.success).toBe(true)
    })

    test('メッセージ5001文字はNG', () => {
      const result = contactSchema.safeParse({
        ...VALID_CONTACT_INPUT,
        message: 'あ'.repeat(5001),
      })
      expect(result.success).toBe(false)
    })

    test('電話番号20文字はOK', () => {
      const result = contactSchema.safeParse({
        ...VALID_CONTACT_INPUT,
        phone: '0'.repeat(20),
      })
      expect(result.success).toBe(true)
    })

    test('電話番号21文字はNG', () => {
      const result = contactSchema.safeParse({
        ...VALID_CONTACT_INPUT,
        phone: '0'.repeat(21),
      })
      expect(result.success).toBe(false)
    })
  })

  describe('電話番号形式', () => {
    test('ハイフン付き携帯番号は許可', () => {
      const result = contactSchema.safeParse({
        ...VALID_CONTACT_INPUT,
        phone: '090-1234-5678',
      })
      expect(result.success).toBe(true)
    })

    test('ハイフンなし携帯番号は許可', () => {
      const result = contactSchema.safeParse({
        ...VALID_CONTACT_INPUT,
        phone: '09012345678',
      })
      expect(result.success).toBe(true)
    })

    test('固定電話番号は許可', () => {
      const result = contactSchema.safeParse({
        ...VALID_CONTACT_INPUT,
        phone: '03-1234-5678',
      })
      expect(result.success).toBe(true)
    })

    test('アルファベット含む番号は不許可', () => {
      const result = contactSchema.safeParse({
        ...VALID_CONTACT_INPUT,
        phone: '090-ABCD-5678',
      })
      expect(result.success).toBe(false)
    })
  })
})
