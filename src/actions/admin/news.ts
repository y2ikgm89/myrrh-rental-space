'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createSuccess, createFailure, type NewsWhereInput, withAuth } from '@/types'
import { determinePublishedAt } from '@/lib/utils'
import { requireAdmin } from '@/lib/auth'

// =============================================================================
// Types
// =============================================================================

export type NewsData = {
  id: string
  title: string
  content: string
  publishedAt: Date | null
  isPublished: boolean
  createdAt: Date
  updatedAt: Date
}

export type GetNewsListResult = {
  news: NewsData[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export type NewsFilters = {
  status?: 'ALL' | 'PUBLISHED' | 'DRAFT'
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

const newsSchema = z.object({
  title: z.string().min(1, 'タイトルは必須です').max(200, 'タイトルは200文字以内で入力してください'),
  content: z.string().min(1, '本文は必須です'),
  isPublished: z.boolean(),
  publishedAt: z.string().nullable().optional(),
})

export type NewsInput = z.infer<typeof newsSchema>

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
  await requireAdmin()

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
  await requireAdmin()

  return prisma.news.findUnique({
    where: { id },
  })
}

/**
 * お知らせを作成
 */
export const createNews = withAuth(async (_user, data: NewsInput) => {
  const parsed = newsSchema.safeParse(data)
  if (!parsed.success) {
    return createFailure(parsed.error.issues[0].message)
  }

  const { title, content, isPublished, publishedAt } = parsed.data

  const news = await prisma.news.create({
    data: {
      title,
      content,
      isPublished,
      publishedAt: determinePublishedAt(publishedAt, isPublished),
    },
  })

  revalidatePath('/admin/news')
  revalidatePath('/news')

  return createSuccess('お知らせを作成しました', { id: news.id })
})

/**
 * お知らせを更新
 */
export const updateNews = withAuth(async (_user, id: string, data: NewsInput) => {
  const parsed = newsSchema.safeParse(data)
  if (!parsed.success) {
    return createFailure(parsed.error.issues[0].message)
  }

  const existingNews = await prisma.news.findUnique({
    where: { id },
  })

  if (!existingNews) {
    return createFailure('お知らせが見つかりません')
  }

  const { title, content, isPublished, publishedAt } = parsed.data

  await prisma.news.update({
    where: { id },
    data: {
      title,
      content,
      isPublished,
      publishedAt: determinePublishedAt(publishedAt, isPublished, existingNews.publishedAt),
    },
  })

  revalidatePath('/admin/news')
  revalidatePath(`/admin/news/${id}`)
  revalidatePath('/news')
  revalidatePath(`/news/${id}`)

  return createSuccess('お知らせを更新しました')
})

/**
 * お知らせを削除
 */
export const deleteNews = withAuth(async (_user, id: string) => {
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
 * 公開状態を切り替え
 */
export const toggleNewsPublish = withAuth(async (_user, id: string) => {
  const news = await prisma.news.findUnique({
    where: { id },
  })

  if (!news) {
    return createFailure('お知らせが見つかりません')
  }

  const newIsPublished = !news.isPublished

  await prisma.news.update({
    where: { id },
    data: {
      isPublished: newIsPublished,
      publishedAt: newIsPublished && !news.publishedAt ? new Date() : news.publishedAt,
    },
  })

  revalidatePath('/admin/news')
  revalidatePath(`/admin/news/${id}`)
  revalidatePath('/news')

  return createSuccess('公開状態を変更しました')
})
