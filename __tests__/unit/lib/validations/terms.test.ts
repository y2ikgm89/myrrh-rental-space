/**
 * 利用規約バリデーションテスト
 *
 * src/lib/validations/terms.ts のユニットテスト
 */

import { describe, test, expect } from 'bun:test'
import {
  createTermsSchema,
  updateTermsSchema,
  createTermsVersionSchema,
  publishTermsVersionSchema,
  updateTermsVersionSchema,
  recordTermsAgreementSchema,
  getTermsForSpaceSchema,
  agreeToTermsSchema,
  TERMS_TYPES,
} from '@/lib/validations/terms'

// 有効な規約作成データ
const VALID_CREATE_TERMS = {
  type: 'TERMS_OF_USE' as const,
  title: '利用規約',
  slug: 'terms-of-use',
  isActive: true,
}

describe('createTermsSchema', () => {
  describe('正常系', () => {
    test('有効なデータは検証を通過', () => {
      const result = createTermsSchema.safeParse(VALID_CREATE_TERMS)
      expect(result.success).toBe(true)
    })

    test('デフォルト値が適用される', () => {
      const result = createTermsSchema.safeParse({
        type: 'PRIVACY_POLICY',
        title: 'プライバシーポリシー',
        slug: 'privacy',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.isActive).toBe(true)
      }
    })
  })

  describe('type', () => {
    test('有効なTermsType値は許可', () => {
      const validTypes = [
        'TERMS_OF_USE',
        'PRIVACY_POLICY',
        'CANCELLATION',
        'PAYMENT',
        'CUSTOM',
      ]

      for (const type of validTypes) {
        const result = createTermsSchema.safeParse({
          ...VALID_CREATE_TERMS,
          type,
        })
        expect(result.success).toBe(true)
      }
    })

    test('無効なtype値はエラー', () => {
      const result = createTermsSchema.safeParse({
        ...VALID_CREATE_TERMS,
        type: 'INVALID',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('title', () => {
    test('空文字はエラー', () => {
      const result = createTermsSchema.safeParse({
        ...VALID_CREATE_TERMS,
        title: '',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('タイトル')
      }
    })

    test('100文字超過はエラー', () => {
      const result = createTermsSchema.safeParse({
        ...VALID_CREATE_TERMS,
        title: 'あ'.repeat(101),
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('100文字以内')
      }
    })

    test('100文字ちょうどは許可', () => {
      const result = createTermsSchema.safeParse({
        ...VALID_CREATE_TERMS,
        title: 'あ'.repeat(100),
      })
      expect(result.success).toBe(true)
    })
  })

  describe('slug', () => {
    test('空文字はエラー', () => {
      const result = createTermsSchema.safeParse({
        ...VALID_CREATE_TERMS,
        slug: '',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('スラッグ')
      }
    })

    test('50文字超過はエラー', () => {
      const result = createTermsSchema.safeParse({
        ...VALID_CREATE_TERMS,
        slug: 'a'.repeat(51),
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('50文字以内')
      }
    })

    test('無効なスラッグ形式はエラー', () => {
      const invalidSlugs = ['Test', 'test_slug', 'test slug', 'テスト']

      for (const slug of invalidSlugs) {
        const result = createTermsSchema.safeParse({
          ...VALID_CREATE_TERMS,
          slug,
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('小文字英数字とハイフン')
        }
      }
    })

    test('有効なスラッグ形式は許可', () => {
      const validSlugs = ['terms', 'terms-of-use', 'privacy-policy-2024', '123']

      for (const slug of validSlugs) {
        const result = createTermsSchema.safeParse({
          ...VALID_CREATE_TERMS,
          slug,
        })
        expect(result.success).toBe(true)
      }
    })
  })

  describe('isActive', () => {
    test('true/falseは許可', () => {
      for (const isActive of [true, false]) {
        const result = createTermsSchema.safeParse({
          ...VALID_CREATE_TERMS,
          isActive,
        })
        expect(result.success).toBe(true)
      }
    })
  })
})

describe('updateTermsSchema', () => {
  test('空オブジェクトは許可', () => {
    const result = updateTermsSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  test('部分的な更新は許可', () => {
    const result = updateTermsSchema.safeParse({ title: '新しいタイトル' })
    expect(result.success).toBe(true)
  })

  test('全フィールド更新は許可', () => {
    const result = updateTermsSchema.safeParse(VALID_CREATE_TERMS)
    expect(result.success).toBe(true)
  })

  test('無効なtype値はエラー', () => {
    const result = updateTermsSchema.safeParse({ type: 'INVALID' })
    expect(result.success).toBe(false)
  })
})

describe('createTermsVersionSchema', () => {
  describe('正常系', () => {
    test('有効なデータは検証を通過', () => {
      const result = createTermsVersionSchema.safeParse({
        termsId: '123e4567-e89b-12d3-a456-426614174000',
        content: 'これは規約の内容です。',
      })
      expect(result.success).toBe(true)
    })
  })

  describe('termsId', () => {
    test('無効なUUIDはエラー', () => {
      const result = createTermsVersionSchema.safeParse({
        termsId: 'invalid-uuid',
        content: 'コンテンツ',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('規約IDが無効')
      }
    })
  })

  describe('content', () => {
    test('空文字はエラー', () => {
      const result = createTermsVersionSchema.safeParse({
        termsId: '123e4567-e89b-12d3-a456-426614174000',
        content: '',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('コンテンツ')
      }
    })
  })
})

describe('publishTermsVersionSchema', () => {
  test('有効なUUIDは許可', () => {
    const result = publishTermsVersionSchema.safeParse({
      versionId: '123e4567-e89b-12d3-a456-426614174000',
    })
    expect(result.success).toBe(true)
  })

  test('無効なUUIDはエラー', () => {
    const result = publishTermsVersionSchema.safeParse({
      versionId: 'invalid-uuid',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('バージョンIDが無効')
    }
  })
})

describe('updateTermsVersionSchema', () => {
  test('有効なコンテンツは許可', () => {
    const result = updateTermsVersionSchema.safeParse({
      content: '更新されたコンテンツ',
    })
    expect(result.success).toBe(true)
  })

  test('空文字はエラー', () => {
    const result = updateTermsVersionSchema.safeParse({
      content: '',
    })
    expect(result.success).toBe(false)
  })
})

describe('recordTermsAgreementSchema', () => {
  const VALID_AGREEMENT = {
    termsId: '123e4567-e89b-12d3-a456-426614174000',
    versionId: '123e4567-e89b-12d3-a456-426614174001',
  }

  describe('正常系', () => {
    test('最小限のデータは検証を通過', () => {
      const result = recordTermsAgreementSchema.safeParse(VALID_AGREEMENT)
      expect(result.success).toBe(true)
    })

    test('全フィールド指定も許可', () => {
      const result = recordTermsAgreementSchema.safeParse({
        ...VALID_AGREEMENT,
        reservationId: '123e4567-e89b-12d3-a456-426614174002',
        userId: '123e4567-e89b-12d3-a456-426614174003',
        guestName: 'ゲスト',
        guestEmail: 'guest@example.com',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      })
      expect(result.success).toBe(true)
    })
  })

  describe('termsId', () => {
    test('無効なUUIDはエラー', () => {
      const result = recordTermsAgreementSchema.safeParse({
        ...VALID_AGREEMENT,
        termsId: 'invalid',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('規約IDが無効')
      }
    })
  })

  describe('versionId', () => {
    test('無効なUUIDはエラー', () => {
      const result = recordTermsAgreementSchema.safeParse({
        ...VALID_AGREEMENT,
        versionId: 'invalid',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('バージョンIDが無効')
      }
    })
  })

  describe('reservationId', () => {
    test('undefinedは許可', () => {
      const result = recordTermsAgreementSchema.safeParse(VALID_AGREEMENT)
      expect(result.success).toBe(true)
    })

    test('無効なUUIDはエラー', () => {
      const result = recordTermsAgreementSchema.safeParse({
        ...VALID_AGREEMENT,
        reservationId: 'invalid',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('userId', () => {
    test('undefinedは許可', () => {
      const result = recordTermsAgreementSchema.safeParse(VALID_AGREEMENT)
      expect(result.success).toBe(true)
    })

    test('無効なUUIDはエラー', () => {
      const result = recordTermsAgreementSchema.safeParse({
        ...VALID_AGREEMENT,
        userId: 'invalid',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('guestEmail', () => {
    test('undefinedは許可', () => {
      const result = recordTermsAgreementSchema.safeParse(VALID_AGREEMENT)
      expect(result.success).toBe(true)
    })

    test('無効なメールアドレスはエラー', () => {
      const result = recordTermsAgreementSchema.safeParse({
        ...VALID_AGREEMENT,
        guestEmail: 'invalid-email',
      })
      expect(result.success).toBe(false)
    })
  })
})

describe('getTermsForSpaceSchema', () => {
  test('有効なUUIDは許可', () => {
    const result = getTermsForSpaceSchema.safeParse({
      spaceId: '123e4567-e89b-12d3-a456-426614174000',
    })
    expect(result.success).toBe(true)
  })

  test('無効なUUIDはエラー', () => {
    const result = getTermsForSpaceSchema.safeParse({
      spaceId: 'invalid',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('スペースIDが無効')
    }
  })
})

describe('agreeToTermsSchema', () => {
  test('有効なUUID配列は許可', () => {
    const result = agreeToTermsSchema.safeParse({
      versionIds: [
        '123e4567-e89b-12d3-a456-426614174000',
        '123e4567-e89b-12d3-a456-426614174001',
      ],
    })
    expect(result.success).toBe(true)
  })

  test('空配列はエラー', () => {
    const result = agreeToTermsSchema.safeParse({
      versionIds: [],
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('規約に同意')
    }
  })

  test('無効なUUIDを含むとエラー', () => {
    const result = agreeToTermsSchema.safeParse({
      versionIds: ['123e4567-e89b-12d3-a456-426614174000', 'invalid'],
    })
    expect(result.success).toBe(false)
  })
})

describe('TERMS_TYPES', () => {
  test('規約タイプが正しく定義されている', () => {
    expect(TERMS_TYPES).toEqual([
      { value: 'TERMS_OF_USE', label: '利用規約' },
      { value: 'PRIVACY_POLICY', label: 'プライバシーポリシー' },
      { value: 'CANCELLATION', label: 'キャンセルポリシー' },
      { value: 'PAYMENT', label: '支払い規約' },
      { value: 'CUSTOM', label: 'カスタム規約' },
    ])
  })
})
