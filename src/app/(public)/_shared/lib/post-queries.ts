/**
 * 投稿記事クエリ関数
 *
 * PostListWidgetの公開ページ表示用
 * キャッシュ戦略: 5分ごとに再検証（revalidate: 300）
 */

import { unstable_cache } from 'next/cache'
import { prisma } from '@/shared/lib/prisma'
import { PostStatus } from '@/shared/generated/prisma/enums'

export interface PostSummary {
  id: string
  slug: string
  title: string
  excerpt: string | null
  thumbnailUrl: string | null
  publishedAt: Date | null
  viewCount: number
  category: {
    id: string
    name: string
    slug: string
  } | null
}

// 共通のselect句
const postSelect = {
  id: true,
  slug: true,
  title: true,
  excerpt: true,
  thumbnailUrl: true,
  publishedAt: true,
  viewCount: true,
  category: {
    select: {
      id: true,
      name: true,
      slug: true,
    },
  },
}

/**
 * 最新記事を取得（キャッシュ付き）
 */
export const getRecentPosts = unstable_cache(
  async (count: number = 5): Promise<PostSummary[]> => {
    const posts = await prisma.post.findMany({
      where: {
        status: PostStatus.PUBLISHED,
        publishedAt: {
          lte: new Date(),
        },
      },
      orderBy: {
        publishedAt: 'desc',
      },
      take: count,
      select: postSelect,
    })

    return posts
  },
  ['posts-recent'],
  { revalidate: 300, tags: ['posts'] }
)

/**
 * 人気記事を取得（キャッシュ付き）
 */
export const getPopularPosts = unstable_cache(
  async (count: number = 5): Promise<PostSummary[]> => {
    const posts = await prisma.post.findMany({
      where: {
        status: PostStatus.PUBLISHED,
        publishedAt: {
          lte: new Date(),
        },
      },
      orderBy: {
        viewCount: 'desc',
      },
      take: count,
      select: postSelect,
    })

    return posts
  },
  ['posts-popular'],
  { revalidate: 300, tags: ['posts'] }
)

/**
 * 関連記事を取得（キャッシュ付き）
 */
export const getRelatedPosts = unstable_cache(
  async (
    categoryId: string | null,
    excludePostId?: string,
    count: number = 5
  ): Promise<PostSummary[]> => {
    if (!categoryId) {
      // カテゴリがない場合は最新記事を返す
      return getRecentPosts(count)
    }

    const posts = await prisma.post.findMany({
      where: {
        status: PostStatus.PUBLISHED,
        publishedAt: {
          lte: new Date(),
        },
        categoryId,
        ...(excludePostId && { id: { not: excludePostId } }),
      },
      orderBy: {
        publishedAt: 'desc',
      },
      take: count,
      select: postSelect,
    })

    // 関連記事が足りない場合は最新記事で補完
    if (posts.length < count) {
      const additionalPosts = await prisma.post.findMany({
        where: {
          status: PostStatus.PUBLISHED,
          publishedAt: {
            lte: new Date(),
          },
          id: {
            notIn: [...posts.map((p) => p.id), ...(excludePostId ? [excludePostId] : [])],
          },
        },
        orderBy: {
          publishedAt: 'desc',
        },
        take: count - posts.length,
        select: postSelect,
      })
      return [...posts, ...additionalPosts]
    }

    return posts
  },
  ['posts-related'],
  { revalidate: 300, tags: ['posts'] }
)
