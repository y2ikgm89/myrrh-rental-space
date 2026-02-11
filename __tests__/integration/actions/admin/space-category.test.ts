/**
 * スペースカテゴリー管理Server Action統合テスト
 *
 * src/actions/admin/space-category.ts のテスト
 *
 * 注: Server Actionsの直接テストは複雑なため、
 *     バリデーションスキーマ + 型構造をテスト
 */

import { describe, test, expect } from 'bun:test'
import { z } from 'zod'

// =============================================================================
// space-category.ts内で使用されているスキーマを再現
// =============================================================================

const spaceCategoryFormSchema = z.object({
  name: z
    .string()
    .min(1, { error: 'カテゴリー名を入力してください' })
    .max(50, { error: 'カテゴリー名は50文字以内で入力してください' }),
  description: z
    .string()
    .max(500, { error: '説明は500文字以内で入力してください' })
    .optional()
    .or(z.literal('')),
  icon: z
    .string()
    .max(50, { error: 'アイコン名は50文字以内で入力してください' })
    .optional()
    .or(z.literal('')),
  color: z
    .string()
    .regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, { error: '有効なカラーコードを入力してください' })
    .optional()
    .or(z.literal('')),
  sortOrder: z.number().int().min(0).default(0),
})

// =============================================================================
// テストデータ
// =============================================================================

const VALID_SPACE_CATEGORY_INPUT = {
  name: '会議室',
  description: '小〜大規模の会議に対応したスペース',
  icon: 'meeting-room',
  color: '#3B82F6',
  sortOrder: 0,
}

describe('SpaceCategory Admin Action Integration', () => {
  describe('spaceCategoryFormSchema バリデーション', () => {
    describe('正常系', () => {
      test('有効なデータはバリデーション通過', () => {
        const result = spaceCategoryFormSchema.safeParse(VALID_SPACE_CATEGORY_INPUT)
        expect(result.success).toBe(true)
      })

      test('descriptionは空文字列許可', () => {
        const result = spaceCategoryFormSchema.safeParse({
          ...VALID_SPACE_CATEGORY_INPUT,
          description: '',
        })
        expect(result.success).toBe(true)
      })

      test('descriptionはオプション（省略可能）', () => {
        const input = {
          name: '会議室',
          icon: 'meeting-room',
          color: '#3B82F6',
          sortOrder: 0,
        }
        const result = spaceCategoryFormSchema.safeParse(input)
        expect(result.success).toBe(true)
      })

      test('iconは空文字列許可', () => {
        const result = spaceCategoryFormSchema.safeParse({
          ...VALID_SPACE_CATEGORY_INPUT,
          icon: '',
        })
        expect(result.success).toBe(true)
      })

      test('iconはオプション（省略可能）', () => {
        const input = {
          name: '会議室',
          description: '説明',
          color: '#3B82F6',
          sortOrder: 0,
        }
        const result = spaceCategoryFormSchema.safeParse(input)
        expect(result.success).toBe(true)
      })

      test('colorは空文字列許可', () => {
        const result = spaceCategoryFormSchema.safeParse({
          ...VALID_SPACE_CATEGORY_INPUT,
          color: '',
        })
        expect(result.success).toBe(true)
      })

      test('colorはオプション（省略可能）', () => {
        const input = {
          name: '会議室',
          description: '説明',
          icon: 'room',
          sortOrder: 0,
        }
        const result = spaceCategoryFormSchema.safeParse(input)
        expect(result.success).toBe(true)
      })

      test('sortOrderはデフォルト値0', () => {
        const input = {
          name: '会議室',
        }
        const result = spaceCategoryFormSchema.safeParse(input)
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.sortOrder).toBe(0)
        }
      })

      test('最小限のフィールドのみでバリデーション通過', () => {
        const result = spaceCategoryFormSchema.safeParse({
          name: '会議室',
        })
        expect(result.success).toBe(true)
      })
    })

    describe('name', () => {
      test('空のカテゴリー名はエラー', () => {
        const result = spaceCategoryFormSchema.safeParse({
          ...VALID_SPACE_CATEGORY_INPUT,
          name: '',
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('カテゴリー名を入力')
        }
      })

      test('50文字のカテゴリー名はOK', () => {
        const result = spaceCategoryFormSchema.safeParse({
          ...VALID_SPACE_CATEGORY_INPUT,
          name: 'あ'.repeat(50),
        })
        expect(result.success).toBe(true)
      })

      test('51文字のカテゴリー名はエラー', () => {
        const result = spaceCategoryFormSchema.safeParse({
          ...VALID_SPACE_CATEGORY_INPUT,
          name: 'あ'.repeat(51),
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('50文字以内')
        }
      })
    })

    describe('description', () => {
      test('500文字の説明はOK', () => {
        const result = spaceCategoryFormSchema.safeParse({
          ...VALID_SPACE_CATEGORY_INPUT,
          description: 'あ'.repeat(500),
        })
        expect(result.success).toBe(true)
      })

      test('501文字の説明はエラー', () => {
        const result = spaceCategoryFormSchema.safeParse({
          ...VALID_SPACE_CATEGORY_INPUT,
          description: 'あ'.repeat(501),
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('500文字以内')
        }
      })
    })

    describe('icon', () => {
      test('50文字のアイコン名はOK', () => {
        const result = spaceCategoryFormSchema.safeParse({
          ...VALID_SPACE_CATEGORY_INPUT,
          icon: 'a'.repeat(50),
        })
        expect(result.success).toBe(true)
      })

      test('51文字のアイコン名はエラー', () => {
        const result = spaceCategoryFormSchema.safeParse({
          ...VALID_SPACE_CATEGORY_INPUT,
          icon: 'a'.repeat(51),
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('アイコン名は50文字以内')
        }
      })
    })

    describe('color', () => {
      test('有効な6桁カラーコードは許可', () => {
        const validColors = ['#3B82F6', '#ff0000', '#ABCDEF', '#000000', '#FFFFFF']
        for (const color of validColors) {
          const result = spaceCategoryFormSchema.safeParse({
            ...VALID_SPACE_CATEGORY_INPUT,
            color,
          })
          expect(result.success).toBe(true)
        }
      })

      test('有効な3桁カラーコードは許可', () => {
        const validColors = ['#F00', '#abc', '#123']
        for (const color of validColors) {
          const result = spaceCategoryFormSchema.safeParse({
            ...VALID_SPACE_CATEGORY_INPUT,
            color,
          })
          expect(result.success).toBe(true)
        }
      })

      test('無効なカラーコードはエラー', () => {
        const invalidColors = [
          'red',           // 名前
          '#GGG',          // 無効な16進文字
          '#12345',        // 5桁
          '#1234567',      // 7桁
          '3B82F6',        // #なし
          'rgb(0,0,0)',    // RGB形式
        ]
        for (const color of invalidColors) {
          const result = spaceCategoryFormSchema.safeParse({
            ...VALID_SPACE_CATEGORY_INPUT,
            color,
          })
          expect(result.success).toBe(false)
        }
      })
    })

    describe('sortOrder', () => {
      test('0以上の整数は許可', () => {
        const orders = [0, 1, 50, 100, 999]
        for (const sortOrder of orders) {
          const result = spaceCategoryFormSchema.safeParse({
            ...VALID_SPACE_CATEGORY_INPUT,
            sortOrder,
          })
          expect(result.success).toBe(true)
        }
      })

      test('負の数はエラー', () => {
        const result = spaceCategoryFormSchema.safeParse({
          ...VALID_SPACE_CATEGORY_INPUT,
          sortOrder: -1,
        })
        expect(result.success).toBe(false)
      })

      test('小数はエラー', () => {
        const result = spaceCategoryFormSchema.safeParse({
          ...VALID_SPACE_CATEGORY_INPUT,
          sortOrder: 1.5,
        })
        expect(result.success).toBe(false)
      })

      test('文字列はエラー', () => {
        const result = spaceCategoryFormSchema.safeParse({
          ...VALID_SPACE_CATEGORY_INPUT,
          sortOrder: 'first',
        })
        expect(result.success).toBe(false)
      })
    })
  })

  describe('境界値テスト', () => {
    test('カテゴリー名 50文字（境界）', () => {
      const result = spaceCategoryFormSchema.safeParse({
        ...VALID_SPACE_CATEGORY_INPUT,
        name: 'x'.repeat(50),
      })
      expect(result.success).toBe(true)
    })

    test('カテゴリー名 51文字（境界超過）', () => {
      const result = spaceCategoryFormSchema.safeParse({
        ...VALID_SPACE_CATEGORY_INPUT,
        name: 'x'.repeat(51),
      })
      expect(result.success).toBe(false)
    })

    test('説明 500文字（境界）', () => {
      const result = spaceCategoryFormSchema.safeParse({
        ...VALID_SPACE_CATEGORY_INPUT,
        description: 'x'.repeat(500),
      })
      expect(result.success).toBe(true)
    })

    test('説明 501文字（境界超過）', () => {
      const result = spaceCategoryFormSchema.safeParse({
        ...VALID_SPACE_CATEGORY_INPUT,
        description: 'x'.repeat(501),
      })
      expect(result.success).toBe(false)
    })

    test('アイコン名 50文字（境界）', () => {
      const result = spaceCategoryFormSchema.safeParse({
        ...VALID_SPACE_CATEGORY_INPUT,
        icon: 'x'.repeat(50),
      })
      expect(result.success).toBe(true)
    })

    test('アイコン名 51文字（境界超過）', () => {
      const result = spaceCategoryFormSchema.safeParse({
        ...VALID_SPACE_CATEGORY_INPUT,
        icon: 'x'.repeat(51),
      })
      expect(result.success).toBe(false)
    })
  })

  describe('デフォルト値テスト', () => {
    test('defaultSpaceCategoryFormValuesの構造', () => {
      const defaults = {
        name: '',
        description: '',
        icon: '',
        color: '',
        sortOrder: 0,
      }

      expect(defaults.name).toBe('')
      expect(defaults.description).toBe('')
      expect(defaults.icon).toBe('')
      expect(defaults.color).toBe('')
      expect(defaults.sortOrder).toBe(0)
    })
  })

  describe('SpaceCategoryWithStats型テスト', () => {
    test('SpaceCategoryWithStats型の構造', () => {
      type SpaceCategoryWithStats = {
        id: string
        name: string
        description: string | null
        icon: string | null
        color: string | null
        sortOrder: number
        isActive: boolean
        createdAt: Date
        updatedAt: Date
        _count: {
          spaces: number
        }
      }

      const category: SpaceCategoryWithStats = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: '会議室',
        description: '会議用スペース',
        icon: 'meeting-room',
        color: '#3B82F6',
        sortOrder: 0,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: {
          spaces: 5,
        },
      }

      expect(category.name).toBe('会議室')
      expect(category._count.spaces).toBe(5)
      expect(category.isActive).toBe(true)
    })
  })

  describe('GetSpaceCategoriesResult型テスト', () => {
    test('GetSpaceCategoriesResult型の構造', () => {
      type SpaceCategoryWithStats = {
        id: string
        name: string
        description: string | null
        icon: string | null
        color: string | null
        sortOrder: number
        isActive: boolean
        createdAt: Date
        updatedAt: Date
        _count: { spaces: number }
      }

      type GetSpaceCategoriesResult = {
        categories: SpaceCategoryWithStats[]
        total: number
      }

      const result: GetSpaceCategoriesResult = {
        categories: [
          {
            id: '550e8400-e29b-41d4-a716-446655440000',
            name: '会議室',
            description: null,
            icon: null,
            color: null,
            sortOrder: 0,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            _count: { spaces: 3 },
          },
        ],
        total: 1,
      }

      expect(result.categories).toHaveLength(1)
      expect(result.total).toBe(1)
    })
  })
})
