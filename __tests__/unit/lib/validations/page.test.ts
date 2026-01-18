/**
 * ページバリデーションテスト
 *
 * src/lib/validations/page.ts のユニットテスト
 */

import { describe, test, expect } from 'bun:test'
import {
  updatePageSeoSchema,
  updatePageSchema,
  createPageSchema,
  getSystemPageDefinition,
  isSystemPageSlug,
  canDeletePage,
  SYSTEM_PAGES,
  SYSTEM_PAGE_SLUGS,
} from '@/shared/lib/validations/page'

// 有効なSEO更新データ
const VALID_SEO_INPUT = {
  title: 'テストページタイトル',
  metaDescription: 'これはテストページのメタディスクリプションです。',
  metaKeywords: 'テスト, キーワード',
  ogpTitle: 'OGPタイトル',
  ogpDescription: 'OGP説明文',
  ogpImageUrl: 'https://example.com/ogp.jpg',
}

// 有効なページ更新データ
const VALID_PAGE_INPUT = {
  title: 'テストページタイトル',
  description: 'ページの説明',
  content: 'これはテストコンテンツです。',
  metaDescription: 'メタディスクリプション',
  metaKeywords: 'キーワード',
  ogpTitle: 'OGPタイトル',
  ogpDescription: 'OGP説明',
  ogpImageUrl: 'https://example.com/ogp.jpg',
  isPublished: true,
}

// 有効なページ作成データ
const VALID_CREATE_PAGE_INPUT = {
  slug: 'test-page',
  title: 'テストページ',
  description: 'テストページの説明',
  isPublished: false,
}

describe('updatePageSeoSchema', () => {
  describe('正常系', () => {
    test('有効なデータは検証を通過', () => {
      const result = updatePageSeoSchema.safeParse(VALID_SEO_INPUT)
      expect(result.success).toBe(true)
    })

    test('オプショナルフィールドを省略可能', () => {
      const result = updatePageSeoSchema.safeParse({
        title: 'タイトル',
      })
      expect(result.success).toBe(true)
    })

    test('ogpImageUrlが空文字でも許可', () => {
      const result = updatePageSeoSchema.safeParse({
        ...VALID_SEO_INPUT,
        ogpImageUrl: '',
      })
      expect(result.success).toBe(true)
    })
  })

  describe('title', () => {
    test('空文字はエラー', () => {
      const result = updatePageSeoSchema.safeParse({
        ...VALID_SEO_INPUT,
        title: '',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('必須')
      }
    })

    test('200文字超過はエラー', () => {
      const result = updatePageSeoSchema.safeParse({
        ...VALID_SEO_INPUT,
        title: 'あ'.repeat(201),
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('200文字以内')
      }
    })
  })

  describe('metaDescription', () => {
    test('160文字超過はエラー', () => {
      const result = updatePageSeoSchema.safeParse({
        ...VALID_SEO_INPUT,
        metaDescription: 'あ'.repeat(161),
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('160文字以内')
      }
    })

    test('160文字ちょうどは許可', () => {
      const result = updatePageSeoSchema.safeParse({
        ...VALID_SEO_INPUT,
        metaDescription: 'あ'.repeat(160),
      })
      expect(result.success).toBe(true)
    })
  })

  describe('metaKeywords', () => {
    test('200文字超過はエラー', () => {
      const result = updatePageSeoSchema.safeParse({
        ...VALID_SEO_INPUT,
        metaKeywords: 'あ'.repeat(201),
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('200文字以内')
      }
    })
  })

  describe('ogpTitle', () => {
    test('100文字超過はエラー', () => {
      const result = updatePageSeoSchema.safeParse({
        ...VALID_SEO_INPUT,
        ogpTitle: 'あ'.repeat(101),
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('100文字以内')
      }
    })
  })

  describe('ogpDescription', () => {
    test('200文字超過はエラー', () => {
      const result = updatePageSeoSchema.safeParse({
        ...VALID_SEO_INPUT,
        ogpDescription: 'あ'.repeat(201),
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('200文字以内')
      }
    })
  })

  describe('ogpImageUrl', () => {
    test('無効なURLはエラー', () => {
      const result = updatePageSeoSchema.safeParse({
        ...VALID_SEO_INPUT,
        ogpImageUrl: 'invalid-url',
      })
      expect(result.success).toBe(false)
    })

    test('有効なURLは許可', () => {
      const result = updatePageSeoSchema.safeParse({
        ...VALID_SEO_INPUT,
        ogpImageUrl: 'https://example.com/image.jpg',
      })
      expect(result.success).toBe(true)
    })
  })
})

describe('updatePageSchema', () => {
  describe('正常系', () => {
    test('有効なデータは検証を通過', () => {
      const result = updatePageSchema.safeParse(VALID_PAGE_INPUT)
      expect(result.success).toBe(true)
    })
  })

  describe('title', () => {
    test('空文字はエラー', () => {
      const result = updatePageSchema.safeParse({
        ...VALID_PAGE_INPUT,
        title: '',
      })
      expect(result.success).toBe(false)
    })

    test('200文字超過はエラー', () => {
      const result = updatePageSchema.safeParse({
        ...VALID_PAGE_INPUT,
        title: 'あ'.repeat(201),
      })
      expect(result.success).toBe(false)
    })
  })

  describe('description', () => {
    test('500文字超過はエラー', () => {
      const result = updatePageSchema.safeParse({
        ...VALID_PAGE_INPUT,
        description: 'あ'.repeat(501),
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('500文字以内')
      }
    })
  })

  describe('content', () => {
    test('空文字はエラー', () => {
      const result = updatePageSchema.safeParse({
        ...VALID_PAGE_INPUT,
        content: '',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('必須')
      }
    })

    test('500000文字超過はエラー', () => {
      const result = updatePageSchema.safeParse({
        ...VALID_PAGE_INPUT,
        content: 'あ'.repeat(500001),
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('500,000文字以内')
      }
    })
  })

  describe('isPublished', () => {
    test('デフォルトはtrue', () => {
      const { isPublished, ...withoutIsPublished } = VALID_PAGE_INPUT
      const result = updatePageSchema.safeParse(withoutIsPublished)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.isPublished).toBe(true)
      }
    })
  })

  describe('contentWidthCustom', () => {
    test('319はエラー', () => {
      const result = updatePageSchema.safeParse({
        ...VALID_PAGE_INPUT,
        contentWidthCustom: 319,
      })
      expect(result.success).toBe(false)
    })

    test('1921はエラー', () => {
      const result = updatePageSchema.safeParse({
        ...VALID_PAGE_INPUT,
        contentWidthCustom: 1921,
      })
      expect(result.success).toBe(false)
    })

    test('320-1920は許可', () => {
      for (const value of [320, 1024, 1920]) {
        const result = updatePageSchema.safeParse({
          ...VALID_PAGE_INPUT,
          contentWidthCustom: value,
        })
        expect(result.success).toBe(true)
      }
    })
  })
})

describe('createPageSchema', () => {
  describe('正常系', () => {
    test('有効なデータは検証を通過', () => {
      const result = createPageSchema.safeParse(VALID_CREATE_PAGE_INPUT)
      expect(result.success).toBe(true)
    })

    test('デフォルト値が適用される', () => {
      const result = createPageSchema.safeParse({
        slug: 'test',
        title: 'テスト',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.isPublished).toBe(false)
      }
    })
  })

  describe('slug', () => {
    test('空文字はエラー', () => {
      const result = createPageSchema.safeParse({
        ...VALID_CREATE_PAGE_INPUT,
        slug: '',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('必須')
      }
    })

    test('100文字超過はエラー', () => {
      const result = createPageSchema.safeParse({
        ...VALID_CREATE_PAGE_INPUT,
        slug: 'a'.repeat(101),
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('100文字以内')
      }
    })

    test('無効なスラッグ形式はエラー', () => {
      const invalidSlugs = [
        'Test', // 大文字
        'test_page', // アンダースコア
        'test page', // スペース
        'テスト', // 日本語
        '-test', // ハイフン始まり
        'test-', // ハイフン終わり
        'test--page', // 連続ハイフン
      ]

      for (const slug of invalidSlugs) {
        const result = createPageSchema.safeParse({
          ...VALID_CREATE_PAGE_INPUT,
          slug,
        })
        expect(result.success).toBe(false)
      }
    })

    test('有効なスラッグ形式は許可', () => {
      const validSlugs = ['test', 'test-page', 'test-page-123', 'a1b2c3']

      for (const slug of validSlugs) {
        const result = createPageSchema.safeParse({
          ...VALID_CREATE_PAGE_INPUT,
          slug,
        })
        expect(result.success).toBe(true)
      }
    })
  })

  describe('title', () => {
    test('空文字はエラー', () => {
      const result = createPageSchema.safeParse({
        ...VALID_CREATE_PAGE_INPUT,
        title: '',
      })
      expect(result.success).toBe(false)
    })

    test('200文字超過はエラー', () => {
      const result = createPageSchema.safeParse({
        ...VALID_CREATE_PAGE_INPUT,
        title: 'あ'.repeat(201),
      })
      expect(result.success).toBe(false)
    })
  })

  describe('description', () => {
    test('500文字超過はエラー', () => {
      const result = createPageSchema.safeParse({
        ...VALID_CREATE_PAGE_INPUT,
        description: 'あ'.repeat(501),
      })
      expect(result.success).toBe(false)
    })
  })
})

describe('SYSTEM_PAGES', () => {
  test('システムページが正しく定義されている', () => {
    expect(SYSTEM_PAGES.length).toBe(9)

    const slugs = SYSTEM_PAGES.map((p) => p.slug)
    expect(slugs).toContain('privacy')
    expect(slugs).toContain('terms')
    expect(slugs).toContain('about')
    expect(slugs).toContain('faq')
    expect(slugs).toContain('reservation')
    expect(slugs).toContain('spaces')
    expect(slugs).toContain('contact')
    expect(slugs).toContain('blog')
    expect(slugs).toContain('news')
  })

  test('コンテンツ編集可能ページが正しく設定されている', () => {
    const editablePages = SYSTEM_PAGES.filter((p) => p.isContentEditable)
    expect(editablePages.map((p) => p.slug).sort()).toEqual(
      ['about', 'faq', 'privacy', 'terms'].sort()
    )
  })
})

describe('SYSTEM_PAGE_SLUGS', () => {
  test('システムページスラッグの配列が正しい', () => {
    expect(SYSTEM_PAGE_SLUGS).toEqual(SYSTEM_PAGES.map((p) => p.slug))
  })
})

describe('getSystemPageDefinition', () => {
  test('存在するスラッグは定義を返す', () => {
    const result = getSystemPageDefinition('privacy')
    expect(result).toBeDefined()
    expect(result?.slug).toBe('privacy')
    expect(result?.title).toBe('プライバシーポリシー')
  })

  test('存在しないスラッグはundefinedを返す', () => {
    const result = getSystemPageDefinition('non-existent')
    expect(result).toBeUndefined()
  })
})

describe('isSystemPageSlug', () => {
  test('システムページスラッグはtrue', () => {
    expect(isSystemPageSlug('privacy')).toBe(true)
    expect(isSystemPageSlug('terms')).toBe(true)
    expect(isSystemPageSlug('reservation')).toBe(true)
  })

  test('システムページ以外はfalse', () => {
    expect(isSystemPageSlug('custom-page')).toBe(false)
    expect(isSystemPageSlug('')).toBe(false)
  })
})

describe('canDeletePage', () => {
  test('システムページは削除不可', () => {
    expect(canDeletePage('privacy')).toBe(false)
    expect(canDeletePage('terms')).toBe(false)
    expect(canDeletePage('blog')).toBe(false)
  })

  test('カスタムページは削除可能', () => {
    expect(canDeletePage('custom-page')).toBe(true)
    expect(canDeletePage('my-page')).toBe(true)
  })
})
