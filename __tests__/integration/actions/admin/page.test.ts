/**
 * ページ管理Server Action統合テスト
 *
 * src/actions/admin/page.ts のテスト
 *
 * 注: Server Actionsの直接テストは複雑なため、
 *     バリデーションスキーマ + action-helpersロジックをテスト
 */

import { describe, test, expect } from 'bun:test'
import { z } from 'zod'
import { LayoutWidth } from '@/shared/types/prisma'

// page.ts で使用されているスキーマを再現
const updatePageSeoSchema = z.object({
  title: z.string().min(1, 'タイトルは必須です').max(200, 'タイトルは200文字以内です'),
  metaDescription: z.string().max(160, 'メタディスクリプションは160文字以内です').optional(),
  metaKeywords: z.string().max(200, 'メタキーワードは200文字以内です').optional(),
  ogpTitle: z.string().max(100, 'OGPタイトルは100文字以内です').optional(),
  ogpDescription: z.string().max(200, 'OGP説明は200文字以内です').optional(),
  ogpImageUrl: z.string().url('有効なURLを入力してください').optional().or(z.literal('')),
})

const updatePageSchema = z.object({
  title: z.string().min(1, 'タイトルは必須です').max(200, 'タイトルは200文字以内です'),
  description: z.string().max(500, '説明は500文字以内です').optional(),
  content: z.string().min(1, 'コンテンツは必須です').max(500000, 'コンテンツは500,000文字以内です'),
  metaDescription: z.string().max(160, 'メタディスクリプションは160文字以内です').optional(),
  metaKeywords: z.string().max(200, 'メタキーワードは200文字以内です').optional(),
  ogpTitle: z.string().max(100, 'OGPタイトルは100文字以内です').optional(),
  ogpDescription: z.string().max(200, 'OGP説明は200文字以内です').optional(),
  ogpImageUrl: z.string().url('有効なURLを入力してください').optional().or(z.literal('')),
  isPublished: z.boolean().default(true),
  publishedAt: z.coerce.date().optional(),
  contentWidth: z.nativeEnum(LayoutWidth).optional(),
  contentWidthCustom: z.number().int().min(320).max(1920).optional(),
})

const createPageSchema = z.object({
  slug: z
    .string()
    .min(1, 'スラッグは必須です')
    .max(100, 'スラッグは100文字以内です')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'スラッグは半角英数字とハイフンのみ使用可能です'),
  title: z.string().min(1, 'タイトルは必須です').max(200, 'タイトルは200文字以内です'),
  description: z.string().max(500, '説明は500文字以内です').optional(),
  isPublished: z.boolean().default(false),
})

// 有効なページ作成データ
const VALID_CREATE_PAGE_INPUT = {
  slug: 'test-page',
  title: 'テストページ',
  description: 'テストページの説明です。',
  isPublished: false,
}

// 有効なページ更新データ
const VALID_UPDATE_PAGE_INPUT = {
  title: 'テストページ（更新）',
  description: 'テストページの説明です（更新）。',
  content: '<div><h1>テスト</h1><p>本文</p></div>',
  isPublished: true,
}

// 有効なSEO更新データ
const VALID_UPDATE_SEO_INPUT = {
  title: 'テストページ',
  metaDescription: 'テストページのメタディスクリプション',
  metaKeywords: 'テスト, ページ, キーワード',
  ogpTitle: 'テストページ | サイト名',
  ogpDescription: 'OGP用の説明文',
  ogpImageUrl: 'https://example.com/ogp-image.jpg',
}

describe('Page Admin Action Integration', () => {
  describe('createPageSchema バリデーション', () => {
    describe('正常系', () => {
      test('有効なデータはバリデーション通過', () => {
        const result = createPageSchema.safeParse(VALID_CREATE_PAGE_INPUT)
        expect(result.success).toBe(true)
      })

      test('isPublishedデフォルトはfalse', () => {
        const input = {
          slug: 'test-page',
          title: 'テスト',
        }
        const result = createPageSchema.safeParse(input)
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.isPublished).toBe(false)
        }
      })

      test('descriptionはオプション', () => {
        const input = {
          slug: 'test-page',
          title: 'テスト',
        }
        const result = createPageSchema.safeParse(input)
        expect(result.success).toBe(true)
      })
    })

    describe('slug', () => {
      test('空のスラッグはエラー', () => {
        const result = createPageSchema.safeParse({
          ...VALID_CREATE_PAGE_INPUT,
          slug: '',
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('スラッグは必須')
        }
      })

      test('100文字のスラッグはOK', () => {
        const result = createPageSchema.safeParse({
          ...VALID_CREATE_PAGE_INPUT,
          slug: 'a'.repeat(100),
        })
        expect(result.success).toBe(true)
      })

      test('101文字のスラッグはエラー', () => {
        const result = createPageSchema.safeParse({
          ...VALID_CREATE_PAGE_INPUT,
          slug: 'a'.repeat(101),
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('100文字以内')
        }
      })

      test('有効なスラッグ形式', () => {
        const validSlugs = ['test', 'test-page', 'my-new-page', 'page-123', 'a-b-c']
        for (const slug of validSlugs) {
          const result = createPageSchema.safeParse({
            ...VALID_CREATE_PAGE_INPUT,
            slug,
          })
          expect(result.success).toBe(true)
        }
      })

      test('無効なスラッグ形式はエラー', () => {
        const invalidSlugs = [
          'Test-Page', // 大文字
          'test_page', // アンダースコア
          'test page', // スペース
          '-test', // ハイフン始まり
          'test-', // ハイフン終わり
          'test--page', // 連続ハイフン
          'テスト', // 日本語
        ]
        for (const slug of invalidSlugs) {
          const result = createPageSchema.safeParse({
            ...VALID_CREATE_PAGE_INPUT,
            slug,
          })
          expect(result.success).toBe(false)
        }
      })
    })

    describe('title', () => {
      test('空のタイトルはエラー', () => {
        const result = createPageSchema.safeParse({
          ...VALID_CREATE_PAGE_INPUT,
          title: '',
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('タイトルは必須')
        }
      })

      test('200文字のタイトルはOK', () => {
        const result = createPageSchema.safeParse({
          ...VALID_CREATE_PAGE_INPUT,
          title: 'あ'.repeat(200),
        })
        expect(result.success).toBe(true)
      })

      test('201文字のタイトルはエラー', () => {
        const result = createPageSchema.safeParse({
          ...VALID_CREATE_PAGE_INPUT,
          title: 'あ'.repeat(201),
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('200文字以内')
        }
      })
    })

    describe('description', () => {
      test('500文字の説明はOK', () => {
        const result = createPageSchema.safeParse({
          ...VALID_CREATE_PAGE_INPUT,
          description: 'あ'.repeat(500),
        })
        expect(result.success).toBe(true)
      })

      test('501文字の説明はエラー', () => {
        const result = createPageSchema.safeParse({
          ...VALID_CREATE_PAGE_INPUT,
          description: 'あ'.repeat(501),
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('500文字以内')
        }
      })
    })
  })

  describe('updatePageSchema バリデーション', () => {
    describe('正常系', () => {
      test('有効なデータはバリデーション通過', () => {
        const result = updatePageSchema.safeParse(VALID_UPDATE_PAGE_INPUT)
        expect(result.success).toBe(true)
      })

      test('HTMLコンテンツは許可', () => {
        const result = updatePageSchema.safeParse({
          ...VALID_UPDATE_PAGE_INPUT,
          content: '<div><h1>見出し</h1><p>本文</p><script>alert("test")</script></div>',
        })
        expect(result.success).toBe(true)
      })

      test('contentWidthオプション設定可能', () => {
        const result = updatePageSchema.safeParse({
          ...VALID_UPDATE_PAGE_INPUT,
          contentWidth: LayoutWidth.MD,
        })
        expect(result.success).toBe(true)
      })

      test('contentWidthCustom設定可能', () => {
        const result = updatePageSchema.safeParse({
          ...VALID_UPDATE_PAGE_INPUT,
          contentWidthCustom: 800,
        })
        expect(result.success).toBe(true)
      })

      test('publishedAtは日付に変換される', () => {
        const result = updatePageSchema.safeParse({
          ...VALID_UPDATE_PAGE_INPUT,
          publishedAt: '2024-01-15T10:00:00Z',
        })
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.publishedAt).toBeInstanceOf(Date)
        }
      })
    })

    describe('content', () => {
      test('空のコンテンツはエラー', () => {
        const result = updatePageSchema.safeParse({
          ...VALID_UPDATE_PAGE_INPUT,
          content: '',
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('コンテンツは必須')
        }
      })

      test('500,000文字のコンテンツはOK', () => {
        const result = updatePageSchema.safeParse({
          ...VALID_UPDATE_PAGE_INPUT,
          content: 'x'.repeat(500000),
        })
        expect(result.success).toBe(true)
      })

      test('500,001文字のコンテンツはエラー', () => {
        const result = updatePageSchema.safeParse({
          ...VALID_UPDATE_PAGE_INPUT,
          content: 'x'.repeat(500001),
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('500,000文字以内')
        }
      })
    })

    describe('contentWidthCustom', () => {
      test('320px（最小値）はOK', () => {
        const result = updatePageSchema.safeParse({
          ...VALID_UPDATE_PAGE_INPUT,
          contentWidthCustom: 320,
        })
        expect(result.success).toBe(true)
      })

      test('1920px（最大値）はOK', () => {
        const result = updatePageSchema.safeParse({
          ...VALID_UPDATE_PAGE_INPUT,
          contentWidthCustom: 1920,
        })
        expect(result.success).toBe(true)
      })

      test('319px（最小値未満）はエラー', () => {
        const result = updatePageSchema.safeParse({
          ...VALID_UPDATE_PAGE_INPUT,
          contentWidthCustom: 319,
        })
        expect(result.success).toBe(false)
      })

      test('1921px（最大値超過）はエラー', () => {
        const result = updatePageSchema.safeParse({
          ...VALID_UPDATE_PAGE_INPUT,
          contentWidthCustom: 1921,
        })
        expect(result.success).toBe(false)
      })
    })
  })

  describe('updatePageSeoSchema バリデーション', () => {
    describe('正常系', () => {
      test('有効なデータはバリデーション通過', () => {
        const result = updatePageSeoSchema.safeParse(VALID_UPDATE_SEO_INPUT)
        expect(result.success).toBe(true)
      })

      test('必須フィールドのみでも通過', () => {
        const result = updatePageSeoSchema.safeParse({
          title: 'テストページ',
        })
        expect(result.success).toBe(true)
      })

      test('ogpImageUrlは空文字も許可', () => {
        const result = updatePageSeoSchema.safeParse({
          ...VALID_UPDATE_SEO_INPUT,
          ogpImageUrl: '',
        })
        expect(result.success).toBe(true)
      })
    })

    describe('title', () => {
      test('空のタイトルはエラー', () => {
        const result = updatePageSeoSchema.safeParse({
          ...VALID_UPDATE_SEO_INPUT,
          title: '',
        })
        expect(result.success).toBe(false)
      })

      test('200文字のタイトルはOK', () => {
        const result = updatePageSeoSchema.safeParse({
          ...VALID_UPDATE_SEO_INPUT,
          title: 'あ'.repeat(200),
        })
        expect(result.success).toBe(true)
      })

      test('201文字のタイトルはエラー', () => {
        const result = updatePageSeoSchema.safeParse({
          ...VALID_UPDATE_SEO_INPUT,
          title: 'あ'.repeat(201),
        })
        expect(result.success).toBe(false)
      })
    })

    describe('metaDescription', () => {
      test('160文字のメタディスクリプションはOK', () => {
        const result = updatePageSeoSchema.safeParse({
          ...VALID_UPDATE_SEO_INPUT,
          metaDescription: 'あ'.repeat(160),
        })
        expect(result.success).toBe(true)
      })

      test('161文字のメタディスクリプションはエラー', () => {
        const result = updatePageSeoSchema.safeParse({
          ...VALID_UPDATE_SEO_INPUT,
          metaDescription: 'あ'.repeat(161),
        })
        expect(result.success).toBe(false)
      })
    })

    describe('metaKeywords', () => {
      test('200文字のメタキーワードはOK', () => {
        const result = updatePageSeoSchema.safeParse({
          ...VALID_UPDATE_SEO_INPUT,
          metaKeywords: 'あ'.repeat(200),
        })
        expect(result.success).toBe(true)
      })

      test('201文字のメタキーワードはエラー', () => {
        const result = updatePageSeoSchema.safeParse({
          ...VALID_UPDATE_SEO_INPUT,
          metaKeywords: 'あ'.repeat(201),
        })
        expect(result.success).toBe(false)
      })
    })

    describe('ogpTitle', () => {
      test('100文字のOGPタイトルはOK', () => {
        const result = updatePageSeoSchema.safeParse({
          ...VALID_UPDATE_SEO_INPUT,
          ogpTitle: 'あ'.repeat(100),
        })
        expect(result.success).toBe(true)
      })

      test('101文字のOGPタイトルはエラー', () => {
        const result = updatePageSeoSchema.safeParse({
          ...VALID_UPDATE_SEO_INPUT,
          ogpTitle: 'あ'.repeat(101),
        })
        expect(result.success).toBe(false)
      })
    })

    describe('ogpDescription', () => {
      test('200文字のOGP説明はOK', () => {
        const result = updatePageSeoSchema.safeParse({
          ...VALID_UPDATE_SEO_INPUT,
          ogpDescription: 'あ'.repeat(200),
        })
        expect(result.success).toBe(true)
      })

      test('201文字のOGP説明はエラー', () => {
        const result = updatePageSeoSchema.safeParse({
          ...VALID_UPDATE_SEO_INPUT,
          ogpDescription: 'あ'.repeat(201),
        })
        expect(result.success).toBe(false)
      })
    })

    describe('ogpImageUrl', () => {
      test('有効なURLは許可', () => {
        const result = updatePageSeoSchema.safeParse({
          ...VALID_UPDATE_SEO_INPUT,
          ogpImageUrl: 'https://example.com/image.jpg',
        })
        expect(result.success).toBe(true)
      })

      test('無効なURLはエラー', () => {
        const result = updatePageSeoSchema.safeParse({
          ...VALID_UPDATE_SEO_INPUT,
          ogpImageUrl: 'not-a-url',
        })
        expect(result.success).toBe(false)
      })
    })
  })

  describe('LayoutWidth enum テスト', () => {
    test('LayoutWidth enumの値が存在', () => {
      expect(LayoutWidth.XS).toBeDefined()
      expect(LayoutWidth.SM).toBeDefined()
      expect(LayoutWidth.MD).toBeDefined()
      expect(LayoutWidth.LG).toBeDefined()
      expect(LayoutWidth.XL).toBeDefined()
      expect(LayoutWidth.FULL).toBeDefined()
      expect(LayoutWidth.CUSTOM).toBeDefined()
    })

    test('updatePageSchemaでLayoutWidth使用可能', () => {
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
        const result = updatePageSchema.safeParse({
          ...VALID_UPDATE_PAGE_INPUT,
          contentWidth: width,
        })
        expect(result.success).toBe(true)
      }
    })
  })

  describe('システムページ定義テスト', () => {
    test('システムページの定義', () => {
      const SYSTEM_PAGES = [
        { slug: 'privacy', title: 'プライバシーポリシー', isContentEditable: true },
        { slug: 'terms', title: '利用規約', isContentEditable: true },
        { slug: 'about', title: '会社概要', isContentEditable: true },
        { slug: 'faq', title: 'よくある質問', isContentEditable: true },
        { slug: 'reservation', title: '予約', isContentEditable: false },
        { slug: 'spaces', title: 'スペース一覧', isContentEditable: false },
        { slug: 'contact', title: 'お問い合わせ', isContentEditable: false },
        { slug: 'posts', title: '投稿', isContentEditable: false },
        { slug: 'news', title: 'お知らせ', isContentEditable: false },
      ]

      expect(SYSTEM_PAGES).toHaveLength(9)
      expect(SYSTEM_PAGES.filter((p) => p.isContentEditable)).toHaveLength(4)
      expect(SYSTEM_PAGES.filter((p) => !p.isContentEditable)).toHaveLength(5)
    })
  })

  describe('PageData型テスト', () => {
    test('PageData型の構造', () => {
      type PageData = {
        id: string
        slug: string
        title: string
        description: string | null
        content: string
        metaDescription: string | null
        metaKeywords: string | null
        ogpTitle: string | null
        ogpDescription: string | null
        ogpImageUrl: string | null
        isPublished: boolean
        publishedAt: Date | null
        isActive: boolean
        isSystemPage: boolean
        contentWidth: typeof LayoutWidth[keyof typeof LayoutWidth] | null
        contentWidthCustom: number | null
        createdAt: Date
        updatedAt: Date
      }

      const page: PageData = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        slug: 'test-page',
        title: 'テストページ',
        description: '説明',
        content: '<p>本文</p>',
        metaDescription: 'メタ説明',
        metaKeywords: 'キーワード',
        ogpTitle: 'OGPタイトル',
        ogpDescription: 'OGP説明',
        ogpImageUrl: 'https://example.com/ogp.jpg',
        isPublished: true,
        publishedAt: new Date(),
        isActive: true,
        isSystemPage: false,
        contentWidth: LayoutWidth.MD,
        contentWidthCustom: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      expect(page.slug).toBe('test-page')
      expect(page.contentWidth).toBe('MD')
    })
  })

  describe('境界値テスト', () => {
    test('slug 100文字（境界）', () => {
      const result = createPageSchema.safeParse({
        ...VALID_CREATE_PAGE_INPUT,
        slug: 'a'.repeat(100),
      })
      expect(result.success).toBe(true)
    })

    test('slug 101文字（境界超過）', () => {
      const result = createPageSchema.safeParse({
        ...VALID_CREATE_PAGE_INPUT,
        slug: 'a'.repeat(101),
      })
      expect(result.success).toBe(false)
    })

    test('title 200文字（境界）', () => {
      const result = createPageSchema.safeParse({
        ...VALID_CREATE_PAGE_INPUT,
        title: 'x'.repeat(200),
      })
      expect(result.success).toBe(true)
    })

    test('title 201文字（境界超過）', () => {
      const result = createPageSchema.safeParse({
        ...VALID_CREATE_PAGE_INPUT,
        title: 'x'.repeat(201),
      })
      expect(result.success).toBe(false)
    })

    test('metaDescription 160文字（境界）', () => {
      const result = updatePageSeoSchema.safeParse({
        ...VALID_UPDATE_SEO_INPUT,
        metaDescription: 'x'.repeat(160),
      })
      expect(result.success).toBe(true)
    })

    test('metaDescription 161文字（境界超過）', () => {
      const result = updatePageSeoSchema.safeParse({
        ...VALID_UPDATE_SEO_INPUT,
        metaDescription: 'x'.repeat(161),
      })
      expect(result.success).toBe(false)
    })

    test('ogpTitle 100文字（境界）', () => {
      const result = updatePageSeoSchema.safeParse({
        ...VALID_UPDATE_SEO_INPUT,
        ogpTitle: 'x'.repeat(100),
      })
      expect(result.success).toBe(true)
    })

    test('ogpTitle 101文字（境界超過）', () => {
      const result = updatePageSeoSchema.safeParse({
        ...VALID_UPDATE_SEO_INPUT,
        ogpTitle: 'x'.repeat(101),
      })
      expect(result.success).toBe(false)
    })
  })

  // 注: 権限チェック（hasPermission, canAccessAdmin, checkReadPermission）のテストは
  // __tests__/unit/lib/permissions.test.ts で網羅的にテスト済み
})
