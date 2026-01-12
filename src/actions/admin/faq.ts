'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath, revalidateTag } from 'next/cache'
import { createSuccess, createFailure, withAuth } from '@/types'
import { requireAdmin } from '@/lib/auth'
import {
  faqCategoryFormSchema,
  faqItemFormSchema,
  type FaqCategoryFormInput,
  type FaqItemFormInput,
  type FaqCategoryWithItems,
  type FaqItemWithCategory,
} from '@/lib/validations/faq'

// =============================================================================
// Types
// =============================================================================

export type FaqCategoryListResult = {
  categories: FaqCategoryWithItems[]
  total: number
}

export type FaqItemListResult = {
  items: FaqItemWithCategory[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export type FaqItemFilters = {
  categoryId?: string
  search?: string
  isActive?: boolean
}

export type FaqItemPagination = {
  page?: number
  limit?: number
}

// =============================================================================
// FaqCategory Actions
// =============================================================================

/**
 * FAQカテゴリ一覧を取得（アイテム含む）
 */
export async function getFaqCategories(): Promise<FaqCategoryListResult> {
  await requireAdmin()

  const categories = await prisma.faqCategory.findMany({
    include: {
      items: {
        where: { isActive: true },
        orderBy: { order: 'asc' },
      },
    },
    orderBy: { order: 'asc' },
  })

  return {
    categories,
    total: categories.length,
  }
}

/**
 * FAQカテゴリ詳細を取得
 */
export async function getFaqCategoryById(id: string): Promise<FaqCategoryWithItems | null> {
  await requireAdmin()

  return prisma.faqCategory.findUnique({
    where: { id },
    include: {
      items: {
        orderBy: { order: 'asc' },
      },
    },
  })
}

/**
 * FAQカテゴリを作成
 */
export const createFaqCategory = withAuth(async (_user, data: FaqCategoryFormInput) => {
  const parsed = faqCategoryFormSchema.safeParse(data)
  if (!parsed.success) {
    return createFailure(parsed.error.issues[0].message)
  }

  // スラッグの重複チェック
  const existing = await prisma.faqCategory.findUnique({
    where: { slug: parsed.data.slug },
  })

  if (existing) {
    return createFailure('このスラッグは既に使用されています')
  }

  // 最大orderを取得
  const maxOrder = await prisma.faqCategory.aggregate({
    _max: { order: true },
  })

  const category = await prisma.faqCategory.create({
    data: {
      ...parsed.data,
      order: parsed.data.order || (maxOrder._max.order ?? 0) + 1,
    },
  })

  revalidatePath('/admin/faq')
  revalidateTag('faq', { expire: 0 })

  return createSuccess('カテゴリを作成しました', { id: category.id })
})

/**
 * FAQカテゴリを更新
 */
export const updateFaqCategory = withAuth(async (_user, id: string, data: FaqCategoryFormInput) => {
  const parsed = faqCategoryFormSchema.safeParse(data)
  if (!parsed.success) {
    return createFailure(parsed.error.issues[0].message)
  }

  const existing = await prisma.faqCategory.findUnique({
    where: { id },
  })

  if (!existing) {
    return createFailure('カテゴリが見つかりません')
  }

  // スラッグの重複チェック（自分以外）
  const slugExists = await prisma.faqCategory.findFirst({
    where: {
      slug: parsed.data.slug,
      id: { not: id },
    },
  })

  if (slugExists) {
    return createFailure('このスラッグは既に使用されています')
  }

  await prisma.faqCategory.update({
    where: { id },
    data: parsed.data,
  })

  revalidatePath('/admin/faq')
  revalidateTag('faq', { expire: 0 })

  return createSuccess('カテゴリを更新しました')
})

/**
 * FAQカテゴリを削除
 */
export const deleteFaqCategory = withAuth(async (_user, id: string) => {
  const category = await prisma.faqCategory.findUnique({
    where: { id },
    include: { _count: { select: { items: true } } },
  })

  if (!category) {
    return createFailure('カテゴリが見つかりません')
  }

  if (category._count.items > 0) {
    return createFailure('このカテゴリには質問が含まれています。先に質問を削除または移動してください')
  }

  await prisma.faqCategory.delete({
    where: { id },
  })

  revalidatePath('/admin/faq')
  revalidateTag('faq', { expire: 0 })

  return createSuccess('カテゴリを削除しました')
})

/**
 * FAQカテゴリの順序を更新
 */
export const reorderFaqCategories = withAuth(async (_user, orderedIds: string[]) => {
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.faqCategory.update({
        where: { id },
        data: { order: index },
      })
    )
  )

  revalidatePath('/admin/faq')
  revalidateTag('faq', { expire: 0 })

  return createSuccess('順序を更新しました')
})

// =============================================================================
// FaqItem Actions
// =============================================================================

/**
 * FAQ項目一覧を取得
 */
export async function getFaqItems(
  filters: FaqItemFilters = {},
  pagination: FaqItemPagination = {}
): Promise<FaqItemListResult> {
  await requireAdmin()

  const { categoryId, search, isActive } = filters
  const { page = 1, limit = 20 } = pagination

  type WhereInput = {
    categoryId?: string
    isActive?: boolean
    OR?: Array<{
      question?: { contains: string; mode: 'insensitive' }
      answer?: { contains: string; mode: 'insensitive' }
    }>
  }

  const where: WhereInput = {}

  if (categoryId) {
    where.categoryId = categoryId
  }

  if (typeof isActive === 'boolean') {
    where.isActive = isActive
  }

  if (search) {
    where.OR = [
      { question: { contains: search, mode: 'insensitive' } },
      { answer: { contains: search, mode: 'insensitive' } },
    ]
  }

  const total = await prisma.faqItem.count({ where })

  const items = await prisma.faqItem.findMany({
    where,
    include: {
      category: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
    orderBy: [{ category: { order: 'asc' } }, { order: 'asc' }],
    skip: (page - 1) * limit,
    take: limit,
  })

  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  }
}

/**
 * FAQ項目詳細を取得
 */
export async function getFaqItemById(id: string): Promise<FaqItemWithCategory | null> {
  await requireAdmin()

  return prisma.faqItem.findUnique({
    where: { id },
    include: {
      category: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  })
}

/**
 * FAQ項目を作成
 */
export const createFaqItem = withAuth(async (_user, data: FaqItemFormInput) => {
  const parsed = faqItemFormSchema.safeParse(data)
  if (!parsed.success) {
    return createFailure(parsed.error.issues[0].message)
  }

  // カテゴリの存在確認
  const category = await prisma.faqCategory.findUnique({
    where: { id: parsed.data.categoryId },
  })

  if (!category) {
    return createFailure('カテゴリが見つかりません')
  }

  // カテゴリ内の最大orderを取得
  const maxOrder = await prisma.faqItem.aggregate({
    where: { categoryId: parsed.data.categoryId },
    _max: { order: true },
  })

  const item = await prisma.faqItem.create({
    data: {
      ...parsed.data,
      order: parsed.data.order || (maxOrder._max.order ?? 0) + 1,
    },
  })

  revalidatePath('/admin/faq')
  revalidateTag('faq', { expire: 0 })

  return createSuccess('質問を作成しました', { id: item.id })
})

/**
 * FAQ項目を更新
 */
export const updateFaqItem = withAuth(async (_user, id: string, data: FaqItemFormInput) => {
  const parsed = faqItemFormSchema.safeParse(data)
  if (!parsed.success) {
    return createFailure(parsed.error.issues[0].message)
  }

  const existing = await prisma.faqItem.findUnique({
    where: { id },
  })

  if (!existing) {
    return createFailure('質問が見つかりません')
  }

  // カテゴリの存在確認
  const category = await prisma.faqCategory.findUnique({
    where: { id: parsed.data.categoryId },
  })

  if (!category) {
    return createFailure('カテゴリが見つかりません')
  }

  await prisma.faqItem.update({
    where: { id },
    data: parsed.data,
  })

  revalidatePath('/admin/faq')
  revalidateTag('faq', { expire: 0 })

  return createSuccess('質問を更新しました')
})

/**
 * FAQ項目を削除
 */
export const deleteFaqItem = withAuth(async (_user, id: string) => {
  const item = await prisma.faqItem.findUnique({
    where: { id },
  })

  if (!item) {
    return createFailure('質問が見つかりません')
  }

  await prisma.faqItem.delete({
    where: { id },
  })

  revalidatePath('/admin/faq')
  revalidateTag('faq', { expire: 0 })

  return createSuccess('質問を削除しました')
})

/**
 * FAQ項目の順序を更新（カテゴリ内）
 */
export const reorderFaqItems = withAuth(async (_user, categoryId: string, orderedIds: string[]) => {
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.faqItem.update({
        where: { id },
        data: { order: index, categoryId },
      })
    )
  )

  revalidatePath('/admin/faq')
  revalidateTag('faq', { expire: 0 })

  return createSuccess('順序を更新しました')
})

/**
 * FAQ項目の公開状態を切り替え
 */
export const toggleFaqItemActive = withAuth(async (_user, id: string) => {
  const item = await prisma.faqItem.findUnique({
    where: { id },
  })

  if (!item) {
    return createFailure('質問が見つかりません')
  }

  await prisma.faqItem.update({
    where: { id },
    data: { isActive: !item.isActive },
  })

  revalidatePath('/admin/faq')
  revalidateTag('faq', { expire: 0 })

  return createSuccess('公開状態を変更しました')
})
