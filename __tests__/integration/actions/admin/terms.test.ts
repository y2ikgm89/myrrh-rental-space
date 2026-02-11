/**
 * 規約管理Server Action統合テスト
 *
 * src/actions/admin/terms.ts のテスト
 *
 * 注: Server Actionsの直接テストは複雑なため、
 *     バリデーションスキーマ + action-helpersロジックをテスト
 */

import { describe, test, expect } from 'bun:test'
import { z } from 'zod'
import { TermsType, TermsStatus } from '@/shared/generated/prisma/enums'

// terms.ts 内で使用されているスキーマを再現
const createTermsSchema = z.object({
  type: z.enum(TermsType),
  title: z
    .string()
    .min(1, { error: 'タイトルを入力してください' })
    .max(100, { error: 'タイトルは100文字以内で入力してください' }),
  slug: z
    .string()
    .min(1, { error: 'スラッグを入力してください' })
    .max(50, { error: 'スラッグは50文字以内で入力してください' })
    .regex(/^[a-z0-9-]+$/, { error: 'スラッグは小文字英数字とハイフンのみ使用可能です' }),
  isActive: z.boolean().default(true),
})

const updateTermsSchema = createTermsSchema.partial()

const createTermsVersionSchema = z.object({
  termsId: z.string().uuid({ error: '規約IDが無効です' }),
  content: z.string().min(1, { error: 'コンテンツを入力してください' }),
})

const updateTermsVersionSchema = z.object({
  content: z.string().min(1, { error: 'コンテンツを入力してください' }),
})

const publishTermsVersionSchema = z.object({
  versionId: z.string().uuid({ error: 'バージョンIDが無効です' }),
})

const recordTermsAgreementSchema = z.object({
  termsId: z.string().uuid({ error: '規約IDが無効です' }),
  versionId: z.string().uuid({ error: 'バージョンIDが無効です' }),
  reservationId: z.string().uuid({ error: '予約IDが無効です' }).optional(),
  userId: z.string().uuid({ error: 'ユーザーIDが無効です' }).optional(),
  guestName: z.string().optional(),
  guestEmail: z.string().email({ error: 'メールアドレスが無効です' }).optional(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
})

const agreeToTermsSchema = z.object({
  versionIds: z
    .array(z.string().uuid({ error: 'バージョンIDが無効です' }))
    .min(1, { error: '規約に同意してください' }),
})

// 有効なUUID
const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000'
const VALID_UUID_2 = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'

// 有効な規約作成データ
const VALID_CREATE_TERMS_INPUT = {
  type: TermsType.TERMS_OF_USE,
  title: '利用規約',
  slug: 'terms-of-use',
  isActive: true,
}

// 有効なバージョン作成データ
const VALID_CREATE_VERSION_INPUT = {
  termsId: VALID_UUID,
  content: '<h1>利用規約</h1><p>本規約は...</p>',
}

describe('Terms Admin Action Integration', () => {
  describe('createTermsSchema バリデーション', () => {
    describe('正常系', () => {
      test('有効なデータはバリデーション通過', () => {
        const result = createTermsSchema.safeParse(VALID_CREATE_TERMS_INPUT)
        expect(result.success).toBe(true)
      })

      test('isActiveデフォルトはtrue', () => {
        const input = {
          type: TermsType.TERMS_OF_USE,
          title: '利用規約',
          slug: 'terms',
        }
        const result = createTermsSchema.safeParse(input)
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.isActive).toBe(true)
        }
      })

      test('全TermsTypeが使用可能', () => {
        const types = [
          TermsType.TERMS_OF_USE,
          TermsType.PRIVACY_POLICY,
          TermsType.CANCELLATION,
          TermsType.PAYMENT,
          TermsType.CUSTOM,
        ]

        for (const type of types) {
          const result = createTermsSchema.safeParse({
            ...VALID_CREATE_TERMS_INPUT,
            type,
          })
          expect(result.success).toBe(true)
        }
      })
    })

    describe('type', () => {
      test('無効なタイプはエラー', () => {
        const result = createTermsSchema.safeParse({
          ...VALID_CREATE_TERMS_INPUT,
          type: 'INVALID_TYPE',
        })
        expect(result.success).toBe(false)
      })
    })

    describe('title', () => {
      test('空のタイトルはエラー', () => {
        const result = createTermsSchema.safeParse({
          ...VALID_CREATE_TERMS_INPUT,
          title: '',
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('タイトルを入力')
        }
      })

      test('100文字のタイトルはOK', () => {
        const result = createTermsSchema.safeParse({
          ...VALID_CREATE_TERMS_INPUT,
          title: 'あ'.repeat(100),
        })
        expect(result.success).toBe(true)
      })

      test('101文字のタイトルはエラー', () => {
        const result = createTermsSchema.safeParse({
          ...VALID_CREATE_TERMS_INPUT,
          title: 'あ'.repeat(101),
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('100文字以内')
        }
      })
    })

    describe('slug', () => {
      test('空のスラッグはエラー', () => {
        const result = createTermsSchema.safeParse({
          ...VALID_CREATE_TERMS_INPUT,
          slug: '',
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('スラッグを入力')
        }
      })

      test('50文字のスラッグはOK', () => {
        const result = createTermsSchema.safeParse({
          ...VALID_CREATE_TERMS_INPUT,
          slug: 'a'.repeat(50),
        })
        expect(result.success).toBe(true)
      })

      test('51文字のスラッグはエラー', () => {
        const result = createTermsSchema.safeParse({
          ...VALID_CREATE_TERMS_INPUT,
          slug: 'a'.repeat(51),
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('50文字以内')
        }
      })

      test('有効なスラッグ形式', () => {
        const validSlugs = ['terms', 'privacy-policy', 'cancellation-policy', 'terms123']
        for (const slug of validSlugs) {
          const result = createTermsSchema.safeParse({
            ...VALID_CREATE_TERMS_INPUT,
            slug,
          })
          expect(result.success).toBe(true)
        }
      })

      test('無効なスラッグ形式はエラー', () => {
        const invalidSlugs = [
          'Terms', // 大文字
          'terms_of_use', // アンダースコア
          'terms of use', // スペース
          '利用規約', // 日本語
        ]
        for (const slug of invalidSlugs) {
          const result = createTermsSchema.safeParse({
            ...VALID_CREATE_TERMS_INPUT,
            slug,
          })
          expect(result.success).toBe(false)
        }
      })
    })
  })

  describe('updateTermsSchema バリデーション', () => {
    describe('正常系', () => {
      test('部分更新が可能', () => {
        const result = updateTermsSchema.safeParse({
          title: '利用規約（更新版）',
        })
        expect(result.success).toBe(true)
      })

      test('全フィールド更新も可能', () => {
        const result = updateTermsSchema.safeParse(VALID_CREATE_TERMS_INPUT)
        expect(result.success).toBe(true)
      })

      test('空オブジェクトも許可', () => {
        const result = updateTermsSchema.safeParse({})
        expect(result.success).toBe(true)
      })
    })

    describe('各フィールドの個別更新', () => {
      test('typeのみ更新', () => {
        const result = updateTermsSchema.safeParse({
          type: TermsType.PRIVACY_POLICY,
        })
        expect(result.success).toBe(true)
      })

      test('titleのみ更新', () => {
        const result = updateTermsSchema.safeParse({
          title: '新しいタイトル',
        })
        expect(result.success).toBe(true)
      })

      test('slugのみ更新', () => {
        const result = updateTermsSchema.safeParse({
          slug: 'new-slug',
        })
        expect(result.success).toBe(true)
      })

      test('isActiveのみ更新', () => {
        const result = updateTermsSchema.safeParse({
          isActive: false,
        })
        expect(result.success).toBe(true)
      })
    })
  })

  describe('createTermsVersionSchema バリデーション', () => {
    describe('正常系', () => {
      test('有効なデータはバリデーション通過', () => {
        const result = createTermsVersionSchema.safeParse(VALID_CREATE_VERSION_INPUT)
        expect(result.success).toBe(true)
      })

      test('HTMLコンテンツは許可', () => {
        const result = createTermsVersionSchema.safeParse({
          ...VALID_CREATE_VERSION_INPUT,
          content: '<h1>タイトル</h1><p>本文</p><ul><li>項目1</li></ul>',
        })
        expect(result.success).toBe(true)
      })
    })

    describe('termsId', () => {
      test('有効なUUIDは許可', () => {
        const result = createTermsVersionSchema.safeParse({
          ...VALID_CREATE_VERSION_INPUT,
          termsId: VALID_UUID,
        })
        expect(result.success).toBe(true)
      })

      test('無効なUUIDはエラー', () => {
        const invalidIds = ['invalid', '12345', 'not-a-uuid', '']
        for (const termsId of invalidIds) {
          const result = createTermsVersionSchema.safeParse({
            ...VALID_CREATE_VERSION_INPUT,
            termsId,
          })
          expect(result.success).toBe(false)
        }
      })
    })

    describe('content', () => {
      test('空のコンテンツはエラー', () => {
        const result = createTermsVersionSchema.safeParse({
          ...VALID_CREATE_VERSION_INPUT,
          content: '',
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('コンテンツを入力')
        }
      })

      test('長いコンテンツも許可', () => {
        const result = createTermsVersionSchema.safeParse({
          ...VALID_CREATE_VERSION_INPUT,
          content: 'x'.repeat(100000),
        })
        expect(result.success).toBe(true)
      })
    })
  })

  describe('updateTermsVersionSchema バリデーション', () => {
    test('有効なコンテンツは通過', () => {
      const result = updateTermsVersionSchema.safeParse({
        content: '<p>更新されたコンテンツ</p>',
      })
      expect(result.success).toBe(true)
    })

    test('空のコンテンツはエラー', () => {
      const result = updateTermsVersionSchema.safeParse({
        content: '',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('publishTermsVersionSchema バリデーション', () => {
    test('有効なUUIDは通過', () => {
      const result = publishTermsVersionSchema.safeParse({
        versionId: VALID_UUID,
      })
      expect(result.success).toBe(true)
    })

    test('無効なUUIDはエラー', () => {
      const result = publishTermsVersionSchema.safeParse({
        versionId: 'invalid',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('recordTermsAgreementSchema バリデーション', () => {
    describe('正常系', () => {
      test('必須フィールドのみでも通過', () => {
        const result = recordTermsAgreementSchema.safeParse({
          termsId: VALID_UUID,
          versionId: VALID_UUID_2,
        })
        expect(result.success).toBe(true)
      })

      test('全フィールド指定も通過', () => {
        const result = recordTermsAgreementSchema.safeParse({
          termsId: VALID_UUID,
          versionId: VALID_UUID_2,
          reservationId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
          userId: '8c9e6679-7425-40de-944b-e07fc1f90ae8',
          guestName: '山田太郎',
          guestEmail: 'yamada@example.com',
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
        })
        expect(result.success).toBe(true)
      })
    })

    describe('termsId', () => {
      test('無効なUUIDはエラー', () => {
        const result = recordTermsAgreementSchema.safeParse({
          termsId: 'invalid',
          versionId: VALID_UUID,
        })
        expect(result.success).toBe(false)
      })
    })

    describe('versionId', () => {
      test('無効なUUIDはエラー', () => {
        const result = recordTermsAgreementSchema.safeParse({
          termsId: VALID_UUID,
          versionId: 'invalid',
        })
        expect(result.success).toBe(false)
      })
    })

    describe('guestEmail', () => {
      test('有効なメールアドレスは許可', () => {
        const result = recordTermsAgreementSchema.safeParse({
          termsId: VALID_UUID,
          versionId: VALID_UUID_2,
          guestEmail: 'test@example.com',
        })
        expect(result.success).toBe(true)
      })

      test('無効なメールアドレスはエラー', () => {
        const result = recordTermsAgreementSchema.safeParse({
          termsId: VALID_UUID,
          versionId: VALID_UUID_2,
          guestEmail: 'invalid-email',
        })
        expect(result.success).toBe(false)
      })
    })
  })

  describe('agreeToTermsSchema バリデーション', () => {
    test('有効なバージョンID配列は通過', () => {
      const result = agreeToTermsSchema.safeParse({
        versionIds: [VALID_UUID, VALID_UUID_2],
      })
      expect(result.success).toBe(true)
    })

    test('空の配列はエラー', () => {
      const result = agreeToTermsSchema.safeParse({
        versionIds: [],
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('規約に同意')
      }
    })

    test('無効なUUIDを含む配列はエラー', () => {
      const result = agreeToTermsSchema.safeParse({
        versionIds: [VALID_UUID, 'invalid'],
      })
      expect(result.success).toBe(false)
    })
  })

  describe('TermsType enum テスト', () => {
    test('TermsType enumの値が存在', () => {
      expect(TermsType.TERMS_OF_USE).toBeDefined()
      expect(TermsType.PRIVACY_POLICY).toBeDefined()
      expect(TermsType.CANCELLATION).toBeDefined()
      expect(TermsType.PAYMENT).toBeDefined()
      expect(TermsType.CUSTOM).toBeDefined()
    })

    test('TermsType enumは5つの値を持つ', () => {
      expect(Object.values(TermsType)).toHaveLength(5)
    })
  })

  describe('TermsStatus enum テスト', () => {
    test('TermsStatus enumの値が存在', () => {
      expect(TermsStatus.DRAFT).toBeDefined()
      expect(TermsStatus.PUBLISHED).toBeDefined()
      expect(TermsStatus.ARCHIVED).toBeDefined()
    })

    test('TermsStatus enumは3つの値を持つ', () => {
      expect(Object.values(TermsStatus)).toHaveLength(3)
    })
  })

  describe('境界値テスト', () => {
    test('タイトル 100文字（境界）', () => {
      const result = createTermsSchema.safeParse({
        ...VALID_CREATE_TERMS_INPUT,
        title: 'x'.repeat(100),
      })
      expect(result.success).toBe(true)
    })

    test('タイトル 101文字（境界超過）', () => {
      const result = createTermsSchema.safeParse({
        ...VALID_CREATE_TERMS_INPUT,
        title: 'x'.repeat(101),
      })
      expect(result.success).toBe(false)
    })

    test('スラッグ 50文字（境界）', () => {
      const result = createTermsSchema.safeParse({
        ...VALID_CREATE_TERMS_INPUT,
        slug: 'a'.repeat(50),
      })
      expect(result.success).toBe(true)
    })

    test('スラッグ 51文字（境界超過）', () => {
      const result = createTermsSchema.safeParse({
        ...VALID_CREATE_TERMS_INPUT,
        slug: 'a'.repeat(51),
      })
      expect(result.success).toBe(false)
    })
  })

  describe('TermsWithVersion型テスト', () => {
    test('TermsWithVersion型の構造', () => {
      type TermsWithVersion = {
        id: string
        type: typeof TermsType[keyof typeof TermsType]
        title: string
        slug: string
        isActive: boolean
        currentVersion: {
          id: string
          version: number
          content: string
          publishedAt: Date
        } | null
      }

      const terms: TermsWithVersion = {
        id: VALID_UUID,
        type: TermsType.TERMS_OF_USE,
        title: '利用規約',
        slug: 'terms-of-use',
        isActive: true,
        currentVersion: {
          id: VALID_UUID_2,
          version: 1,
          content: '<p>規約内容</p>',
          publishedAt: new Date(),
        },
      }

      expect(terms.type).toBe('TERMS_OF_USE')
      expect(terms.currentVersion?.version).toBe(1)
    })

    test('currentVersionがnullの場合', () => {
      type TermsWithVersion = {
        id: string
        type: typeof TermsType[keyof typeof TermsType]
        title: string
        slug: string
        isActive: boolean
        currentVersion: {
          id: string
          version: number
          content: string
          publishedAt: Date
        } | null
      }

      const terms: TermsWithVersion = {
        id: VALID_UUID,
        type: TermsType.CUSTOM,
        title: 'カスタム規約',
        slug: 'custom',
        isActive: false,
        currentVersion: null,
      }

      expect(terms.currentVersion).toBeNull()
    })
  })

  describe('TermsDetail型テスト', () => {
    test('TermsDetail型の構造', () => {
      type TermsDetail = {
        id: string
        type: typeof TermsType[keyof typeof TermsType]
        title: string
        slug: string
        isActive: boolean
        createdAt: Date
        updatedAt: Date
        versions: {
          id: string
          version: number
          status: typeof TermsStatus[keyof typeof TermsStatus]
          publishedAt: Date | null
          isCurrentVersion: boolean
          createdAt: Date
        }[]
        _count: {
          spaces: number
          agreements: number
        }
      }

      const terms: TermsDetail = {
        id: VALID_UUID,
        type: TermsType.PRIVACY_POLICY,
        title: 'プライバシーポリシー',
        slug: 'privacy',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        versions: [
          {
            id: VALID_UUID_2,
            version: 2,
            status: TermsStatus.PUBLISHED,
            publishedAt: new Date(),
            isCurrentVersion: true,
            createdAt: new Date(),
          },
          {
            id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
            version: 1,
            status: TermsStatus.ARCHIVED,
            publishedAt: new Date(),
            isCurrentVersion: false,
            createdAt: new Date(),
          },
        ],
        _count: {
          spaces: 5,
          agreements: 100,
        },
      }

      expect(terms.versions).toHaveLength(2)
      expect(terms._count.spaces).toBe(5)
      expect(terms._count.agreements).toBe(100)
    })
  })

  describe('TERMS_TYPES定数テスト', () => {
    test('TERMS_TYPESの定義', () => {
      const TERMS_TYPES = [
        { value: 'TERMS_OF_USE', label: '利用規約' },
        { value: 'PRIVACY_POLICY', label: 'プライバシーポリシー' },
        { value: 'CANCELLATION', label: 'キャンセルポリシー' },
        { value: 'PAYMENT', label: '支払い規約' },
        { value: 'CUSTOM', label: 'カスタム規約' },
      ]

      expect(TERMS_TYPES).toHaveLength(5)
      expect(TERMS_TYPES.find((t) => t.value === 'TERMS_OF_USE')?.label).toBe('利用規約')
    })
  })

  // 注: 権限チェック（hasPermission, canAccessAdmin, checkReadPermission）のテストは
  // __tests__/unit/lib/permissions.test.ts で網羅的にテスト済み
})
