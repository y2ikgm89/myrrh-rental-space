'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath, revalidateTag } from 'next/cache'
import { z } from 'zod'
import { createSuccess, createFailure, withPermission, type NewsWhereInput } from '@/types'
import { getSession, getRoleFromSession } from '@/lib/auth'
import { LayoutWidth } from '@/types/prisma'
import { NewsStatus } from '@/generated/prisma/client/enums'
import { hasPermission, canAccessAdmin } from '@/lib/permissions'
import { logPermissionDenied } from '@/lib/audit'

// =============================================================================
// Types
// =============================================================================

export type NewsData = {
  id: string
  title: string
  content: string
  status: NewsStatus
  publishedAt: Date | null
  createdAt: Date
  updatedAt: Date
  contentWidth: LayoutWidth | null
  contentWidthCustom: number | null
}

export type NewsVersionData = {
  id: string
  newsId: string
  version: number
  content: string
  createdAt: Date
  createdBy: string | null
}

export type GetNewsListResult = {
  news: NewsData[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export type NewsFilters = {
  status?: 'ALL' | 'PUBLISHED' | 'DRAFT' | 'ARCHIVED'
  search?: string
}

export type NewsPagination = {
  page?: number
  limit?: number
  sortBy?: 'createdAt' | 'publishedAt'
  sortOrder?: 'asc' | 'desc'
}

// =============================================================================
// Schemas
// =============================================================================

const createNewsSchema = z.object({
  title: z.string().min(1, 'タイトルは必須です').max(200, 'タイトルは200文字以内で入力してください'),
  content: z.string().default(''),
})

const updateNewsSchema = z.object({
  title: z.string().min(1, 'タイトルは必須です').max(200, 'タイトルは200文字以内で入力してください'),
  content: z.string().min(1, '本文は必須です'),
  contentWidth: z.nativeEnum(LayoutWidth).nullable().optional(),
  contentWidthCustom: z.number().int().min(320).max(1920).nullable().optional(),
})

export type CreateNewsInput = z.infer<typeof createNewsSchema>
export type UpdateNewsInput = z.infer<typeof updateNewsSchema>

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * 読み取り権限チェック
 */
async function checkReadPermission(): Promise<boolean> {
  const session = await getSession()
  if (!session?.user) return false
  const role = getRoleFromSession(session)
  if (!role) return false
  if (!canAccessAdmin(role)) return false
  if (!hasPermission(role, 'news', 'read')) {
    void logPermissionDenied(session.user.id, 'news', 'read')
    return false
  }
  return true
}

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
    where.status = NewsStatus.PUBLISHED
  } else if (status === 'DRAFT') {
    where.status = NewsStatus.DRAFT
  } else if (status === 'ARCHIVED') {
    where.status = NewsStatus.ARCHIVED
  }

  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { content: { contains: search, mode: 'insensitive' } },
    ]
  }

  // 総件数を取得
  const total = await prisma.news.count({ where })

  // お知らせ一覧を取得
  const news = await prisma.news.findMany({
    where,
    orderBy: {
      [sortBy]: sortOrder,
    },
    skip: (page - 1) * limit,
    take: limit,
  })

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
      status: NewsStatus.DRAFT,
    },
  })

  revalidatePath('/admin/news')
  revalidatePath('/news')
  revalidateTag('news', { expire: 0 })

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

  const { title, content, contentWidth, contentWidthCustom } = parsed.data

  await prisma.news.update({
    where: { id },
    data: {
      title,
      content,
      contentWidth: contentWidth ?? null,
      contentWidthCustom: contentWidthCustom ?? null,
    },
  })

  revalidatePath('/admin/news')
  revalidatePath(`/admin/news/${id}`)
  revalidatePath('/news')
  revalidatePath(`/news/${id}`)
  revalidateTag('news', { expire: 0 })
  revalidateTag(`news-${id}`, { expire: 0 })

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

  revalidatePath('/admin/news')
  revalidatePath('/news')

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
        status: NewsStatus.PUBLISHED,
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

  revalidatePath('/admin/news')
  revalidatePath(`/admin/news/${id}`)
  revalidatePath('/news')
  revalidatePath(`/news/${id}`)
  revalidateTag('news', { expire: 0 })
  revalidateTag(`news-${id}`, { expire: 0 })

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
      status: NewsStatus.DRAFT,
    },
  })

  revalidatePath('/admin/news')
  revalidatePath(`/admin/news/${id}`)
  revalidatePath('/news')

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
      status: NewsStatus.DRAFT,
    },
  })

  revalidatePath('/admin/news')
  revalidatePath(`/admin/news/${newsId}`)
  revalidatePath('/news')
  revalidatePath(`/news/${newsId}`)

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
