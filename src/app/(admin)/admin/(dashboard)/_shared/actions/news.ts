'use server'

import { prisma } from '@/shared/lib/prisma'
import { revalidateTag } from 'next/cache'
import { CACHE_TAGS, getCacheTag } from '@/shared/lib/constants'
import { createSuccess, createFailure, withPermission } from '@/admin/types/server-actions'
import type { NewsWhereInput } from '@/shared/types/prisma'
import { checkReadPermissionFor } from '@/admin/lib/permissions'

// Types and schemas from centralized validation file
import {
  createNewsSchema,
  updateNewsSchema,
  type NewsData,
  type NewsVersionData,
  type GetNewsListResult,
  type NewsFilters,
  type NewsPagination,
  type CreateNewsInput,
  type UpdateNewsInput,
} from '@/admin/lib/validations/news'

// Re-export types for consumers
export type {
  NewsData,
  NewsVersionData,
  GetNewsListResult,
  NewsFilters,
  NewsPagination,
  CreateNewsInput,
  UpdateNewsInput,
} from '@/admin/lib/validations/news'

// =============================================================================
// Helper Functions
// =============================================================================

const checkReadPermission = checkReadPermissionFor('news')

// =============================================================================
// Actions
// =============================================================================

/**
 * お知らせ一覧を取得
 */
export async function getNewsList(
  filters: NewsFilters = {},
  pagination: NewsPagination = {}
): Promise<GetNewsListResult> {
  const hasPermission = await checkReadPermission()
  if (!hasPermission) {
    return { news: [], total: 0, page: 1, limit: 10, totalPages: 0 }
  }

  const { status, search } = filters

  const {
    page = 1,
    limit = 10,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = pagination

  // Where条件を構築
  const where: NewsWhereInput = {}

  if (status === 'PUBLISHED') {
    where.isPublished = true
  } else if (status === 'DRAFT') {
    where.isPublished = false
  }

  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { content: { contains: search, mode: 'insensitive' } },
    ]
  }

  // 総件数とお知らせ一覧を並列取得（N+1解消）
  const [total, news] = await prisma.$transaction([
    prisma.news.count({ where }),
    prisma.news.findMany({
      where,
      orderBy: {
        [sortBy]: sortOrder,
      },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ])

  return {
    news,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  }
}

/**
 * お知らせ詳細を取得
 */
export async function getNewsById(id: string): Promise<NewsData | null> {
  const hasPermission = await checkReadPermission()
  if (!hasPermission) {
    return null
  }

  const news = await prisma.news.findUnique({
    where: { id },
  })

  if (!news) return null

  return news
}

/**
 * お知らせを作成
 */
export const createNews = withPermission<[CreateNewsInput], { id: string }>(
  'news',
  'create'
)(async (_user, data) => {
  const parsed = createNewsSchema.safeParse(data)
  if (!parsed.success) {
    return createFailure(parsed.error.issues[0].message)
  }

  const { title, content } = parsed.data

  const news = await prisma.news.create({
    data: {
      title,
      content,
      isPublished: false,
    },
  })

  revalidateTag(CACHE_TAGS.NEWS, 'default')

  return createSuccess('お知らせを作成しました', { id: news.id })
})

/**
 * お知らせを更新
 */
export const updateNews = withPermission<[string, UpdateNewsInput], void>(
  'news',
  'update'
)(async (_user, id, data) => {
  const parsed = updateNewsSchema.safeParse(data)
  if (!parsed.success) {
    return createFailure(parsed.error.issues[0].message)
  }

  const existingNews = await prisma.news.findUnique({
    where: { id },
  })

  if (!existingNews) {
    return createFailure('お知らせが見つかりません')
  }

  const {
    title,
    content,
    contentWidth,
    contentWidthCustom,
    metaDescription,
    metaKeywords,
    ogpTitle,
    ogpDescription,
    ogpImageUrl,
  } = parsed.data

  await prisma.news.update({
    where: { id },
    data: {
      title,
      content,
      contentWidth: contentWidth ?? null,
      contentWidthCustom: contentWidthCustom ?? null,
      // SEO フィールド
      metaDescription: metaDescription ?? null,
      metaKeywords: metaKeywords ?? null,
      // OGP フィールド
      ogpTitle: ogpTitle ?? null,
      ogpDescription: ogpDescription ?? null,
      ogpImageUrl: ogpImageUrl ?? null,
    },
  })

  revalidateTag(CACHE_TAGS.NEWS, 'default')
  revalidateTag(getCacheTag.news.detail(id), 'default')

  return createSuccess('お知らせを保存しました')
})

/**
 * お知らせを削除
 */
export const deleteNews = withPermission<[string], void>(
  'news',
  'delete'
)(async (_user, id) => {
  const news = await prisma.news.findUnique({
    where: { id },
  })

  if (!news) {
    return createFailure('お知らせが見つかりません')
  }

  await prisma.news.delete({
    where: { id },
  })

  revalidateTag(CACHE_TAGS.NEWS, 'default')

  return createSuccess('お知らせを削除しました')
})

/**
 * お知らせを公開（バージョン自動作成）
 */
export const publishNews = withPermission<[string], void>(
  'news',
  'publish'
)(async (user, id) => {
  const news = await prisma.news.findUnique({
    where: { id },
  })

  if (!news) {
    return createFailure('お知らせが見つかりません')
  }

  // 次のバージョン番号を取得
  const latestVersion = await prisma.newsVersion.findFirst({
    where: { newsId: id },
    orderBy: { version: 'desc' },
    select: { version: true },
  })
  const nextVersion = (latestVersion?.version ?? 0) + 1

  // トランザクションで公開 + バージョン作成
  await prisma.$transaction([
    prisma.news.update({
      where: { id },
      data: {
        isPublished: true,
        publishedAt: news.publishedAt ?? new Date(),
      },
    }),
    prisma.newsVersion.create({
      data: {
        newsId: id,
        version: nextVersion,
        content: news.content,
        createdBy: user.id,
      },
    }),
  ])

  revalidateTag(CACHE_TAGS.NEWS, 'default')
  revalidateTag(getCacheTag.news.detail(id), 'default')

  return createSuccess(`公開しました（バージョン ${nextVersion}）`)
})

/**
 * お知らせを非公開（下書きに戻す）
 */
export const unpublishNews = withPermission<[string], void>(
  'news',
  'publish'
)(async (_user, id) => {
  const news = await prisma.news.findUnique({
    where: { id },
  })

  if (!news) {
    return createFailure('お知らせが見つかりません')
  }

  await prisma.news.update({
    where: { id },
    data: {
      isPublished: false,
    },
  })

  revalidateTag(CACHE_TAGS.NEWS, 'default')
  revalidateTag(getCacheTag.news.detail(id), 'default')

  return createSuccess('下書きに戻しました')
})

/**
 * バックアップを作成（バージョン手動作成）
 */
export const createNewsBackup = withPermission<[string], { version: number }>(
  'news',
  'update'
)(async (user, id) => {
  const news = await prisma.news.findUnique({
    where: { id },
  })

  if (!news) {
    return createFailure('お知らせが見つかりません')
  }

  // 次のバージョン番号を取得
  const latestVersion = await prisma.newsVersion.findFirst({
    where: { newsId: id },
    orderBy: { version: 'desc' },
    select: { version: true },
  })
  const nextVersion = (latestVersion?.version ?? 0) + 1

  await prisma.newsVersion.create({
    data: {
      newsId: id,
      version: nextVersion,
      content: news.content,
      createdBy: user.id,
    },
  })

  return createSuccess(`バックアップを作成しました（バージョン ${nextVersion}）`, { version: nextVersion })
})

/**
 * バージョン履歴を取得
 */
export async function getNewsVersions(newsId: string): Promise<NewsVersionData[]> {
  const hasPermission = await checkReadPermission()
  if (!hasPermission) {
    return []
  }

  const versions = await prisma.newsVersion.findMany({
    where: { newsId },
    orderBy: { version: 'desc' },
  })

  return versions
}

/**
 * バージョンを復元
 */
export const restoreNewsVersion = withPermission<[string, number], void>(
  'news',
  'update'
)(async (_user, newsId, version) => {
  const versionData = await prisma.newsVersion.findUnique({
    where: {
      newsId_version: { newsId, version },
    },
  })

  if (!versionData) {
    return createFailure('バージョンが見つかりません')
  }

  await prisma.news.update({
    where: { id: newsId },
    data: {
      content: versionData.content,
      isPublished: false,
    },
  })

  revalidateTag(CACHE_TAGS.NEWS, 'default')
  revalidateTag(getCacheTag.news.detail(newsId), 'default')

  return createSuccess(`バージョン ${version} を復元しました（下書き状態）`)
})

// =============================================================================
// Public Functions (認証不要)
// =============================================================================

export type PublicNews = {
  id: string
  title: string
  publishedAt: Date
}

export type GetPublishedNewsListOptions = {
  take?: number
}

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
      isPublished: true,
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
