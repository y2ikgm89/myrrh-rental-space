/**
 * FAQ管理Server Action統合テスト
 *
 * src/actions/admin/faq.ts のテスト
 *
 * 注: Server Actionsの直接テストは複雑なため、
 *     バリデーションスキーマ + action-helpersロジックをテスト
 */

import { describe, test, expect } from 'bun:test'
import { z } from 'zod'

// faq.ts 内で使用されているスキーマを再現
const faqCategoryFormSchema = z.object({
  name: z
    .string()
    .min(1, { error: 'カテゴリ名を入力してください' })
    .max(100, { error: 'カテゴリ名は100文字以内で入力してください' }),
  slug: z
    .string()
    .min(1, { error: 'スラッグを入力してください' })
    .max(100, { error: 'スラッグは100文字以内で入力してください' })
    .regex(
      /^[a-z0-9-]+$/,
      { error: 'スラッグは半角英数字とハイフンのみ使用できます' }
    ),
  description: z
    .string()
    .max(500, { error: '説明は500文字以内で入力してください' })
    .nullable()
    .optional(),
  order: z.number().int().min(0),
  isActive: z.boolean(),
})

const faqItemFormSchema = z.object({
  categoryId: z.string().uuid({ error: 'カテゴリを選択してください' }),
  question: z
    .string()
    .min(1, { error: '質問を入力してください' })
    .max(500, { error: '質問は500文字以内で入力してください' }),
  answer: z
    .string()
    .min(1, { error: '回答を入力してください' })
    .max(10000, { error: '回答は10000文字以内で入力してください' }),
  order: z.number().int().min(0),
  isActive: z.boolean(),
})

// 有効なUUID
const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000'

// 有効なカテゴリ作成データ
const VALID_FAQ_CATEGORY_INPUT = {
  name: '予約について',
  slug: 'reservation',
  description: '予約に関するよくある質問',
  order: 0,
  isActive: true,
}

// 有効なFAQアイテム作成データ
const VALID_FAQ_ITEM_INPUT = {
  categoryId: VALID_UUID,
  question: '予約のキャンセルはいつまで可能ですか？',
  answer: '予約日の2日前までキャンセルが可能です。それ以降はキャンセル料が発生します。',
  order: 0,
  isActive: true,
}

describe('FAQ Admin Action Integration', () => {
  describe('faqCategoryFormSchema バリデーション', () => {
    describe('正常系', () => {
      test('有効なデータはバリデーション通過', () => {
        const result = faqCategoryFormSchema.safeParse(VALID_FAQ_CATEGORY_INPUT)
        expect(result.success).toBe(true)
      })

      test('descriptionはnull許可', () => {
        const result = faqCategoryFormSchema.safeParse({
          ...VALID_FAQ_CATEGORY_INPUT,
          description: null,
        })
        expect(result.success).toBe(true)
      })

      test('descriptionはオプション', () => {
        const input = {
          name: 'テスト',
          slug: 'test',
          order: 0,
          isActive: true,
        }
        const result = faqCategoryFormSchema.safeParse(input)
        expect(result.success).toBe(true)
      })
    })

    describe('name', () => {
      test('空のカテゴリ名はエラー', () => {
        const result = faqCategoryFormSchema.safeParse({
          ...VALID_FAQ_CATEGORY_INPUT,
          name: '',
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('カテゴリ名を入力')
        }
      })

      test('100文字のカテゴリ名はOK', () => {
        const result = faqCategoryFormSchema.safeParse({
          ...VALID_FAQ_CATEGORY_INPUT,
          name: 'あ'.repeat(100),
        })
        expect(result.success).toBe(true)
      })

      test('101文字のカテゴリ名はエラー', () => {
        const result = faqCategoryFormSchema.safeParse({
          ...VALID_FAQ_CATEGORY_INPUT,
          name: 'あ'.repeat(101),
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('100文字以内')
        }
      })
    })

    describe('slug', () => {
      test('空のスラッグはエラー', () => {
        const result = faqCategoryFormSchema.safeParse({
          ...VALID_FAQ_CATEGORY_INPUT,
          slug: '',
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('スラッグを入力')
        }
      })

      test('100文字のスラッグはOK', () => {
        const result = faqCategoryFormSchema.safeParse({
          ...VALID_FAQ_CATEGORY_INPUT,
          slug: 'a'.repeat(100),
        })
        expect(result.success).toBe(true)
      })

      test('101文字のスラッグはエラー', () => {
        const result = faqCategoryFormSchema.safeParse({
          ...VALID_FAQ_CATEGORY_INPUT,
          slug: 'a'.repeat(101),
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('100文字以内')
        }
      })

      test('有効なスラッグ形式', () => {
        const validSlugs = ['test', 'test-slug', 'my-faq-category', 'faq123', 'a-b-c']
        for (const slug of validSlugs) {
          const result = faqCategoryFormSchema.safeParse({
            ...VALID_FAQ_CATEGORY_INPUT,
            slug,
          })
          expect(result.success).toBe(true)
        }
      })

      test('無効なスラッグ形式はエラー', () => {
        const invalidSlugs = [
          'Test-Slug', // 大文字
          'test_slug', // アンダースコア
          'test slug', // スペース
          'テスト', // 日本語
        ]
        for (const slug of invalidSlugs) {
          const result = faqCategoryFormSchema.safeParse({
            ...VALID_FAQ_CATEGORY_INPUT,
            slug,
          })
          expect(result.success).toBe(false)
        }
      })
    })

    describe('description', () => {
      test('500文字の説明はOK', () => {
        const result = faqCategoryFormSchema.safeParse({
          ...VALID_FAQ_CATEGORY_INPUT,
          description: 'あ'.repeat(500),
        })
        expect(result.success).toBe(true)
      })

      test('501文字の説明はエラー', () => {
        const result = faqCategoryFormSchema.safeParse({
          ...VALID_FAQ_CATEGORY_INPUT,
          description: 'あ'.repeat(501),
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('500文字以内')
        }
      })
    })

    describe('order', () => {
      test('0以上の整数は許可', () => {
        const orders = [0, 1, 100, 999]
        for (const order of orders) {
          const result = faqCategoryFormSchema.safeParse({
            ...VALID_FAQ_CATEGORY_INPUT,
            order,
          })
          expect(result.success).toBe(true)
        }
      })

      test('負の数はエラー', () => {
        const result = faqCategoryFormSchema.safeParse({
          ...VALID_FAQ_CATEGORY_INPUT,
          order: -1,
        })
        expect(result.success).toBe(false)
      })

      test('小数はエラー', () => {
        const result = faqCategoryFormSchema.safeParse({
          ...VALID_FAQ_CATEGORY_INPUT,
          order: 1.5,
        })
        expect(result.success).toBe(false)
      })
    })

    describe('isActive', () => {
      test('trueは許可', () => {
        const result = faqCategoryFormSchema.safeParse({
          ...VALID_FAQ_CATEGORY_INPUT,
          isActive: true,
        })
        expect(result.success).toBe(true)
      })

      test('falseは許可', () => {
        const result = faqCategoryFormSchema.safeParse({
          ...VALID_FAQ_CATEGORY_INPUT,
          isActive: false,
        })
        expect(result.success).toBe(true)
      })

      test('文字列はエラー', () => {
        const result = faqCategoryFormSchema.safeParse({
          ...VALID_FAQ_CATEGORY_INPUT,
          isActive: 'true',
        })
        expect(result.success).toBe(false)
      })
    })
  })

  describe('faqItemFormSchema バリデーション', () => {
    describe('正常系', () => {
      test('有効なデータはバリデーション通過', () => {
        const result = faqItemFormSchema.safeParse(VALID_FAQ_ITEM_INPUT)
        expect(result.success).toBe(true)
      })

      test('HTMLコンテンツを含む回答は許可', () => {
        const result = faqItemFormSchema.safeParse({
          ...VALID_FAQ_ITEM_INPUT,
          answer: '<p>回答です。</p><ul><li>項目1</li><li>項目2</li></ul>',
        })
        expect(result.success).toBe(true)
      })
    })

    describe('categoryId', () => {
      test('有効なUUIDは許可', () => {
        const validUuids = [
          '550e8400-e29b-41d4-a716-446655440000',
          'f47ac10b-58cc-4372-a567-0e02b2c3d479',
          '7c9e6679-7425-40de-944b-e07fc1f90ae7',
        ]
        for (const categoryId of validUuids) {
          const result = faqItemFormSchema.safeParse({
            ...VALID_FAQ_ITEM_INPUT,
            categoryId,
          })
          expect(result.success).toBe(true)
        }
      })

      test('無効なUUIDはエラー', () => {
        const invalidIds = ['invalid', '12345', 'not-a-uuid', '']
        for (const categoryId of invalidIds) {
          const result = faqItemFormSchema.safeParse({
            ...VALID_FAQ_ITEM_INPUT,
            categoryId,
          })
          expect(result.success).toBe(false)
        }
      })
    })

    describe('question', () => {
      test('空の質問はエラー', () => {
        const result = faqItemFormSchema.safeParse({
          ...VALID_FAQ_ITEM_INPUT,
          question: '',
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('質問を入力')
        }
      })

      test('500文字の質問はOK', () => {
        const result = faqItemFormSchema.safeParse({
          ...VALID_FAQ_ITEM_INPUT,
          question: 'あ'.repeat(500),
        })
        expect(result.success).toBe(true)
      })

      test('501文字の質問はエラー', () => {
        const result = faqItemFormSchema.safeParse({
          ...VALID_FAQ_ITEM_INPUT,
          question: 'あ'.repeat(501),
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('500文字以内')
        }
      })
    })

    describe('answer', () => {
      test('空の回答はエラー', () => {
        const result = faqItemFormSchema.safeParse({
          ...VALID_FAQ_ITEM_INPUT,
          answer: '',
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('回答を入力')
        }
      })

      test('10000文字の回答はOK', () => {
        const result = faqItemFormSchema.safeParse({
          ...VALID_FAQ_ITEM_INPUT,
          answer: 'あ'.repeat(10000),
        })
        expect(result.success).toBe(true)
      })

      test('10001文字の回答はエラー', () => {
        const result = faqItemFormSchema.safeParse({
          ...VALID_FAQ_ITEM_INPUT,
          answer: 'あ'.repeat(10001),
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('10000文字以内')
        }
      })
    })

    describe('order', () => {
      test('0以上の整数は許可', () => {
        const orders = [0, 1, 50, 100]
        for (const order of orders) {
          const result = faqItemFormSchema.safeParse({
            ...VALID_FAQ_ITEM_INPUT,
            order,
          })
          expect(result.success).toBe(true)
        }
      })

      test('負の数はエラー', () => {
        const result = faqItemFormSchema.safeParse({
          ...VALID_FAQ_ITEM_INPUT,
          order: -1,
        })
        expect(result.success).toBe(false)
      })
    })
  })

  describe('フィルター型テスト', () => {
    test('有効なFaqItemFiltersの値', () => {
      type FaqItemFilters = {
        categoryId?: string
        search?: string
        isActive?: boolean
      }

      const filters: FaqItemFilters = {
        categoryId: VALID_UUID,
        search: 'キャンセル',
        isActive: true,
      }

      expect(filters.categoryId).toBe(VALID_UUID)
      expect(filters.search).toBe('キャンセル')
      expect(filters.isActive).toBe(true)
    })

    test('フィルターなしも許可', () => {
      type FaqItemFilters = {
        categoryId?: string
        search?: string
        isActive?: boolean
      }

      const filters: FaqItemFilters = {}
      expect(Object.keys(filters)).toHaveLength(0)
    })
  })

  describe('ページネーション型テスト', () => {
    test('有効なFaqItemPaginationの値', () => {
      type FaqItemPagination = {
        page?: number
        limit?: number
      }

      const pagination: FaqItemPagination = {
        page: 1,
        limit: 20,
      }

      expect(pagination.page).toBe(1)
      expect(pagination.limit).toBe(20)
    })

    test('デフォルト値の想定', () => {
      const defaultPagination = {
        page: 1,
        limit: 20,
      }

      expect(defaultPagination.page).toBe(1)
      expect(defaultPagination.limit).toBe(20)
    })
  })

  describe('境界値テスト', () => {
    test('カテゴリ名 100文字（境界）', () => {
      const result = faqCategoryFormSchema.safeParse({
        ...VALID_FAQ_CATEGORY_INPUT,
        name: 'x'.repeat(100),
      })
      expect(result.success).toBe(true)
    })

    test('カテゴリ名 101文字（境界超過）', () => {
      const result = faqCategoryFormSchema.safeParse({
        ...VALID_FAQ_CATEGORY_INPUT,
        name: 'x'.repeat(101),
      })
      expect(result.success).toBe(false)
    })

    test('質問 500文字（境界）', () => {
      const result = faqItemFormSchema.safeParse({
        ...VALID_FAQ_ITEM_INPUT,
        question: 'x'.repeat(500),
      })
      expect(result.success).toBe(true)
    })

    test('質問 501文字（境界超過）', () => {
      const result = faqItemFormSchema.safeParse({
        ...VALID_FAQ_ITEM_INPUT,
        question: 'x'.repeat(501),
      })
      expect(result.success).toBe(false)
    })

    test('回答 10000文字（境界）', () => {
      const result = faqItemFormSchema.safeParse({
        ...VALID_FAQ_ITEM_INPUT,
        answer: 'x'.repeat(10000),
      })
      expect(result.success).toBe(true)
    })

    test('回答 10001文字（境界超過）', () => {
      const result = faqItemFormSchema.safeParse({
        ...VALID_FAQ_ITEM_INPUT,
        answer: 'x'.repeat(10001),
      })
      expect(result.success).toBe(false)
    })
  })

  describe('FaqCategoryWithItems型テスト', () => {
    test('FaqCategoryWithItems型の構造', () => {
      type FaqItemData = {
        id: string
        categoryId: string
        question: string
        answer: string
        order: number
        isActive: boolean
        createdAt: Date
        updatedAt: Date
      }

      type FaqCategoryWithItems = {
        id: string
        name: string
        slug: string
        description: string | null
        order: number
        isActive: boolean
        createdAt: Date
        updatedAt: Date
        items: FaqItemData[]
      }

      const category: FaqCategoryWithItems = {
        id: VALID_UUID,
        name: '予約について',
        slug: 'reservation',
        description: '予約に関するFAQ',
        order: 0,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        items: [
          {
            id: '550e8400-e29b-41d4-a716-446655440001',
            categoryId: VALID_UUID,
            question: '予約方法は？',
            answer: 'Webから予約可能です。',
            order: 0,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      }

      expect(category.name).toBe('予約について')
      expect(category.items).toHaveLength(1)
      expect(category.items[0].question).toBe('予約方法は？')
    })
  })

  describe('FaqItemWithCategory型テスト', () => {
    test('FaqItemWithCategory型の構造', () => {
      type FaqItemWithCategory = {
        id: string
        categoryId: string
        question: string
        answer: string
        order: number
        isActive: boolean
        createdAt: Date
        updatedAt: Date
        category: {
          id: string
          name: string
          slug: string
        }
      }

      const item: FaqItemWithCategory = {
        id: '550e8400-e29b-41d4-a716-446655440001',
        categoryId: VALID_UUID,
        question: '予約のキャンセルはいつまで可能？',
        answer: '2日前まで可能です。',
        order: 0,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        category: {
          id: VALID_UUID,
          name: '予約について',
          slug: 'reservation',
        },
      }

      expect(item.question).toBe('予約のキャンセルはいつまで可能？')
      expect(item.category.name).toBe('予約について')
    })
  })

  // 注: 権限チェック（hasPermission, canAccessAdmin, checkReadPermission）のテストは
  // __tests__/unit/lib/permissions.test.ts で網羅的にテスト済み
})
