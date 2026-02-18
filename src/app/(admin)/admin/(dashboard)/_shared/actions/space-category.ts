'use server'

import { prisma } from '@/shared/lib/prisma'
import { updateTag } from 'next/cache'
import { CACHE_TAGS } from '@/shared/lib/constants'
import { createSuccess, createFailure, type ActionResult } from '@/admin/types/server-actions'
import { withPermission } from '@/admin/lib/server-action-helpers'
import { spaceCategoryFormSchema } from '@/admin/lib/validations/space-category'
import type {
  SpaceCategoryFormInput,
  SpaceCategoryWithStats,
  GetSpaceCategoriesResult,
} from '@/admin/lib/validations/space-category'
import { getSession, getRoleFromSession } from '@/shared/lib/auth'
import { hasPermission, canAccessAdmin } from '@/admin/lib/permissions'
import { logPermissionDenied } from '@/admin/lib/audit'
import { createValidationError } from '@/shared/lib/action-helpers'

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
  if (!hasPermission(role, 'spaceCategory', 'read')) {
    void logPermissionDenied(session.user.id, 'spaceCategory', 'read')
    return false
  }
  return true
}

// =============================================================================
// Read Operations
// =============================================================================

/**
 * スペースカテゴリー一覧を取得
 */
export async function getSpaceCategories(options?: {
  includeInactive?: boolean
  search?: string
}): Promise<GetSpaceCategoriesResult> {
  const hasPermissionResult = await checkReadPermission()
  if (!hasPermissionResult) {
    return { categories: [], total: 0 }
  }

  const { includeInactive = false, search } = options ?? {}

  const where = {
    ...(includeInactive ? {} : { isActive: true }),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { description: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }

  const [categories, total] = await Promise.all([
    prisma.spaceCategory.findMany({
      where,
      orderBy: { sortOrder: 'asc' },
      include: {
        _count: {
          select: { spaces: true },
        },
      },
    }),
    prisma.spaceCategory.count({ where }),
  ])

  const formattedCategories: SpaceCategoryWithStats[] = categories.map((cat) => ({
    id: cat.id,
    name: cat.name,
    description: cat.description,
    icon: cat.icon,
    color: cat.color,
    sortOrder: cat.sortOrder,
    isActive: cat.isActive,
    createdAt: cat.createdAt,
    updatedAt: cat.updatedAt,
    _count: cat._count,
  }))

  return {
    categories: formattedCategories,
    total,
  }
}

/**
 * スペースカテゴリーを1件取得
 */
export async function getSpaceCategoryById(id: string): Promise<ActionResult<SpaceCategoryWithStats>> {
  const hasPermissionResult = await checkReadPermission()
  if (!hasPermissionResult) {
    return createFailure('権限がありません')
  }

  const category = await prisma.spaceCategory.findUnique({
    where: { id },
    include: {
      _count: {
        select: { spaces: true },
      },
    },
  })

  if (!category) {
    return createFailure('カテゴリーが見つかりません')
  }

  const formatted: SpaceCategoryWithStats = {
    id: category.id,
    name: category.name,
    description: category.description,
    icon: category.icon,
    color: category.color,
    sortOrder: category.sortOrder,
    isActive: category.isActive,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
    _count: category._count,
  }

  return createSuccess('取得しました', formatted)
}

/**
 * アクティブなカテゴリー一覧を取得（セレクトボックス用）
 */
export async function getActiveSpaceCategories(): Promise<ActionResult<{ id: string; name: string; icon: string | null; color: string | null }[]>> {
  const hasPermissionResult = await checkReadPermission()
  if (!hasPermissionResult) {
    return createFailure('権限がありません')
  }

  const categories = await prisma.spaceCategory.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      name: true,
      icon: true,
      color: true,
    },
  })

  return createSuccess('取得しました', categories)
}

// =============================================================================
// Create Operations
// =============================================================================

/**
 * スペースカテゴリーを作成
 */
export const createSpaceCategory = withPermission<[input: SpaceCategoryFormInput], { id: string }>(
  'spaceCategory',
  'create'
)(async (_user, input): Promise<ActionResult<{ id: string }>> => {
  const parsed = spaceCategoryFormSchema.safeParse(input)

  if (!parsed.success) {
    return createValidationError(parsed.error)
  }

  const data = parsed.data

  // 同名チェック
  const existing = await prisma.spaceCategory.findFirst({
    where: { name: data.name, isActive: true },
    select: { id: true },
  })
  if (existing) {
    return createFailure('同じ名前のカテゴリーが既に存在します')
  }

  const category = await prisma.spaceCategory.create({
    data: {
      name: data.name,
      description: data.description || null,
      icon: data.icon || null,
      color: data.color || null,
      sortOrder: data.sortOrder,
    },
  })

  updateTag(CACHE_TAGS.SPACE_CATEGORIES)

  return createSuccess('カテゴリーを作成しました', { id: category.id })
})

// =============================================================================
// Update Operations
// =============================================================================

/**
 * スペースカテゴリーを更新
 */
export const updateSpaceCategory = withPermission<[id: string, input: SpaceCategoryFormInput], { id: string }>(
  'spaceCategory',
  'update'
)(async (_user, id, input): Promise<ActionResult<{ id: string }>> => {
  const parsed = spaceCategoryFormSchema.safeParse(input)

  if (!parsed.success) {
    return createValidationError(parsed.error)
  }

  const existing = await prisma.spaceCategory.findUnique({
    where: { id },
    select: { id: true },
  })
  if (!existing) {
    return createFailure('カテゴリーが見つかりません')
  }

  const data = parsed.data

  // 同名チェック（自分以外）
  const duplicate = await prisma.spaceCategory.findFirst({
    where: { name: data.name, isActive: true, id: { not: id } },
    select: { id: true },
  })
  if (duplicate) {
    return createFailure('同じ名前のカテゴリーが既に存在します')
  }

  await prisma.spaceCategory.update({
    where: { id },
    data: {
      name: data.name,
      description: data.description || null,
      icon: data.icon || null,
      color: data.color || null,
      sortOrder: data.sortOrder,
    },
  })

  updateTag(CACHE_TAGS.SPACE_CATEGORIES)

  return createSuccess('カテゴリーを更新しました', { id })
})

/**
 * カテゴリーの並び順を更新
 */
export const updateSpaceCategoryOrder = withPermission<[items: { id: string; sortOrder: number }[]], { updated: number }>(
  'spaceCategory',
  'update'
)(async (_user, items): Promise<ActionResult<{ updated: number }>> => {
  await prisma.$transaction(
    items.map((item) =>
      prisma.spaceCategory.update({
        where: { id: item.id },
        data: { sortOrder: item.sortOrder },
      })
    )
  )

  updateTag(CACHE_TAGS.SPACE_CATEGORIES)

  return createSuccess('並び順を更新しました', { updated: items.length })
})

// =============================================================================
// Delete Operations
// =============================================================================

/**
 * スペースカテゴリーを削除（論理削除）
 */
export const deleteSpaceCategory = withPermission<[id: string], { id: string }>(
  'spaceCategory',
  'delete'
)(async (_user, id): Promise<ActionResult<{ id: string }>> => {
  const existing = await prisma.spaceCategory.findUnique({
    where: { id },
    include: { _count: { select: { spaces: true } } },
  })

  if (!existing) {
    return createFailure('カテゴリーが見つかりません')
  }

  if (existing._count.spaces > 0) {
    return createFailure(
      `このカテゴリーには${existing._count.spaces}件のスペースが紐づいています。先にスペースのカテゴリーを変更してください。`
    )
  }

  await prisma.spaceCategory.update({
    where: { id },
    data: { isActive: false },
  })

  updateTag(CACHE_TAGS.SPACE_CATEGORIES)

  return createSuccess('カテゴリーを削除しました', { id })
})

/**
 * スペースカテゴリーを物理削除
 */
export const hardDeleteSpaceCategory = withPermission<[id: string], { id: string }>(
  'spaceCategory',
  'delete'
)(async (_user, id): Promise<ActionResult<{ id: string }>> => {
  const existing = await prisma.spaceCategory.findUnique({
    where: { id },
    include: { _count: { select: { spaces: true } } },
  })

  if (!existing) {
    return createFailure('カテゴリーが見つかりません')
  }

  if (existing._count.spaces > 0) {
    return createFailure(
      `このカテゴリーには${existing._count.spaces}件のスペースが紐づいています。`
    )
  }

  await prisma.spaceCategory.delete({ where: { id } })

  updateTag(CACHE_TAGS.SPACE_CATEGORIES)

  return createSuccess('カテゴリーを完全に削除しました', { id })
})
