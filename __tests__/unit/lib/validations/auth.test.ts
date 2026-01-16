/**
 * 認証バリデーションテスト
 *
 * src/lib/validations/auth.ts のユニットテスト
 */

import { describe, test, expect } from 'bun:test'
import {
  credentialsSchema,
  loginTokenSchema,
  loginTokenResponseSchema,
} from '@/lib/validations/auth'

describe('credentialsSchema', () => {
  const validCredentials = {
    email: 'admin@example.com',
    password: 'password123',
  }

  describe('正常系', () => {
    test('有効な認証情報は検証を通過', () => {
      const result = credentialsSchema.safeParse(validCredentials)
      expect(result.success).toBe(true)
    })

    test('パスワード1文字でも通過', () => {
      const result = credentialsSchema.safeParse({
        ...validCredentials,
        password: 'a',
      })
      expect(result.success).toBe(true)
    })
  })

  describe('email', () => {
    test('無効なメールアドレス形式はエラー', () => {
      const invalidEmails = [
        'invalid',
        'test@',
        '@example.com',
        'test@.com',
        '',
      ]

      for (const email of invalidEmails) {
        const result = credentialsSchema.safeParse({
          ...validCredentials,
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
        const result = credentialsSchema.safeParse({
          ...validCredentials,
          email,
        })
        expect(result.success).toBe(true)
      }
    })
  })

  describe('password', () => {
    test('空文字はエラー', () => {
      const result = credentialsSchema.safeParse({
        ...validCredentials,
        password: '',
      })
      expect(result.success).toBe(false)
    })

    test('undefinedはエラー', () => {
      const { password, ...withoutPassword } = validCredentials
      const result = credentialsSchema.safeParse(withoutPassword)
      expect(result.success).toBe(false)
    })
  })
})

describe('loginTokenSchema', () => {
  test('有効なトークン文字列は通過', () => {
    const validTokens = [
      'abc123',
      'a',
      'very-long-token-string-1234567890',
      '日本語トークン',
    ]

    for (const token of validTokens) {
      const result = loginTokenSchema.safeParse(token)
      expect(result.success).toBe(true)
    }
  })

  test('空文字はエラー', () => {
    const result = loginTokenSchema.safeParse('')
    expect(result.success).toBe(false)
  })

  test('数値はエラー', () => {
    const result = loginTokenSchema.safeParse(123)
    expect(result.success).toBe(false)
  })

  test('nullはエラー', () => {
    const result = loginTokenSchema.safeParse(null)
    expect(result.success).toBe(false)
  })

  test('undefinedはエラー', () => {
    const result = loginTokenSchema.safeParse(undefined)
    expect(result.success).toBe(false)
  })
})

describe('loginTokenResponseSchema', () => {
  const validResponse = {
    token: 'abc123',
    loginUrl: 'https://example.com/admin/login?token=abc123',
    expiresAt: '2025-12-31T23:59:59Z',
  }

  describe('正常系', () => {
    test('有効なレスポンスは通過', () => {
      const result = loginTokenResponseSchema.safeParse(validResponse)
      expect(result.success).toBe(true)
    })
  })

  describe('token', () => {
    test('空文字はエラー', () => {
      const result = loginTokenResponseSchema.safeParse({
        ...validResponse,
        token: '',
      })
      expect(result.success).toBe(false)
    })

    test('undefinedはエラー', () => {
      const { token, ...withoutToken } = validResponse
      const result = loginTokenResponseSchema.safeParse(withoutToken)
      expect(result.success).toBe(false)
    })
  })

  describe('loginUrl', () => {
    test('空文字はエラー', () => {
      const result = loginTokenResponseSchema.safeParse({
        ...validResponse,
        loginUrl: '',
      })
      expect(result.success).toBe(false)
    })

    test('undefinedはエラー', () => {
      const { loginUrl, ...withoutLoginUrl } = validResponse
      const result = loginTokenResponseSchema.safeParse(withoutLoginUrl)
      expect(result.success).toBe(false)
    })
  })

  describe('expiresAt', () => {
    test('空文字はエラー', () => {
      const result = loginTokenResponseSchema.safeParse({
        ...validResponse,
        expiresAt: '',
      })
      expect(result.success).toBe(false)
    })

    test('undefinedはエラー', () => {
      const { expiresAt, ...withoutExpiresAt } = validResponse
      const result = loginTokenResponseSchema.safeParse(withoutExpiresAt)
      expect(result.success).toBe(false)
    })

    test('日付形式の文字列は通過（形式チェックなし）', () => {
      const validDates = [
        '2025-12-31T23:59:59Z',
        '2025-12-31',
        'any-string-is-valid',
      ]

      for (const expiresAt of validDates) {
        const result = loginTokenResponseSchema.safeParse({
          ...validResponse,
          expiresAt,
        })
        expect(result.success).toBe(true)
      }
    })
  })
})
