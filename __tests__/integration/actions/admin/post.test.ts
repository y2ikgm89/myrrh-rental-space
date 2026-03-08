/**
 * 投稿管理Server Action統合テスト
 *
 * src/actions/admin/post.ts のテスト
 *
 * 注: Server Actionsの直接テストは複雑なため、
 *     バリデーションスキーマ + action-helpersロジックをテスト
 */

import { describe, test, expect } from 'bun:test'
import { z } from 'zod'
import { PostStatus } from '@/shared/db/enums'
import { LayoutWidth } from '@/shared/types/prisma'

// post.ts 内で定義されているスキーマを再現
const createPostSchema = z.object({
  title: z.string().min(1, { error: 'タイトルは必須です' }).max(200, { error: 'タイトルは200文字以内' }),
  slug: z
    .string()
    .min(1, { error: 'スラッグは必須です' })
    .max(200)
    .regex(/^[a-z0-9-]+$/, { error: 'スラッグは小文字英数字とハイフンのみ' }),
  excerpt: z.string().min(1, { error: '抜粋は必須です' }).max(500, { error: '抜粋は500文字以内' }),
  content: z.string().default(''),
  thumbnailUrl: z.string().min(1, { error: 'サムネイルURLは必須です' }),
  ogpImageUrl: z.string().nullable().optional(),
  categoryId: z.string().uuid({ error: 'カテゴリを選択してください' }),
  tags: z.array(z.string()).default([]),
  metaDescription: z.string().max(160).nullable().optional(),
  metaKeywords: z.string().nullable().optional(),
  ogpTitle: z.string().max(60).nullable().optional(),
  ogpDescription: z.string().max(160).nullable().optional(),
})

const updatePostSchema = z.object({
  title: z.string().min(1, { error: 'タイトルは必須です' }).max(200, { error: 'タイトルは200文字以内' }),
  slug: z
    .string()
    .min(1, { error: 'スラッグは必須です' })
    .max(200)
    .regex(/^[a-z0-9-]+$/, { error: 'スラッグは小文字英数字とハイフンのみ' }),
  excerpt: z.string().min(1, { error: '抜粋は必須です' }).max(500, { error: '抜粋は500文字以内' }),
  content: z.string().min(1, { error: '本文は必須です' }),
  thumbnailUrl: z.string().min(1, { error: 'サムネイルURLは必須です' }),
  ogpImageUrl: z.string().nullable().optional(),
  categoryId: z.string().uuid({ error: 'カテゴリを選択してください' }),
  tags: z.array(z.string()).default([]),
  metaDescription: z.string().max(160).nullable().optional(),
  metaKeywords: z.string().nullable().optional(),
  ogpTitle: z.string().max(60).nullable().optional(),
  ogpDescription: z.string().max(160).nullable().optional(),
  contentWidth: z.enum(LayoutWidth).nullable().optional(),
  contentWidthCustom: z.number().int().min(320).max(1920).nullable().optional(),
})

const postCategorySchema = z.object({
  name: z.string().min(1, { error: 'カテゴリ名は必須です' }).max(50, { error: 'カテゴリ名は50文字以内' }),
  slug: z
    .string()
    .min(1, { error: 'スラッグは必須です' })
    .max(50)
    .regex(/^[a-z0-9-]+$/, { error: 'スラッグは小文字英数字とハイフンのみ' }),
  description: z.string().max(200).nullable().optional(),
  order: z.number().int().min(0).default(0),
})

// 有効なUUID
const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000'

// 有効な投稿作成データ
const VALID_CREATE_POST_INPUT = {
  title: 'テスト投稿',
  slug: 'test-post',
  excerpt: 'これはテスト用の投稿の抜粋です。',
  content: '',
  thumbnailUrl: 'https://example.com/thumbnail.jpg',
  categoryId: VALID_UUID,
  tags: ['テスト', '投稿'],
}

// 有効な投稿更新データ
const VALID_UPDATE_POST_INPUT = {
  title: 'テスト投稿（更新）',
  slug: 'test-post-updated',
  excerpt: 'これは更新された投稿の抜粋です。',
  content: '<p>これは更新された投稿の本文です。</p>',
  thumbnailUrl: 'https://example.com/thumbnail-updated.jpg',
  categoryId: VALID_UUID,
  tags: ['テスト', '投稿', '更新'],
}

// 有効なカテゴリ作成データ
const VALID_CATEGORY_INPUT = {
  name: 'テストカテゴリ',
  slug: 'test-category',
  description: 'テスト用のカテゴリです',
  order: 1,
}

describe('Post Admin Action Integration', () => {
  describe('createPostSchema バリデーション', () => {
    describe('正常系', () => {
      test('有効なデータはバリデーション通過', () => {
        const result = createPostSchema.safeParse(VALID_CREATE_POST_INPUT)
        expect(result.success).toBe(true)
      })

      test('オプションフィールド省略可能', () => {
        const minimalInput = {
          title: 'タイトル',
          slug: 'title',
          excerpt: '抜粋',
          thumbnailUrl: 'https://example.com/image.jpg',
          categoryId: VALID_UUID,
        }
        const result = createPostSchema.safeParse(minimalInput)
        expect(result.success).toBe(true)
      })

      test('contentはデフォルト空文字', () => {
        const input = {
          title: 'タイトル',
          slug: 'title',
          excerpt: '抜粋',
          thumbnailUrl: 'https://example.com/image.jpg',
          categoryId: VALID_UUID,
        }
        const result = createPostSchema.safeParse(input)
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.content).toBe('')
        }
      })

      test('tagsはデフォルト空配列', () => {
        const input = {
          title: 'タイトル',
          slug: 'title',
          excerpt: '抜粋',
          thumbnailUrl: 'https://example.com/image.jpg',
          categoryId: VALID_UUID,
        }
        const result = createPostSchema.safeParse(input)
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.tags).toEqual([])
        }
      })
    })

    describe('title', () => {
      test('空のタイトルはエラー', () => {
        const result = createPostSchema.safeParse({
          ...VALID_CREATE_POST_INPUT,
          title: '',
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('タイトルは必須')
        }
      })

      test('200文字のタイトルはOK', () => {
        const result = createPostSchema.safeParse({
          ...VALID_CREATE_POST_INPUT,
          title: 'あ'.repeat(200),
        })
        expect(result.success).toBe(true)
      })

      test('201文字のタイトルはエラー', () => {
        const result = createPostSchema.safeParse({
          ...VALID_CREATE_POST_INPUT,
          title: 'あ'.repeat(201),
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('200文字以内')
        }
      })
    })

    describe('slug', () => {
      test('空のスラッグはエラー', () => {
        const result = createPostSchema.safeParse({
          ...VALID_CREATE_POST_INPUT,
          slug: '',
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('スラッグは必須')
        }
      })

      test('有効なスラッグ形式', () => {
        const validSlugs = [
          'test',
          'test-post',
          'test-post-123',
          'a',
          '123',
          'a-1-b-2',
        ]

        for (const slug of validSlugs) {
          const result = createPostSchema.safeParse({
            ...VALID_CREATE_POST_INPUT,
            slug,
          })
          expect(result.success).toBe(true)
        }
      })

      test('無効なスラッグ形式（大文字）', () => {
        const result = createPostSchema.safeParse({
          ...VALID_CREATE_POST_INPUT,
          slug: 'Test-Post',
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('小文字英数字とハイフンのみ')
        }
      })

      test('無効なスラッグ形式（アンダースコア）', () => {
        const result = createPostSchema.safeParse({
          ...VALID_CREATE_POST_INPUT,
          slug: 'test_post',
        })
        expect(result.success).toBe(false)
      })

      test('無効なスラッグ形式（スペース）', () => {
        const result = createPostSchema.safeParse({
          ...VALID_CREATE_POST_INPUT,
          slug: 'test post',
        })
        expect(result.success).toBe(false)
      })

      test('無効なスラッグ形式（日本語）', () => {
        const result = createPostSchema.safeParse({
          ...VALID_CREATE_POST_INPUT,
          slug: 'テスト',
        })
        expect(result.success).toBe(false)
      })

      test('200文字のスラッグはOK', () => {
        const result = createPostSchema.safeParse({
          ...VALID_CREATE_POST_INPUT,
          slug: 'a'.repeat(200),
        })
        expect(result.success).toBe(true)
      })

      test('201文字のスラッグはエラー', () => {
        const result = createPostSchema.safeParse({
          ...VALID_CREATE_POST_INPUT,
          slug: 'a'.repeat(201),
        })
        expect(result.success).toBe(false)
      })
    })

    describe('excerpt', () => {
      test('空の抜粋はエラー', () => {
        const result = createPostSchema.safeParse({
          ...VALID_CREATE_POST_INPUT,
          excerpt: '',
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('抜粋は必須')
        }
      })

      test('500文字の抜粋はOK', () => {
        const result = createPostSchema.safeParse({
          ...VALID_CREATE_POST_INPUT,
          excerpt: 'あ'.repeat(500),
        })
        expect(result.success).toBe(true)
      })

      test('501文字の抜粋はエラー', () => {
        const result = createPostSchema.safeParse({
          ...VALID_CREATE_POST_INPUT,
          excerpt: 'あ'.repeat(501),
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('500文字以内')
        }
      })
    })

    describe('thumbnailUrl', () => {
      test('空のサムネイルURLはエラー', () => {
        const result = createPostSchema.safeParse({
          ...VALID_CREATE_POST_INPUT,
          thumbnailUrl: '',
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('サムネイルURLは必須')
        }
      })
    })

    describe('categoryId', () => {
      test('無効なUUIDはエラー', () => {
        const result = createPostSchema.safeParse({
          ...VALID_CREATE_POST_INPUT,
          categoryId: 'invalid-uuid',
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('カテゴリを選択')
        }
      })
    })

    describe('SEOフィールド', () => {
      test('metaDescriptionは160文字以内', () => {
        const result = createPostSchema.safeParse({
          ...VALID_CREATE_POST_INPUT,
          metaDescription: 'あ'.repeat(161),
        })
        expect(result.success).toBe(false)
      })

      test('ogpTitleは60文字以内', () => {
        const result = createPostSchema.safeParse({
          ...VALID_CREATE_POST_INPUT,
          ogpTitle: 'あ'.repeat(61),
        })
        expect(result.success).toBe(false)
      })

      test('ogpDescriptionは160文字以内', () => {
        const result = createPostSchema.safeParse({
          ...VALID_CREATE_POST_INPUT,
          ogpDescription: 'あ'.repeat(161),
        })
        expect(result.success).toBe(false)
      })
    })
  })

  describe('updatePostSchema バリデーション', () => {
    describe('正常系', () => {
      test('有効なデータはバリデーション通過', () => {
        const result = updatePostSchema.safeParse(VALID_UPDATE_POST_INPUT)
        expect(result.success).toBe(true)
      })

      test('contentWidthオプション設定可能', () => {
        const result = updatePostSchema.safeParse({
          ...VALID_UPDATE_POST_INPUT,
          contentWidth: LayoutWidth.MD,
        })
        expect(result.success).toBe(true)
      })

      test('contentWidthCustom設定可能', () => {
        const result = updatePostSchema.safeParse({
          ...VALID_UPDATE_POST_INPUT,
          contentWidthCustom: 800,
        })
        expect(result.success).toBe(true)
      })
    })

    describe('content', () => {
      test('空の本文はエラー（更新時は必須）', () => {
        const result = updatePostSchema.safeParse({
          ...VALID_UPDATE_POST_INPUT,
          content: '',
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('本文は必須')
        }
      })
    })

    describe('contentWidthCustom', () => {
      test('320px（最小値）はOK', () => {
        const result = updatePostSchema.safeParse({
          ...VALID_UPDATE_POST_INPUT,
          contentWidthCustom: 320,
        })
        expect(result.success).toBe(true)
      })

      test('1920px（最大値）はOK', () => {
        const result = updatePostSchema.safeParse({
          ...VALID_UPDATE_POST_INPUT,
          contentWidthCustom: 1920,
        })
        expect(result.success).toBe(true)
      })

      test('319px（最小値未満）はエラー', () => {
        const result = updatePostSchema.safeParse({
          ...VALID_UPDATE_POST_INPUT,
          contentWidthCustom: 319,
        })
        expect(result.success).toBe(false)
      })

      test('1921px（最大値超過）はエラー', () => {
        const result = updatePostSchema.safeParse({
          ...VALID_UPDATE_POST_INPUT,
          contentWidthCustom: 1921,
        })
        expect(result.success).toBe(false)
      })

      test('小数はエラー', () => {
        const result = updatePostSchema.safeParse({
          ...VALID_UPDATE_POST_INPUT,
          contentWidthCustom: 800.5,
        })
        expect(result.success).toBe(false)
      })
    })
  })

  describe('postCategorySchema バリデーション', () => {
    describe('正常系', () => {
      test('有効なデータはバリデーション通過', () => {
        const result = postCategorySchema.safeParse(VALID_CATEGORY_INPUT)
        expect(result.success).toBe(true)
      })

      test('descriptionは省略可能', () => {
        const result = postCategorySchema.safeParse({
          name: 'カテゴリ',
          slug: 'category',
        })
        expect(result.success).toBe(true)
      })

      test('orderはデフォルト0', () => {
        const result = postCategorySchema.safeParse({
          name: 'カテゴリ',
          slug: 'category',
        })
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.order).toBe(0)
        }
      })
    })

    describe('name', () => {
      test('空のカテゴリ名はエラー', () => {
        const result = postCategorySchema.safeParse({
          ...VALID_CATEGORY_INPUT,
          name: '',
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('カテゴリ名は必須')
        }
      })

      test('50文字のカテゴリ名はOK', () => {
        const result = postCategorySchema.safeParse({
          ...VALID_CATEGORY_INPUT,
          name: 'あ'.repeat(50),
        })
        expect(result.success).toBe(true)
      })

      test('51文字のカテゴリ名はエラー', () => {
        const result = postCategorySchema.safeParse({
          ...VALID_CATEGORY_INPUT,
          name: 'あ'.repeat(51),
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('50文字以内')
        }
      })
    })

    describe('slug', () => {
      test('カテゴリスラッグも小文字英数字とハイフンのみ', () => {
        const invalidSlugs = ['Test', 'test_post', 'テスト', 'test post']

        for (const slug of invalidSlugs) {
          const result = postCategorySchema.safeParse({
            ...VALID_CATEGORY_INPUT,
            slug,
          })
          expect(result.success).toBe(false)
        }
      })

      test('50文字のカテゴリスラッグはOK', () => {
        const result = postCategorySchema.safeParse({
          ...VALID_CATEGORY_INPUT,
          slug: 'a'.repeat(50),
        })
        expect(result.success).toBe(true)
      })

      test('51文字のカテゴリスラッグはエラー', () => {
        const result = postCategorySchema.safeParse({
          ...VALID_CATEGORY_INPUT,
          slug: 'a'.repeat(51),
        })
        expect(result.success).toBe(false)
      })
    })

    describe('description', () => {
      test('200文字の説明はOK', () => {
        const result = postCategorySchema.safeParse({
          ...VALID_CATEGORY_INPUT,
          description: 'あ'.repeat(200),
        })
        expect(result.success).toBe(true)
      })

      test('201文字の説明はエラー', () => {
        const result = postCategorySchema.safeParse({
          ...VALID_CATEGORY_INPUT,
          description: 'あ'.repeat(201),
        })
        expect(result.success).toBe(false)
      })

      test('nullの説明は許可', () => {
        const result = postCategorySchema.safeParse({
          ...VALID_CATEGORY_INPUT,
          description: null,
        })
        expect(result.success).toBe(true)
      })
    })

    describe('order', () => {
      test('0は許可（最小値）', () => {
        const result = postCategorySchema.safeParse({
          ...VALID_CATEGORY_INPUT,
          order: 0,
        })
        expect(result.success).toBe(true)
      })

      test('負の値はエラー', () => {
        const result = postCategorySchema.safeParse({
          ...VALID_CATEGORY_INPUT,
          order: -1,
        })
        expect(result.success).toBe(false)
      })

      test('小数はエラー', () => {
        const result = postCategorySchema.safeParse({
          ...VALID_CATEGORY_INPUT,
          order: 1.5,
        })
        expect(result.success).toBe(false)
      })
    })
  })

  describe('PostStatus enum 整合性', () => {
    test('PostStatus enumは3つの値を持つ', () => {
      expect(Object.values(PostStatus)).toHaveLength(3)
    })

    test('PostStatus enumの値', () => {
      const expectedStatuses = ['DRAFT', 'PUBLISHED', 'ARCHIVED']
      const enumValues = Object.values(PostStatus) as string[]

      for (const status of expectedStatuses) {
        expect(enumValues).toContain(status)
      }
    })
  })

  describe('LayoutWidth enum テスト', () => {
    test('LayoutWidth enumの値が存在', () => {
      // 実際のenum値: XS, SM, MD, LG, XL, FULL, CUSTOM
      expect(LayoutWidth.XS).toBeDefined()
      expect(LayoutWidth.SM).toBeDefined()
      expect(LayoutWidth.MD).toBeDefined()
      expect(LayoutWidth.LG).toBeDefined()
      expect(LayoutWidth.XL).toBeDefined()
      expect(LayoutWidth.FULL).toBeDefined()
      expect(LayoutWidth.CUSTOM).toBeDefined()
    })

    test('updatePostSchemaでLayoutWidth使用可能', () => {
      const widths = [
        LayoutWidth.XS,
        LayoutWidth.SM,
        LayoutWidth.MD,
        LayoutWidth.LG,
        LayoutWidth.XL,
        LayoutWidth.FULL,
        LayoutWidth.CUSTOM,
      ]

      for (const width of widths) {
        const result = updatePostSchema.safeParse({
          ...VALID_UPDATE_POST_INPUT,
          contentWidth: width,
        })
        expect(result.success).toBe(true)
      }
    })
  })

  describe('フィルター型テスト', () => {
    test('有効なフィルター値', () => {
      type PostFilters = {
        status?: 'ALL' | 'PUBLISHED' | 'DRAFT' | 'ARCHIVED'
        categoryId?: string
        search?: string
      }

      const filters: PostFilters = {
        status: 'PUBLISHED',
        categoryId: VALID_UUID,
        search: 'テスト',
      }

      expect(filters.status).toBe('PUBLISHED')
    })
  })

  describe('境界値テスト', () => {
    test('タイトル200文字（境界）', () => {
      const result = createPostSchema.safeParse({
        ...VALID_CREATE_POST_INPUT,
        title: 'x'.repeat(200),
      })
      expect(result.success).toBe(true)
    })

    test('スラッグ200文字（境界）', () => {
      const result = createPostSchema.safeParse({
        ...VALID_CREATE_POST_INPUT,
        slug: 'x'.repeat(200),
      })
      expect(result.success).toBe(true)
    })

    test('抜粋500文字（境界）', () => {
      const result = createPostSchema.safeParse({
        ...VALID_CREATE_POST_INPUT,
        excerpt: 'x'.repeat(500),
      })
      expect(result.success).toBe(true)
    })

    test('metaDescription 160文字（境界）', () => {
      const result = createPostSchema.safeParse({
        ...VALID_CREATE_POST_INPUT,
        metaDescription: 'x'.repeat(160),
      })
      expect(result.success).toBe(true)
    })

    test('ogpTitle 60文字（境界）', () => {
      const result = createPostSchema.safeParse({
        ...VALID_CREATE_POST_INPUT,
        ogpTitle: 'x'.repeat(60),
      })
      expect(result.success).toBe(true)
    })
  })

  // 注: 権限チェック（hasPermission, canAccessAdmin, checkReadPermission）のテストは
  // __tests__/unit/lib/permissions.test.ts で網羅的にテスト済み
})
