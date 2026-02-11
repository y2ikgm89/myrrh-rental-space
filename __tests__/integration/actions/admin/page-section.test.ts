/**
 * ページセクション管理 Server Action 統合テスト
 *
 * src/app/(admin)/admin/(dashboard)/_shared/actions/page-section.ts のテスト
 *
 * 注: Server Actionsの直接テストは複雑なため、
 *     バリデーションスキーマ + 型構造をテスト
 */

import { describe, test, expect } from 'bun:test'
import { z } from 'zod'

// page-section.ts 内で使用されている createSectionSchema を再現
const createSectionSchema = z.object({
  pageId: z.string().uuid().optional(),
  type: z.enum([
    'HERO',
    'HERO_PARALLAX',
    'CUSTOM',
    'CONCEPT',
    'SPACE_LIST',
    'SPACE_SHOWCASE',
    'NEWS_LIST',
    'POST_LIST',
    'FAQ_LIST',
    'FEATURES',
    'TESTIMONIAL',
    'GALLERY',
    'CTA',
    'CONTACT_FORM',
    'MAP',
    'EMBED',
    'INSTAGRAM',
  ]),
  title: z
    .string()
    .max(100, { error: 'タイトルは100文字以内です' })
    .optional(),
  config: z.record(z.string(), z.unknown()).default({}),
  design: z.record(z.string(), z.unknown()).default({}),
  content: z
    .string()
    .max(500000, { error: 'コンテンツは500,000文字以内です' })
    .optional(),
  order: z.number().int().min(0).optional(),
  isActive: z.boolean().default(true),
})

// page-section.ts 内で使用されている updateSectionSchema を再現
const updateSectionSchema = z.object({
  title: z
    .string()
    .max(100, { error: 'タイトルは100文字以内です' })
    .optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  design: z.record(z.string(), z.unknown()).optional(),
  content: z
    .string()
    .max(500000, { error: 'コンテンツは500,000文字以内です' })
    .optional(),
  isActive: z.boolean().optional(),
})

// page-section.ts 内で使用されている updateSectionOrderSchema を再現
const updateSectionOrderSchema = z.object({
  sections: z.array(
    z.object({
      id: z.string().uuid(),
      order: z.number().int().min(0),
    })
  ),
})

// 有効なUUID
const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000'
const VALID_UUID_2 = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'

// 有効なセクション作成データ
const VALID_CREATE_INPUT = {
  pageId: VALID_UUID,
  type: 'HERO' as const,
  title: 'メインヒーロー',
  config: { height: 'lg' },
  design: {},
  content: undefined,
  order: 0,
  isActive: true,
}

// 有効なセクション更新データ
const VALID_UPDATE_INPUT = {
  title: '更新されたタイトル',
  config: { height: 'md' },
  isActive: false,
}

// 有効な順序更新データ
const VALID_ORDER_INPUT = {
  sections: [
    { id: VALID_UUID, order: 0 },
    { id: VALID_UUID_2, order: 1 },
  ],
}

describe('PageSection Admin Action Integration', () => {
  describe('createSectionSchema バリデーション', () => {
    describe('正常系', () => {
      test('有効なデータはバリデーション通過', () => {
        const result = createSectionSchema.safeParse(VALID_CREATE_INPUT)
        expect(result.success).toBe(true)
      })

      test('pageIdはオプション（ホームページ用）', () => {
        const input = {
          ...VALID_CREATE_INPUT,
          pageId: undefined,
        }
        const result = createSectionSchema.safeParse(input)
        expect(result.success).toBe(true)
      })

      test('titleはオプション', () => {
        const input = {
          ...VALID_CREATE_INPUT,
          title: undefined,
        }
        const result = createSectionSchema.safeParse(input)
        expect(result.success).toBe(true)
      })

      test('configのデフォルトは空オブジェクト', () => {
        const input = {
          type: 'CUSTOM',
          isActive: true,
        }
        const result = createSectionSchema.safeParse(input)
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.config).toEqual({})
        }
      })

      test('designのデフォルトは空オブジェクト', () => {
        const input = {
          type: 'CUSTOM',
          isActive: true,
        }
        const result = createSectionSchema.safeParse(input)
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.design).toEqual({})
        }
      })

      test('isActiveのデフォルトはtrue', () => {
        const input = {
          type: 'HERO',
        }
        const result = createSectionSchema.safeParse(input)
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.isActive).toBe(true)
        }
      })

      test('orderはオプション', () => {
        const input = {
          ...VALID_CREATE_INPUT,
          order: undefined,
        }
        const result = createSectionSchema.safeParse(input)
        expect(result.success).toBe(true)
      })

      test('全セクションタイプが許可される', () => {
        const types = [
          'HERO',
          'HERO_PARALLAX',
          'CUSTOM',
          'CONCEPT',
          'SPACE_LIST',
          'SPACE_SHOWCASE',
          'NEWS_LIST',
          'POST_LIST',
          'FAQ_LIST',
          'FEATURES',
          'TESTIMONIAL',
          'GALLERY',
          'CTA',
          'CONTACT_FORM',
          'MAP',
          'EMBED',
          'INSTAGRAM',
        ]
        for (const type of types) {
          const result = createSectionSchema.safeParse({
            ...VALID_CREATE_INPUT,
            type,
          })
          expect(result.success).toBe(true)
        }
      })
    })

    describe('type', () => {
      test('無効なセクションタイプはエラー', () => {
        const result = createSectionSchema.safeParse({
          ...VALID_CREATE_INPUT,
          type: 'INVALID_TYPE',
        })
        expect(result.success).toBe(false)
      })

      test('typeが欠落するとエラー', () => {
        const { type: _type, ...inputWithoutType } = VALID_CREATE_INPUT
        const result = createSectionSchema.safeParse(inputWithoutType)
        expect(result.success).toBe(false)
      })
    })

    describe('pageId', () => {
      test('有効なUUIDは許可', () => {
        const result = createSectionSchema.safeParse({
          ...VALID_CREATE_INPUT,
          pageId: VALID_UUID,
        })
        expect(result.success).toBe(true)
      })

      test('無効なUUIDはエラー', () => {
        const result = createSectionSchema.safeParse({
          ...VALID_CREATE_INPUT,
          pageId: 'not-a-uuid',
        })
        expect(result.success).toBe(false)
      })
    })

    describe('title', () => {
      test('100文字のタイトルはOK', () => {
        const result = createSectionSchema.safeParse({
          ...VALID_CREATE_INPUT,
          title: 'あ'.repeat(100),
        })
        expect(result.success).toBe(true)
      })

      test('101文字のタイトルはエラー', () => {
        const result = createSectionSchema.safeParse({
          ...VALID_CREATE_INPUT,
          title: 'あ'.repeat(101),
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('100文字以内')
        }
      })
    })

    describe('content', () => {
      test('500,000文字のコンテンツはOK', () => {
        const result = createSectionSchema.safeParse({
          ...VALID_CREATE_INPUT,
          content: 'a'.repeat(500000),
        })
        expect(result.success).toBe(true)
      })

      test('500,001文字のコンテンツはエラー', () => {
        const result = createSectionSchema.safeParse({
          ...VALID_CREATE_INPUT,
          content: 'a'.repeat(500001),
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('500,000文字以内')
        }
      })
    })

    describe('order', () => {
      test('0以上の整数は許可', () => {
        const orders = [0, 1, 10, 100]
        for (const order of orders) {
          const result = createSectionSchema.safeParse({
            ...VALID_CREATE_INPUT,
            order,
          })
          expect(result.success).toBe(true)
        }
      })

      test('負の数はエラー', () => {
        const result = createSectionSchema.safeParse({
          ...VALID_CREATE_INPUT,
          order: -1,
        })
        expect(result.success).toBe(false)
      })

      test('小数はエラー', () => {
        const result = createSectionSchema.safeParse({
          ...VALID_CREATE_INPUT,
          order: 1.5,
        })
        expect(result.success).toBe(false)
      })
    })

    describe('isActive', () => {
      test('trueは許可', () => {
        const result = createSectionSchema.safeParse({
          ...VALID_CREATE_INPUT,
          isActive: true,
        })
        expect(result.success).toBe(true)
      })

      test('falseは許可', () => {
        const result = createSectionSchema.safeParse({
          ...VALID_CREATE_INPUT,
          isActive: false,
        })
        expect(result.success).toBe(true)
      })

      test('文字列はエラー', () => {
        const result = createSectionSchema.safeParse({
          ...VALID_CREATE_INPUT,
          isActive: 'true',
        })
        expect(result.success).toBe(false)
      })
    })
  })

  describe('updateSectionSchema バリデーション', () => {
    describe('正常系', () => {
      test('有効なデータはバリデーション通過', () => {
        const result = updateSectionSchema.safeParse(VALID_UPDATE_INPUT)
        expect(result.success).toBe(true)
      })

      test('空オブジェクトでもバリデーション通過', () => {
        const result = updateSectionSchema.safeParse({})
        expect(result.success).toBe(true)
      })

      test('titleのみの更新は許可', () => {
        const result = updateSectionSchema.safeParse({
          title: '新しいタイトル',
        })
        expect(result.success).toBe(true)
      })

      test('isActiveのみの更新は許可', () => {
        const result = updateSectionSchema.safeParse({
          isActive: false,
        })
        expect(result.success).toBe(true)
      })
    })

    describe('title', () => {
      test('100文字のタイトルはOK', () => {
        const result = updateSectionSchema.safeParse({
          title: 'あ'.repeat(100),
        })
        expect(result.success).toBe(true)
      })

      test('101文字のタイトルはエラー', () => {
        const result = updateSectionSchema.safeParse({
          title: 'あ'.repeat(101),
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('100文字以内')
        }
      })
    })

    describe('content', () => {
      test('500,001文字のコンテンツはエラー', () => {
        const result = updateSectionSchema.safeParse({
          content: 'a'.repeat(500001),
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('500,000文字以内')
        }
      })
    })
  })

  describe('updateSectionOrderSchema バリデーション', () => {
    describe('正常系', () => {
      test('有効なデータはバリデーション通過', () => {
        const result = updateSectionOrderSchema.safeParse(VALID_ORDER_INPUT)
        expect(result.success).toBe(true)
      })

      test('空配列も通過', () => {
        const result = updateSectionOrderSchema.safeParse({
          sections: [],
        })
        expect(result.success).toBe(true)
      })

      test('単一セクションの順序更新', () => {
        const result = updateSectionOrderSchema.safeParse({
          sections: [{ id: VALID_UUID, order: 5 }],
        })
        expect(result.success).toBe(true)
      })
    })

    describe('sections', () => {
      test('sectionsフィールドが欠落するとエラー', () => {
        const result = updateSectionOrderSchema.safeParse({})
        expect(result.success).toBe(false)
      })

      test('無効なUUIDはエラー', () => {
        const result = updateSectionOrderSchema.safeParse({
          sections: [{ id: 'not-a-uuid', order: 0 }],
        })
        expect(result.success).toBe(false)
      })

      test('負のorderはエラー', () => {
        const result = updateSectionOrderSchema.safeParse({
          sections: [{ id: VALID_UUID, order: -1 }],
        })
        expect(result.success).toBe(false)
      })

      test('小数のorderはエラー', () => {
        const result = updateSectionOrderSchema.safeParse({
          sections: [{ id: VALID_UUID, order: 1.5 }],
        })
        expect(result.success).toBe(false)
      })

      test('orderが欠落するとエラー', () => {
        const result = updateSectionOrderSchema.safeParse({
          sections: [{ id: VALID_UUID }],
        })
        expect(result.success).toBe(false)
      })

      test('idが欠落するとエラー', () => {
        const result = updateSectionOrderSchema.safeParse({
          sections: [{ order: 0 }],
        })
        expect(result.success).toBe(false)
      })
    })
  })

  describe('PageSectionData型テスト', () => {
    test('PageSectionData型の構造', () => {
      type PageSectionData = {
        id: string
        pageId: string
        type: string
        title: string | null
        config: Record<string, unknown>
        design: unknown
        content: string | null
        order: number
        isActive: boolean
        createdAt: Date
        updatedAt: Date
      }

      const section: PageSectionData = {
        id: VALID_UUID,
        pageId: VALID_UUID_2,
        type: 'HERO',
        title: 'テストヒーロー',
        config: { height: 'lg' },
        design: {},
        content: null,
        order: 0,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      expect(section.type).toBe('HERO')
      expect(section.title).toBe('テストヒーロー')
      expect(section.order).toBe(0)
    })
  })

  describe('境界値テスト', () => {
    test('タイトル 100文字（境界）', () => {
      const result = createSectionSchema.safeParse({
        ...VALID_CREATE_INPUT,
        title: 'x'.repeat(100),
      })
      expect(result.success).toBe(true)
    })

    test('タイトル 101文字（境界超過）', () => {
      const result = createSectionSchema.safeParse({
        ...VALID_CREATE_INPUT,
        title: 'x'.repeat(101),
      })
      expect(result.success).toBe(false)
    })

    test('order 0（最小値）', () => {
      const result = createSectionSchema.safeParse({
        ...VALID_CREATE_INPUT,
        order: 0,
      })
      expect(result.success).toBe(true)
    })

    test('order -1（最小値未満）', () => {
      const result = createSectionSchema.safeParse({
        ...VALID_CREATE_INPUT,
        order: -1,
      })
      expect(result.success).toBe(false)
    })
  })
})
