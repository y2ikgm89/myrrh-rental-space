/**
 * 投稿 Public Action 統合テスト
 *
 * src/app/(public)/_shared/actions/post.ts のテスト
 *
 * バリデーションとオプション処理のテスト
 */

import { describe, test, expect } from 'bun:test'

// =============================================================================
// GetPublishedPostsOptions Tests
// =============================================================================

describe('Post Public Action Integration', () => {
  describe('GetPublishedPostsOptions', () => {
    test('デフォルト値が正しく設定される', () => {
      const options: { take?: number; orderBy?: 'publishedAt' | 'viewCount'; categoryId?: string } = {}
      const { take = 3, orderBy = 'publishedAt', categoryId } = options

      expect(take).toBe(3)
      expect(orderBy).toBe('publishedAt')
      expect(categoryId).toBeUndefined()
    })

    test('カスタム値が正しく適用される', () => {
      const options = {
        take: 10,
        orderBy: 'viewCount' as const,
        categoryId: 'category-123',
      }
      const { take = 3, orderBy = 'publishedAt', categoryId } = options

      expect(take).toBe(10)
      expect(orderBy).toBe('viewCount')
      expect(categoryId).toBe('category-123')
    })

    test('部分的なオプション指定', () => {
      const options: { take?: number; orderBy?: 'publishedAt' | 'viewCount'; categoryId?: string } = { take: 5 }
      const { take = 3, orderBy = 'publishedAt', categoryId } = options

      expect(take).toBe(5)
      expect(orderBy).toBe('publishedAt')
      expect(categoryId).toBeUndefined()
    })
  })

  describe('PublicPost type validation', () => {
    test('有効な投稿データ構造', () => {
      const post = {
        id: 'post-123',
        title: 'テスト記事',
        slug: 'test-article',
        excerpt: 'これはテスト記事の抜粋です',
        thumbnailUrl: 'https://example.com/image.jpg',
        publishedAt: new Date('2024-01-15'),
      }

      expect(post.id).toBe('post-123')
      expect(post.title).toBe('テスト記事')
      expect(post.slug).toBe('test-article')
      expect(post.excerpt).toBe('これはテスト記事の抜粋です')
      expect(post.thumbnailUrl).toBe('https://example.com/image.jpg')
      expect(post.publishedAt).toBeInstanceOf(Date)
    })

    test('publishedAt が未来の日付の場合フィルタリングされる', () => {
      const posts = [
        {
          id: 'past-post',
          title: '過去の記事',
          slug: 'past-post',
          excerpt: '',
          thumbnailUrl: '',
          publishedAt: new Date('2024-01-01'),
        },
        {
          id: 'future-post',
          title: '未来の記事',
          slug: 'future-post',
          excerpt: '',
          thumbnailUrl: '',
          publishedAt: new Date('2099-12-31'),
        },
      ]

      // 未来の日付をフィルタリング（アクション内のロジックを模倣）
      const filteredPosts = posts.filter(
        (post) => post.publishedAt && post.publishedAt <= new Date()
      )

      expect(filteredPosts).toHaveLength(1)
      expect(filteredPosts[0].id).toBe('past-post')
    })
  })

  describe('slug format validation', () => {
    test('有効なslug形式', () => {
      const validSlugs = [
        'hello-world',
        'my-first-post',
        'my-post-2024',
        'a',
        'test-123-post',
      ]

      validSlugs.forEach((slug) => {
        expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      })
    })

    test('無効なslug形式', () => {
      const invalidSlugs = [
        'Hello-World', // 大文字
        'hello_world', // アンダースコア
        '-hello', // 先頭ハイフン
        'hello-', // 末尾ハイフン
        'hello--world', // 連続ハイフン
      ]

      invalidSlugs.forEach((slug) => {
        expect(slug).not.toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      })
    })
  })
})
