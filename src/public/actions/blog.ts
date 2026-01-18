'use server'

/**
 * ブログ 公開用Server Actions
 *
 * 認証不要の読み取り専用アクション
 */

import { prisma } from '@/shared/lib/prisma'
import { BlogPostStatus } from '@/shared/generated/prisma/enums'

// =============================================================================
// Types
// =============================================================================

export type PublicBlogPost = {
  id: string
  title: string
  slug: string
  excerpt: string
  thumbnailUrl: string
  publishedAt: Date
}

export type GetPublishedBlogPostsOptions = {
  take?: number
  orderBy?: 'publishedAt' | 'viewCount'
  categoryId?: string
}

// =============================================================================
// Read Actions
// =============================================================================

/**
 * 公開済みブログ記事一覧を取得（認証不要）
 * ホームページや公開一覧ページで使用
 */
export async function getPublishedBlogPosts(
  options: GetPublishedBlogPostsOptions = {}
): Promise<PublicBlogPost[]> {
  const { take = 3, orderBy = 'publishedAt', categoryId } = options

  const posts = await prisma.blogPost.findMany({
    where: {
      status: BlogPostStatus.PUBLISHED,
      publishedAt: { not: null },
      ...(categoryId && { categoryId }),
    },
    select: {
      id: true,
      title: true,
      slug: true,
      excerpt: true,
      thumbnailUrl: true,
      publishedAt: true,
    },
    orderBy: {
      [orderBy]: 'desc',
    },
    take,
  })

  return posts
    .filter((post) => post.publishedAt && post.publishedAt <= new Date())
    .map((post) => ({
      ...post,
      publishedAt: post.publishedAt!,
    }))
}
