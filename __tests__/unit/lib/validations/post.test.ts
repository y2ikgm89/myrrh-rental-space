import { describe, test, expect } from 'bun:test'
import {
  createPostSchema,
  updatePostSchema,
  postFormSchema,
  postCategorySchema,
  postTagSchema,
} from '@/admin/lib/validations/post'
import { LayoutWidth } from '@/shared/types/prisma'
import { PostStatus } from '@/shared/generated/prisma/enums'

// 有効なLexical EditorState JSON（lexicalJsonSchema準拠）
const VALID_LEXICAL_JSON = '{"root":{"children":[],"direction":null,"format":"","indent":0,"type":"root","version":1}}'

describe('createPostSchema', () => {
  const validBaseData = {
    title: '投稿記事タイトル',
    slug: 'sample-post',
    excerpt: '記事の抜粋です',
    contentJson: '',
    thumbnailUrl: 'https://example.com/image.jpg',
    categoryId: '123e4567-e89b-12d3-a456-426614174000',
    tags: ['123e4567-e89b-12d3-a456-426614174001', '123e4567-e89b-12d3-a456-426614174002'],
  }

  test('有効なデータでバリデーションに成功する', () => {
    const result = createPostSchema.safeParse(validBaseData)
    expect(result.success).toBe(true)
  })

  test('タイトルが空の場合にエラー', () => {
    const invalidData = { ...validBaseData, title: '' }
    const result = createPostSchema.safeParse(invalidData)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('タイトルは必須です')
    }
  })

  test('タイトルの最大長を超える場合にエラー', () => {
    const invalidData = { ...validBaseData, title: 'あ'.repeat(201) }
    const result = createPostSchema.safeParse(invalidData)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('200文字以内')
    }
  })

  test('スラッグが空の場合にエラー', () => {
    const invalidData = { ...validBaseData, slug: '' }
    const result = createPostSchema.safeParse(invalidData)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('スラッグは必須です')
    }
  })

  test('スラッグに大文字を含む場合にエラー', () => {
    const invalidData = { ...validBaseData, slug: 'Sample-Post' }
    const result = createPostSchema.safeParse(invalidData)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('小文字英数字')
    }
  })

  test('スラッグにアンダースコアを含む場合にエラー', () => {
    const invalidData = { ...validBaseData, slug: 'sample_post' }
    const result = createPostSchema.safeParse(invalidData)
    expect(result.success).toBe(false)
  })

  test('抜粋が空の場合にエラー', () => {
    const invalidData = { ...validBaseData, excerpt: '' }
    const result = createPostSchema.safeParse(invalidData)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('抜粋は必須です')
    }
  })

  test('抜粋の最大長を超える場合にエラー', () => {
    const invalidData = { ...validBaseData, excerpt: 'あ'.repeat(501) }
    const result = createPostSchema.safeParse(invalidData)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('500文字以内')
    }
  })

  test('サムネイルURLが空の場合にエラー', () => {
    const invalidData = { ...validBaseData, thumbnailUrl: '' }
    const result = createPostSchema.safeParse(invalidData)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('サムネイルURLは必須です')
    }
  })

  test('無効なカテゴリIDの場合にエラー', () => {
    const invalidData = { ...validBaseData, categoryId: 'invalid-uuid' }
    const result = createPostSchema.safeParse(invalidData)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('カテゴリを選択してください')
    }
  })

  test('tagsフィールドはデフォルトで空配列', () => {
    const data = { ...validBaseData }
    delete (data as Record<string, unknown>)['tags']
    const result = createPostSchema.safeParse(data)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.tags).toEqual([])
    }
  })

  test('contentJsonフィールドはデフォルトで空文字列', () => {
    const result = createPostSchema.safeParse(validBaseData)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.contentJson).toBe('')
    }
  })
})

describe('updatePostSchema', () => {
  const validBaseData = {
    title: '投稿記事タイトル',
    slug: 'sample-post',
    excerpt: '記事の抜粋です',
    contentJson: VALID_LEXICAL_JSON,
    thumbnailUrl: 'https://example.com/image.jpg',
    categoryId: '123e4567-e89b-12d3-a456-426614174000',
    tags: ['123e4567-e89b-12d3-a456-426614174001', '123e4567-e89b-12d3-a456-426614174002'],
  }

  test('有効なデータでバリデーションに成功する', () => {
    const result = updatePostSchema.safeParse(validBaseData)
    expect(result.success).toBe(true)
  })

  test('本文が空の場合にエラー', () => {
    const invalidData = { ...validBaseData, contentJson: '' }
    const result = updatePostSchema.safeParse(invalidData)
    expect(result.success).toBe(false)
  })

  test('無効なLexical JSONはエラー', () => {
    const invalidData = { ...validBaseData, contentJson: '<p>記事本文</p>' }
    const result = updatePostSchema.safeParse(invalidData)
    expect(result.success).toBe(false)
  })

  test('contentWidthフィールドを許可', () => {
    const validData = { ...validBaseData, contentWidth: LayoutWidth.LG }
    const result = updatePostSchema.safeParse(validData)
    expect(result.success).toBe(true)
  })

  test('contentWidthにnullを許可', () => {
    const validData = { ...validBaseData, contentWidth: null }
    const result = updatePostSchema.safeParse(validData)
    expect(result.success).toBe(true)
  })

  test('contentWidthCustomの範囲チェック', () => {
    const validData = { ...validBaseData, contentWidthCustom: 1200 }
    const result = updatePostSchema.safeParse(validData)
    expect(result.success).toBe(true)
  })

  test('contentWidthCustomが最小値未満の場合にエラー', () => {
    const invalidData = { ...validBaseData, contentWidthCustom: 319 }
    const result = updatePostSchema.safeParse(invalidData)
    expect(result.success).toBe(false)
  })

  test('contentWidthCustomが最大値超過の場合にエラー', () => {
    const invalidData = { ...validBaseData, contentWidthCustom: 1921 }
    const result = updatePostSchema.safeParse(invalidData)
    expect(result.success).toBe(false)
  })

  test('SEO/OGPフィールドはオプショナル', () => {
    const result = updatePostSchema.safeParse(validBaseData)
    expect(result.success).toBe(true)
  })
})

describe('postFormSchema', () => {
  const validFormData = {
    title: '投稿記事タイトル',
    slug: 'sample-post',
    excerpt: '記事の抜粋です',
    contentJson: VALID_LEXICAL_JSON,
    thumbnailUrl: 'https://example.com/image.jpg',
    categoryId: '123e4567-e89b-12d3-a456-426614174000',
    tags: 'tag1,tag2',
    status: PostStatus.DRAFT,
  }

  test('有効なデータでバリデーションに成功する', () => {
    const result = postFormSchema.safeParse(validFormData)
    expect(result.success).toBe(true)
  })

  test('statusフィールドは必須', () => {
    const invalidData = { ...validFormData }
    delete (invalidData as Record<string, unknown>)['status']
    const result = postFormSchema.safeParse(invalidData)
    expect(result.success).toBe(false)
  })

  test('すべてのPostStatus値を許可', () => {
    const statuses = [PostStatus.DRAFT, PostStatus.PUBLISHED, PostStatus.ARCHIVED]
    statuses.forEach((status) => {
      const data = { ...validFormData, status }
      const result = postFormSchema.safeParse(data)
      expect(result.success).toBe(true)
    })
  })

  test('tagsフィールドは文字列として受け取る', () => {
    const data = { ...validFormData, tags: 'tag1,tag2,tag3' }
    const result = postFormSchema.safeParse(data)
    expect(result.success).toBe(true)
  })

  test('publishedAtフィールドはオプショナル', () => {
    const result = postFormSchema.safeParse(validFormData)
    expect(result.success).toBe(true)
  })

  test('contentWidthフィールドは文字列として受け取る', () => {
    const data = { ...validFormData, contentWidth: 'LG' }
    const result = postFormSchema.safeParse(data)
    expect(result.success).toBe(true)
  })
})

describe('postCategorySchema', () => {
  const validCategoryData = {
    name: 'お知らせ',
    slug: 'news',
    description: 'お知らせカテゴリ',
    order: 0,
  }

  test('有効なデータでバリデーションに成功する', () => {
    const result = postCategorySchema.safeParse(validCategoryData)
    expect(result.success).toBe(true)
  })

  test('カテゴリ名が空の場合にエラー', () => {
    const invalidData = { ...validCategoryData, name: '' }
    const result = postCategorySchema.safeParse(invalidData)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('カテゴリ名は必須です')
    }
  })

  test('カテゴリ名の最大長を超える場合にエラー', () => {
    const invalidData = { ...validCategoryData, name: 'あ'.repeat(51) }
    const result = postCategorySchema.safeParse(invalidData)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('50文字以内')
    }
  })

  test('スラッグに大文字を含む場合にエラー', () => {
    const invalidData = { ...validCategoryData, slug: 'News' }
    const result = postCategorySchema.safeParse(invalidData)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('小文字英数字')
    }
  })

  test('説明の最大長を超える場合にエラー', () => {
    const invalidData = { ...validCategoryData, description: 'あ'.repeat(501) }
    const result = postCategorySchema.safeParse(invalidData)
    expect(result.success).toBe(false)
  })

  test('orderフィールドはデフォルトで0', () => {
    const data = { ...validCategoryData }
    delete (data as Record<string, unknown>)['order']
    const result = postCategorySchema.safeParse(data)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.order).toBe(0)
    }
  })

  test('orderフィールドは負の値を許可しない', () => {
    const invalidData = { ...validCategoryData, order: -1 }
    const result = postCategorySchema.safeParse(invalidData)
    expect(result.success).toBe(false)
  })

  test('SEOフィールドはオプショナルでnullを許可', () => {
    const validData = {
      ...validCategoryData,
      metaTitle: null,
      metaDescription: null,
      ogpImageUrl: null,
    }
    const result = postCategorySchema.safeParse(validData)
    expect(result.success).toBe(true)
  })

  test('ogpImageUrlに空文字列を許可', () => {
    const validData = { ...validCategoryData, ogpImageUrl: '' }
    const result = postCategorySchema.safeParse(validData)
    expect(result.success).toBe(true)
  })
})

describe('postTagSchema', () => {
  const validTagData = {
    name: '新着',
    slug: 'new',
    description: '新着タグ',
  }

  test('有効なデータでバリデーションに成功する', () => {
    const result = postTagSchema.safeParse(validTagData)
    expect(result.success).toBe(true)
  })

  test('タグ名が空の場合にエラー', () => {
    const invalidData = { ...validTagData, name: '' }
    const result = postTagSchema.safeParse(invalidData)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('タグ名は必須です')
    }
  })

  test('タグ名の最大長を超える場合にエラー', () => {
    const invalidData = { ...validTagData, name: 'あ'.repeat(51) }
    const result = postTagSchema.safeParse(invalidData)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('50文字以内')
    }
  })

  test('スラッグに大文字を含む場合にエラー', () => {
    const invalidData = { ...validTagData, slug: 'New' }
    const result = postTagSchema.safeParse(invalidData)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('小文字英数字')
    }
  })

  test('説明の最大長を超える場合にエラー', () => {
    const invalidData = { ...validTagData, description: 'あ'.repeat(501) }
    const result = postTagSchema.safeParse(invalidData)
    expect(result.success).toBe(false)
  })

  test('SEOフィールドはオプショナルでnullを許可', () => {
    const validData = {
      ...validTagData,
      metaTitle: null,
      metaDescription: null,
      ogpImageUrl: null,
    }
    const result = postTagSchema.safeParse(validData)
    expect(result.success).toBe(true)
  })

  test('ogpImageUrlに空文字列を許可', () => {
    const validData = { ...validTagData, ogpImageUrl: '' }
    const result = postTagSchema.safeParse(validData)
    expect(result.success).toBe(true)
  })
})
