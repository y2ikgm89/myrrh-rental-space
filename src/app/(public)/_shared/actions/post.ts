'use server'

/**
 * 投稿記事 公開用Server Actions
 *
 * 認証不要の読み取り専用アクション
 */

import { prisma } from '@/shared/lib/prisma'
import { PostStatus } from '@/shared/generated/prisma/enums'
import { cacheLife, cacheTag } from 'next/cache'
import { CACHE_TAGS } from '@/shared/lib/constants'

// =============================================================================
// Types
// =============================================================================

export type PublicPost = {
  id: string
  title: string
  slug: string
  excerpt: string
  thumbnailUrl: string
  publishedAt: Date
}

export type GetPublishedPostsOptions = {
  take?: number
  orderBy?: 'publishedAt' | 'viewCount'
  categoryId?: string
}

// =============================================================================
// Read Actions
// =============================================================================

/**
 * 公開済み投稿記事一覧を取得（認証不要・キャッシュ付き）
 * ホームページや公開一覧ページで使用
 */
export async function getPublishedPosts(
  options: GetPublishedPostsOptions = {}
): Promise<PublicPost[]> {
  'use cache'
  cacheLife('minutes')
  cacheTag(CACHE_TAGS.POSTS)

  const { take = 3, orderBy = 'publishedAt', categoryId } = options

  const posts = await prisma.post.findMany({
    where: {
      status: PostStatus.PUBLISHED,
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
