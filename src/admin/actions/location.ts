'use server'

import { prisma, Prisma } from '@/shared/lib/prisma'
import { revalidateTag } from 'next/cache'
import { createSuccess, createFailure, withPermission, type ActionResult } from '@/admin/types/server-actions'
import { locationFormSchema } from '@/admin/lib/validations/location'
import type { LocationFormInput, LocationWithStats, GetLocationsResult } from '@/admin/lib/validations/location'
import { getSession, getRoleFromSession } from '@/shared/lib/auth'
import { hasPermission, canAccessAdmin } from '@/admin/lib/permissions'
import { logPermissionDenied } from '@/admin/lib/audit'
import { parseBusinessHours, type BusinessHours } from '@/shared/types'

// =============================================================================
// Prisma JSON Helpers (server-only)
// =============================================================================

/**
 * BusinessHoursをPrisma JSONに変換
 */
function businessHoursToJson(
  value: BusinessHours | null | undefined
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === null || value === undefined) return Prisma.JsonNull
  return value as Prisma.InputJsonValue
}

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
  if (!hasPermission(role, 'location', 'read')) {
    void logPermissionDenied(session.user.id, 'location', 'read')
    return false
  }
  return true
}

// =============================================================================
// Read Operations
// =============================================================================

/**
 * 場所一覧を取得
 */
export async function getLocations(options?: {
  includeInactive?: boolean
  search?: string
}): Promise<GetLocationsResult> {
  const hasPermissionResult = await checkReadPermission()
  if (!hasPermissionResult) {
    return { locations: [], total: 0 }
  }

  const { includeInactive = false, search } = options ?? {}

  const where = {
    ...(includeInactive ? {} : { isActive: true }),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { address: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }

  const [locations, total] = await Promise.all([
    prisma.location.findMany({
      where,
      orderBy: { sortOrder: 'asc' },
      include: {
        _count: {
          select: { spaces: true },
        },
      },
    }),
    prisma.location.count({ where }),
  ])

  const formattedLocations: LocationWithStats[] = locations.map((loc) => ({
    id: loc.id,
    name: loc.name,
    description: loc.description,
    address: loc.address,
    access: loc.access,
    imageUrl: loc.imageUrl,
    imageUrls: Array.isArray(loc.imageUrls) ? (loc.imageUrls as string[]) : [],
    businessHours: parseBusinessHours(loc.businessHours),
    sortOrder: loc.sortOrder,
    isPublished: loc.isPublished,
    isActive: loc.isActive,
    createdAt: loc.createdAt,
    updatedAt: loc.updatedAt,
    _count: loc._count,
  }))

  return {
    locations: formattedLocations,
    total,
  }
}

/**
 * 場所を1件取得
 */
export async function getLocationById(id: string): Promise<ActionResult<LocationWithStats>> {
  const hasPermissionResult = await checkReadPermission()
  if (!hasPermissionResult) {
    return createFailure('権限がありません')
  }

  const location = await prisma.location.findUnique({
    where: { id },
    include: {
      _count: {
        select: { spaces: true },
      },
    },
  })

  if (!location) {
    return createFailure('場所が見つかりません')
  }

  const formatted: LocationWithStats = {
    id: location.id,
    name: location.name,
    description: location.description,
    address: location.address,
    access: location.access,
    imageUrl: location.imageUrl,
    imageUrls: Array.isArray(location.imageUrls) ? (location.imageUrls as string[]) : [],
    businessHours: parseBusinessHours(location.businessHours),
    sortOrder: location.sortOrder,
    isPublished: location.isPublished,
    isActive: location.isActive,
    createdAt: location.createdAt,
    updatedAt: location.updatedAt,
    _count: location._count,
  }

  return createSuccess('取得しました', formatted)
}

/**
 * 公開されている場所一覧を取得（セレクトボックス用）
 */
export async function getPublishedLocations(): Promise<ActionResult<{ id: string; name: string; address: string }[]>> {
  const hasPermissionResult = await checkReadPermission()
  if (!hasPermissionResult) {
    return createFailure('権限がありません')
  }

  const locations = await prisma.location.findMany({
    where: { isPublished: true, isActive: true },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      name: true,
      address: true,
    },
  })

  return createSuccess('取得しました', locations)
}

// =============================================================================
// Create Operations
// =============================================================================

/**
 * 場所を作成
 */
export const createLocation = withPermission<[input: LocationFormInput], { id: string }>(
  'location',
  'create'
)(async (_user, input): Promise<ActionResult<{ id: string }>> => {
  const parsed = locationFormSchema.safeParse(input)

  if (!parsed.success) {
    return createFailure(
      parsed.error.issues.map((e) => e.message).join(', ')
    )
  }

  const data = parsed.data

  const location = await prisma.location.create({
    data: {
      name: data.name,
      description: data.description || null,
      address: data.address,
      access: data.access || null,
      imageUrl: data.imageUrl,
      imageUrls: data.imageUrls,
      businessHours: businessHoursToJson(data.businessHours ?? null),
      sortOrder: data.sortOrder,
      isPublished: data.isPublished,
    },
  })

  revalidateTag('locations', { expire: 0 })

  return createSuccess('場所を作成しました', { id: location.id })
})

// =============================================================================
// Update Operations
// =============================================================================

/**
 * 場所を更新
 */
export const updateLocation = withPermission<[id: string, input: LocationFormInput], { id: string }>(
  'location',
  'update'
)(async (_user, id, input): Promise<ActionResult<{ id: string }>> => {
  const parsed = locationFormSchema.safeParse(input)

  if (!parsed.success) {
    return createFailure(
      parsed.error.issues.map((e) => e.message).join(', ')
    )
  }

  const existing = await prisma.location.findUnique({ where: { id } })
  if (!existing) {
    return createFailure('場所が見つかりません')
  }

  const data = parsed.data

  await prisma.location.update({
    where: { id },
    data: {
      name: data.name,
      description: data.description || null,
      address: data.address,
      access: data.access || null,
      imageUrl: data.imageUrl,
      imageUrls: data.imageUrls,
      businessHours: businessHoursToJson(data.businessHours ?? null),
      sortOrder: data.sortOrder,
      isPublished: data.isPublished,
    },
  })

  revalidateTag('locations', { expire: 0 })

  return createSuccess('場所を更新しました', { id })
})

/**
 * 場所の公開状態を切り替え
 */
export const toggleLocationPublish = withPermission<[id: string, isPublished: boolean], { id: string; isPublished: boolean }>(
  'location',
  'publish'
)(async (_user, id, isPublished): Promise<ActionResult<{ id: string; isPublished: boolean }>> => {
  const existing = await prisma.location.findUnique({ where: { id } })
  if (!existing) {
    return createFailure('場所が見つかりません')
  }

  await prisma.location.update({
    where: { id },
    data: { isPublished },
  })

  revalidateTag('locations', { expire: 0 })

  return createSuccess('公開状態を更新しました', { id, isPublished })
})

/**
 * 場所の並び順を更新
 */
export const updateLocationOrder = withPermission<[items: { id: string; sortOrder: number }[]], { updated: number }>(
  'location',
  'update'
)(async (_user, items): Promise<ActionResult<{ updated: number }>> => {
  await prisma.$transaction(
    items.map((item) =>
      prisma.location.update({
        where: { id: item.id },
        data: { sortOrder: item.sortOrder },
      })
    )
  )

  revalidateTag('locations', { expire: 0 })

  return createSuccess('並び順を更新しました', { updated: items.length })
})

// =============================================================================
// Delete Operations
// =============================================================================

/**
 * 場所を削除（論理削除）
 */
export const deleteLocation = withPermission<[id: string], { id: string }>(
  'location',
  'delete'
)(async (_user, id): Promise<ActionResult<{ id: string }>> => {
  const existing = await prisma.location.findUnique({
    where: { id },
    include: { _count: { select: { spaces: true } } },
  })

  if (!existing) {
    return createFailure('場所が見つかりません')
  }

  if (existing._count.spaces > 0) {
    return createFailure(
      `この場所には${existing._count.spaces}件のスペースが紐づいています。先にスペースの場所を変更してください。`
    )
  }

  await prisma.location.update({
    where: { id },
    data: { isActive: false },
  })

  revalidateTag('locations', { expire: 0 })

  return createSuccess('場所を削除しました', { id })
})

/**
 * 場所を物理削除
 */
export const hardDeleteLocation = withPermission<[id: string], { id: string }>(
  'location',
  'delete'
)(async (_user, id): Promise<ActionResult<{ id: string }>> => {
  const existing = await prisma.location.findUnique({
    where: { id },
    include: { _count: { select: { spaces: true } } },
  })

  if (!existing) {
    return createFailure('場所が見つかりません')
  }

  if (existing._count.spaces > 0) {
    return createFailure(
      `この場所には${existing._count.spaces}件のスペースが紐づいています。`
    )
  }

  await prisma.location.delete({ where: { id } })

  revalidateTag('locations', { expire: 0 })

  return createSuccess('場所を完全に削除しました', { id })
})
