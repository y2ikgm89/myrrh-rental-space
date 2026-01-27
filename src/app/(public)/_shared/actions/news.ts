'use server'

/**
 * お知らせ 公開用Server Actions
 *
 * 認証不要の読み取り専用アクション
 */

import { prisma } from '@/shared/lib/prisma'
import { cacheLife, cacheTag } from 'next/cache'
import { CACHE_TAGS } from '@/shared/lib/constants'

// =============================================================================
// Types
// =============================================================================

export type PublicNews = {
  id: string
  slug: string
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
 * 公開済みお知らせ一覧を取得（認証不要・キャッシュ付き）
 * ホームページや公開一覧ページで使用
 */
export async function getPublishedNewsList(
  options: GetPublishedNewsListOptions = {}
): Promise<PublicNews[]> {
  'use cache'
  cacheLife('minutes')
  cacheTag(CACHE_TAGS.NEWS)

  const { take = 5 } = options

  const newsItems = await prisma.news.findMany({
    where: {
      isPublished: true,
      publishedAt: { not: null },
    },
    select: {
      id: true,
      slug: true,
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

// =============================================================================
// Detail Types
// =============================================================================

export type NewsDetail = {
  id: string
  slug: string
  title: string
  content: string
  isPublished: boolean
  publishedAt: Date | null
  createdAt: Date
  updatedAt: Date
  // SEO/OGP
  metaDescription: string | null
  metaKeywords: string | null
  ogpTitle: string | null
  ogpDescription: string | null
  ogpImageUrl: string | null
}

/**
 * スラッグでお知らせを取得（公開ページ用・キャッシュ付き）
 */
export async function getNewsBySlug(slug: string): Promise<NewsDetail | null> {
  'use cache'
  cacheLife('minutes')
  cacheTag(CACHE_TAGS.NEWS, `${CACHE_TAGS.NEWS}-slug-${slug}`)

  const news = await prisma.news.findUnique({
    where: {
      slug,
      isPublished: true,
      publishedAt: { not: null },
    },
  })

  if (!news || !news.publishedAt || news.publishedAt > new Date()) {
    return null
  }

  return news
}

/**
 * 全公開ニュースのスラッグ一覧を取得（静的生成用）
 */
export async function getAllPublishedNewsSlugs(): Promise<string[]> {
  'use cache'
  cacheLife('minutes')
  cacheTag(CACHE_TAGS.NEWS)

  const news = await prisma.news.findMany({
    where: {
      isPublished: true,
      publishedAt: { not: null },
    },
    select: { slug: true },
    take: 100,
  })

  return news.map((n) => n.slug)
}
