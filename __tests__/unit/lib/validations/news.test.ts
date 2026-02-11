import { describe, test, expect } from 'bun:test'
import {
  newsSlugSchema,
  createNewsSchema,
  updateNewsSchema,
  newsFormSchema,
} from '@/admin/lib/validations/news'
import { LayoutWidth } from '@/shared/types/prisma'

describe('newsSlugSchema', () => {
  test('有効なスラッグでバリデーションに成功する', () => {
    const validSlugs = ['news-123', 'my-article', 'test-123-abc']

    validSlugs.forEach((slug) => {
      const result = newsSlugSchema.safeParse(slug)
      expect(result.success).toBe(true)
    })
  })

  test('スラッグが空の場合にエラー', () => {
    const result = newsSlugSchema.safeParse('')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('スラッグを入力してください')
    }
  })

  test('スラッグの最大長を超える場合にエラー', () => {
    const longSlug = 'a'.repeat(101)
    const result = newsSlugSchema.safeParse(longSlug)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('100文字以内')
    }
  })

  test('大文字を含む場合にエラー', () => {
    const result = newsSlugSchema.safeParse('News-Article')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('小文字英数字')
    }
  })

  test('アンダースコアを含む場合にエラー', () => {
    const result = newsSlugSchema.safeParse('news_article')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('小文字英数字')
    }
  })

  test('特殊文字を含む場合にエラー', () => {
    const result = newsSlugSchema.safeParse('news@article')
    expect(result.success).toBe(false)
  })

  test('日本語を含む場合にエラー', () => {
    const result = newsSlugSchema.safeParse('ニュース')
    expect(result.success).toBe(false)
  })
})

describe('createNewsSchema', () => {
  test('有効なデータでバリデーションに成功する', () => {
    const validData = {
      slug: 'sample-news',
      title: 'サンプルニュース',
      content: '',
    }

    const result = createNewsSchema.safeParse(validData)
    expect(result.success).toBe(true)
  })

  test('タイトルが空の場合にエラー', () => {
    const invalidData = {
      slug: 'sample-news',
      title: '',
      content: '',
    }

    const result = createNewsSchema.safeParse(invalidData)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('タイトルは必須です')
    }
  })

  test('タイトルの最大長を超える場合にエラー', () => {
    const invalidData = {
      slug: 'sample-news',
      title: 'あ'.repeat(201),
      content: '',
    }

    const result = createNewsSchema.safeParse(invalidData)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('200文字以内')
    }
  })

  test('contentフィールドはデフォルトで空文字列', () => {
    const data = {
      slug: 'sample-news',
      title: 'サンプルニュース',
    }

    const result = createNewsSchema.safeParse(data)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.content).toBe('')
    }
  })
})

describe('updateNewsSchema', () => {
  test('有効なデータでバリデーションに成功する', () => {
    const validData = {
      slug: 'sample-news',
      title: 'サンプルニュース',
      content: '<p>ニュース本文</p>',
      contentWidth: LayoutWidth.WIDE,
      contentWidthCustom: 1200,
      metaDescription: 'ニュースの概要',
      metaKeywords: 'ニュース, お知らせ',
      ogpTitle: 'OGPタイトル',
      ogpDescription: 'OGP説明',
      ogpImageUrl: 'https://example.com/image.jpg',
    }

    const result = updateNewsSchema.safeParse(validData)
    expect(result.success).toBe(true)
  })

  test('本文が空の場合にエラー', () => {
    const invalidData = {
      slug: 'sample-news',
      title: 'サンプルニュース',
      content: '',
    }

    const result = updateNewsSchema.safeParse(invalidData)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('本文は必須です')
    }
  })

  test('contentWidthにnullを許可', () => {
    const validData = {
      slug: 'sample-news',
      title: 'サンプルニュース',
      content: '<p>本文</p>',
      contentWidth: null,
    }

    const result = updateNewsSchema.safeParse(validData)
    expect(result.success).toBe(true)
  })

  test('contentWidthCustomの範囲チェック', () => {
    const validData = {
      slug: 'sample-news',
      title: 'サンプルニュース',
      content: '<p>本文</p>',
      contentWidthCustom: 1200,
    }

    const result = updateNewsSchema.safeParse(validData)
    expect(result.success).toBe(true)
  })

  test('contentWidthCustomが最小値未満の場合にエラー', () => {
    const invalidData = {
      slug: 'sample-news',
      title: 'サンプルニュース',
      content: '<p>本文</p>',
      contentWidthCustom: 319,
    }

    const result = updateNewsSchema.safeParse(invalidData)
    expect(result.success).toBe(false)
  })

  test('contentWidthCustomが最大値超過の場合にエラー', () => {
    const invalidData = {
      slug: 'sample-news',
      title: 'サンプルニュース',
      content: '<p>本文</p>',
      contentWidthCustom: 1921,
    }

    const result = updateNewsSchema.safeParse(invalidData)
    expect(result.success).toBe(false)
  })

  test('SEO/OGPフィールドはオプショナル', () => {
    const validData = {
      slug: 'sample-news',
      title: 'サンプルニュース',
      content: '<p>本文</p>',
    }

    const result = updateNewsSchema.safeParse(validData)
    expect(result.success).toBe(true)
  })
})

describe('newsFormSchema', () => {
  test('有効なデータでバリデーションに成功する', () => {
    const validData = {
      slug: 'sample-news',
      title: 'サンプルニュース',
      content: '<p>本文</p>',
      isPublished: true,
      publishedAt: '2026-01-01T00:00:00Z',
      contentWidth: 'WIDE',
      contentWidthCustom: '1200',
      metaDescription: 'ニュースの概要',
      metaKeywords: 'ニュース, お知らせ',
      ogpTitle: 'OGPタイトル',
      ogpDescription: 'OGP説明',
      ogpImageUrl: 'https://example.com/image.jpg',
    }

    const result = newsFormSchema.safeParse(validData)
    expect(result.success).toBe(true)
  })

  test('isPublishedフィールドは必須', () => {
    const invalidData = {
      slug: 'sample-news',
      title: 'サンプルニュース',
      content: '<p>本文</p>',
    }

    const result = newsFormSchema.safeParse(invalidData)
    expect(result.success).toBe(false)
  })

  test('publishedAtフィールドはオプショナル', () => {
    const validData = {
      slug: 'sample-news',
      title: 'サンプルニュース',
      content: '<p>本文</p>',
      isPublished: false,
    }

    const result = newsFormSchema.safeParse(validData)
    expect(result.success).toBe(true)
  })

  test('contentWidthフィールドは文字列として受け取る', () => {
    const validData = {
      slug: 'sample-news',
      title: 'サンプルニュース',
      content: '<p>本文</p>',
      isPublished: true,
      contentWidth: 'NARROW',
    }

    const result = newsFormSchema.safeParse(validData)
    expect(result.success).toBe(true)
  })

  test('contentWidthCustomフィールドは文字列として受け取る', () => {
    const validData = {
      slug: 'sample-news',
      title: 'サンプルニュース',
      content: '<p>本文</p>',
      isPublished: true,
      contentWidthCustom: '1200',
    }

    const result = newsFormSchema.safeParse(validData)
    expect(result.success).toBe(true)
  })
})
