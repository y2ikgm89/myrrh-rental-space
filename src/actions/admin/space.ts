'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import {
  spaceFormSchema,
  type SpaceFormData,
  type SpaceWithStats,
  type GetSpacesResult,
  type SpaceFilters,
  type SpacePagination,
} from '@/lib/validations/space'
import { type ActionResult, createSuccess, createFailure, type SpaceWhereInput } from '@/types'
import { parseStringArray, parseBusinessHours } from '@/lib/json-validators'
import { requireAdmin } from '@/lib/auth'

// =============================================================================
// Actions
// =============================================================================

/**
 * スペース一覧を取得
 */
export async function getSpaces(
  filters: SpaceFilters = {},
  pagination: SpacePagination = {}
): Promise<GetSpacesResult> {
  await requireAdmin()

  const { isPublished, search } = filters
  const {
    page = 1,
    limit = 10,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = pagination

  // Where条件を構築
  const where: SpaceWhereInput = {
    isActive: true,
  }

  if (isPublished !== undefined && isPublished !== 'ALL') {
    where.isPublished = isPublished
  }

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { address: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ]
  }

  // 総件数を取得
  const total = await prisma.space.count({ where })

  // スペース一覧を取得
  const spaces = await prisma.space.findMany({
    where,
    include: {
      _count: {
        select: {
          reservations: true,
        },
      },
    },
    orderBy: {
      [sortBy]: sortOrder,
    },
    skip: (page - 1) * limit,
    take: limit,
  })

  // Decimal型をnumber型に変換
  const formattedSpaces: SpaceWithStats[] = spaces.map((s) => ({
    ...s,
    area: s.area ? Number(s.area) : null,
    hourlyPrice: Number(s.hourlyPrice),
    dailyPrice: s.dailyPrice ? Number(s.dailyPrice) : null,
    imageUrls: parseStringArray(s.imageUrls),
    facilities: parseStringArray(s.facilities),
    businessHours: parseBusinessHours(s.businessHours),
  }))

  return {
    spaces: formattedSpaces,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  }
}

/**
 * スペース詳細を取得
 */
export async function getSpaceById(id: string): Promise<SpaceWithStats | null> {
  await requireAdmin()

  const space = await prisma.space.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          reservations: true,
        },
      },
    },
  })

  if (!space) {
    return null
  }

  return {
    ...space,
    area: space.area ? Number(space.area) : null,
    hourlyPrice: Number(space.hourlyPrice),
    dailyPrice: space.dailyPrice ? Number(space.dailyPrice) : null,
    imageUrls: parseStringArray(space.imageUrls),
    facilities: parseStringArray(space.facilities),
    businessHours: parseBusinessHours(space.businessHours),
  }
}

/**
 * スペースを作成
 */
export async function createSpace(
  input: SpaceFormData
): Promise<ActionResult<{ id: string }>> {
  try {
    await requireAdmin()

    const parsed = spaceFormSchema.safeParse(input)
    if (!parsed.success) {
      return createFailure(parsed.error.issues[0]?.message || '入力が不正です')
    }

    const data = parsed.data

    const space = await prisma.space.create({
      data: {
        name: data.name,
        description: data.description,
        address: data.address,
        access: data.access || null,
        capacity: data.capacity,
        area: data.area || null,
        hourlyPrice: data.hourlyPrice,
        dailyPrice: data.dailyPrice || null,
        mainImageUrl: data.mainImageUrl,
        imageUrls: data.imageUrls,
        facilities: data.facilities,
        isPublished: data.isPublished,
        publishedAt: data.isPublished ? new Date() : null,
      },
    })

    revalidatePath('/admin/spaces')
    revalidatePath('/spaces')
    revalidatePath('/')

    return createSuccess('スペースを作成しました', { id: space.id })
  } catch (error) {
    console.error('Failed to create space:', error)
    return createFailure('スペースの作成に失敗しました')
  }
}

/**
 * スペースを更新
 */
export async function updateSpace(
  id: string,
  input: SpaceFormData
): Promise<ActionResult<void>> {
  try {
    await requireAdmin()

    const parsed = spaceFormSchema.safeParse(input)
    if (!parsed.success) {
      return createFailure(parsed.error.issues[0]?.message || '入力が不正です')
    }

    const existingSpace = await prisma.space.findUnique({
      where: { id },
    })

    if (!existingSpace) {
      return createFailure('スペースが見つかりません')
    }

    const data = parsed.data

    // 公開状態が変わった場合はpublishedAtを更新
    let publishedAt = existingSpace.publishedAt
    if (data.isPublished && !existingSpace.isPublished) {
      publishedAt = new Date()
    } else if (!data.isPublished) {
      publishedAt = null
    }

    await prisma.space.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        address: data.address,
        access: data.access || null,
        capacity: data.capacity,
        area: data.area || null,
        hourlyPrice: data.hourlyPrice,
        dailyPrice: data.dailyPrice || null,
        mainImageUrl: data.mainImageUrl,
        imageUrls: data.imageUrls,
        facilities: data.facilities,
        isPublished: data.isPublished,
        publishedAt,
      },
    })

    revalidatePath('/admin/spaces')
    revalidatePath(`/admin/spaces/${id}`)
    revalidatePath('/spaces')
    revalidatePath(`/spaces/${id}`)
    revalidatePath('/')

    return createSuccess('スペースを更新しました')
  } catch (error) {
    console.error('Failed to update space:', error)
    return createFailure('スペースの更新に失敗しました')
  }
}

/**
 * スペースの公開状態を更新
 */
export async function updateSpacePublish(
  id: string,
  isPublished: boolean
): Promise<ActionResult<void>> {
  try {
    await requireAdmin()

    const space = await prisma.space.findUnique({
      where: { id },
    })

    if (!space) {
      return createFailure('スペースが見つかりません')
    }

    await prisma.space.update({
      where: { id },
      data: {
        isPublished,
        publishedAt: isPublished ? new Date() : null,
      },
    })

    revalidatePath('/admin/spaces')
    revalidatePath(`/admin/spaces/${id}`)
    revalidatePath('/spaces')
    revalidatePath(`/spaces/${id}`)
    revalidatePath('/')

    return createSuccess('公開状態を更新しました')
  } catch (error) {
    console.error('Failed to update space publish status:', error)
    return createFailure('公開状態の更新に失敗しました')
  }
}

/**
 * スペースを削除（論理削除）
 */
export async function deleteSpace(
  id: string
): Promise<ActionResult<void>> {
  try {
    await requireAdmin()

    const space = await prisma.space.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            reservations: {
              where: {
                status: { in: ['PENDING', 'CONFIRMED'] },
              },
            },
          },
        },
      },
    })

    if (!space) {
      return createFailure('スペースが見つかりません')
    }

    // 有効な予約がある場合は削除不可
    if (space._count.reservations > 0) {
      return createFailure('有効な予約があるため削除できません')
    }

    // 論理削除
    await prisma.space.update({
      where: { id },
      data: {
        isActive: false,
        isPublished: false,
      },
    })

    revalidatePath('/admin/spaces')
    revalidatePath('/spaces')
    revalidatePath('/')

    return createSuccess('スペースを削除しました')
  } catch (error) {
    console.error('Failed to delete space:', error)
    return createFailure('スペースの削除に失敗しました')
  }
}

/**
 * 統計情報を取得（ダッシュボード用）
 */
export async function getSpaceStats(): Promise<{
  total: number
  published: number
  unpublished: number
  totalCapacity: number
}> {
  await requireAdmin()

  const [total, published, spaces] = await Promise.all([
    prisma.space.count({ where: { isActive: true } }),
    prisma.space.count({ where: { isActive: true, isPublished: true } }),
    prisma.space.findMany({
      where: { isActive: true },
      select: { capacity: true },
    }),
  ])

  const totalCapacity = spaces.reduce((sum, s) => sum + s.capacity, 0)

  return {
    total,
    published,
    unpublished: total - published,
    totalCapacity,
  }
}
