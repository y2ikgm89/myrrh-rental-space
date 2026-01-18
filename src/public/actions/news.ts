'use server'

/**
 * お知らせ 公開用Server Actions
 *
 * 認証不要の読み取り専用アクション
 */

import { prisma } from '@/shared/lib/prisma'
import { NewsStatus } from '@/shared/generated/prisma/enums'

// =============================================================================
// Types
// =============================================================================

export type PublicNews = {
  id: string
  title: string
  publishedAt: Date
}

export type GetPublishedNewsListOptions = {
  take?: number
}

// =============================================================================
// Read Actions
// =============================================================================

/**
 * 公開済みお知らせ一覧を取得（認証不要）
 * ホームページや公開一覧ページで使用
 */
export async function getPublishedNewsList(
  options: GetPublishedNewsListOptions = {}
): Promise<PublicNews[]> {
  const { take = 5 } = options

  const newsItems = await prisma.news.findMany({
    where: {
      status: NewsStatus.PUBLISHED,
      publishedAt: { not: null },
    },
    select: {
      id: true,
      title: true,
      publishedAt: true,
    },
    orderBy: {
      publishedAt: 'desc',
    },
    take,
  })

  return newsItems
    .filter((item) => item.publishedAt && item.publishedAt <= new Date())
    .map((item) => ({
      ...item,
      publishedAt: item.publishedAt!,
    }))
}
