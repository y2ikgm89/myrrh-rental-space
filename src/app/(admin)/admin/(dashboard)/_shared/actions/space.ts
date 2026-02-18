'use server'

import { prisma } from '@/shared/lib/prisma'
import { updateTag } from 'next/cache'
import { CACHE_TAGS, getCacheTag } from '@/shared/lib/constants'
import {
  spaceFormSchema,
  type SpaceFormData,
  type SpaceWithStats,
  type GetSpacesResult,
  type SpaceFilters,
  type SpacePagination,
} from '@/admin/lib/validations/space'
import { createSuccess, createFailure, type ActionResult } from '@/admin/types/server-actions'
import { createValidationError } from '@/shared/lib/action-helpers'
import { withPermission } from '@/admin/lib/server-action-helpers'
import type { SpaceWhereInput } from '@/shared/types/prisma'
import { parseStringArray, parseBusinessHours } from '@/shared/lib/json-validators'
import { checkReadPermissionFor } from '@/admin/lib/permissions'
import { ACTIVE_RESERVATION_STATUSES, getValidDiscountType, getValidDurationDiscountOverride, getValidTaxRateType } from '@/shared/lib/validations/enums'
import { purgeSpaceCache } from '@/shared/lib/cloudflare'
import { fireAndForget } from '@/shared/lib/async-utils'
import { ErrorCategory, ErrorSeverity } from '@/shared/lib/errors'
import { checkSlugAvailability, getSlugErrorMessage } from '@/shared/lib/slug-validation'
import { DiscountType, DurationDiscountOverride, TaxRateType } from '@/shared/generated/prisma/enums'

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Lexical JSON 文字列を HTML に変換（非JSON文字列はそのまま返す）
 * Space.description は非移行モデルのため、JSON→HTML変換をサーバー側で行う
 */
async function renderDescriptionHtml(value: string | null | undefined): Promise<string | null> {
  if (!value) return value ?? null
  try {
    const parsed: unknown = JSON.parse(value)
    if (parsed && typeof parsed === 'object' && 'root' in parsed) {
      const { renderEditorStateToHtmlLazy } = await import('@/admin/lib/lazy-renderer')
      return renderEditorStateToHtmlLazy(value)
    }
  } catch {
    // Not JSON — already HTML or plain text
  }
  return value
}

/**
 * 読み取り権限チェック（共通ヘルパー使用）
 */
const checkReadPermission = checkReadPermissionFor('space')

// =============================================================================
// Read Actions
// =============================================================================

/**
 * スペース一覧を取得
 */
export async function getSpaces(
  filters: SpaceFilters = {},
  pagination: SpacePagination = {}
): Promise<GetSpacesResult> {
  const hasPermission = await checkReadPermission()
  if (!hasPermission) {
    return { spaces: [], total: 0, page: 1, limit: 10, totalPages: 0 }
  }

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

  // 総件数とスペース一覧を並列取得（N+1解消）
  const [total, spaces] = await prisma.$transaction([
    prisma.space.count({ where }),
    prisma.space.findMany({
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
    }),
  ])

  // Prisma オブジェクトをプレーンオブジェクトに変換
  // Symbol プロパティを除去して Client Components に渡せるようにする
  const formattedSpaces: SpaceWithStats[] = spaces.map((s) => ({
    id: s.id,
    slug: s.slug,
    name: s.name,
    description: s.description,
    address: s.address,
    access: s.access,
    capacity: s.capacity,
    area: s.area,
    hourlyPrice: s.hourlyPrice,
    dailyPrice: s.dailyPrice,
    mainImageUrl: s.mainImageUrl,
    imageUrls: parseStringArray(s.imageUrls),
    facilities: parseStringArray(s.facilities),
    businessHours: parseBusinessHours(s.businessHours),
    isPublished: s.isPublished,
    publishedAt: s.publishedAt,
    isActive: s.isActive,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    termsId: s.termsId,
    locationId: s.locationId,
    categoryId: s.categoryId,
    // 割引設定
    discountType: getValidDiscountType(s.discountType),
    discountValue: s.discountValue,
    durationDiscountOverride: getValidDurationDiscountOverride(s.durationDiscountOverride),
    // 税率設定
    taxRateType: getValidTaxRateType(s.taxRateType),
    // SEO/OGP
    metaDescription: s.metaDescription,
    metaKeywords: s.metaKeywords,
    ogpTitle: s.ogpTitle,
    ogpDescription: s.ogpDescription,
    ogpImageUrl: s.ogpImageUrl,
    _count: { reservations: s._count.reservations },
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
  const hasPermission = await checkReadPermission()
  if (!hasPermission) {
    return null
  }

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

  // Prisma オブジェクトをプレーンオブジェクトに変換
  // Symbol プロパティを除去して Client Components に渡せるようにする
  return {
    id: space.id,
    slug: space.slug,
    name: space.name,
    description: space.description,
    address: space.address,
    access: space.access,
    capacity: space.capacity,
    area: space.area,
    hourlyPrice: space.hourlyPrice,
    dailyPrice: space.dailyPrice,
    mainImageUrl: space.mainImageUrl,
    imageUrls: parseStringArray(space.imageUrls),
    facilities: parseStringArray(space.facilities),
    businessHours: parseBusinessHours(space.businessHours),
    isPublished: space.isPublished,
    publishedAt: space.publishedAt,
    isActive: space.isActive,
    createdAt: space.createdAt,
    updatedAt: space.updatedAt,
    termsId: space.termsId,
    locationId: space.locationId,
    categoryId: space.categoryId,
    // 割引設定
    discountType: getValidDiscountType(space.discountType),
    discountValue: space.discountValue,
    durationDiscountOverride: getValidDurationDiscountOverride(space.durationDiscountOverride),
    // 税率設定
    taxRateType: getValidTaxRateType(space.taxRateType),
    // SEO/OGP
    metaDescription: space.metaDescription,
    metaKeywords: space.metaKeywords,
    ogpTitle: space.ogpTitle,
    ogpDescription: space.ogpDescription,
    ogpImageUrl: space.ogpImageUrl,
    _count: { reservations: space._count.reservations },
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
  const hasPermission = await checkReadPermission()
  if (!hasPermission) {
    return { total: 0, published: 0, unpublished: 0, totalCapacity: 0 }
  }

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

/**
 * スペース選択用リストを取得（軽量版）
 * エディタ内のスペースカードノード用
 */
export type SpaceSelectOption = {
  id: string
  slug: string
  name: string
  mainImageUrl: string
  hourlyPrice: string
  capacity: number
}

export async function getSpacesForSelect(): Promise<ActionResult<SpaceSelectOption[]>> {
  const hasReadPermission = await checkReadPermission()
  if (!hasReadPermission) {
    return createFailure('権限がありません')
  }

  const spaces = await prisma.space.findMany({
    where: { isActive: true, isPublished: true },
    select: {
      id: true,
      slug: true,
      name: true,
      mainImageUrl: true,
      hourlyPrice: true,
      capacity: true,
    },
    orderBy: { name: 'asc' },
  })

  return createSuccess('取得しました', spaces.map((s) => ({
    id: s.id,
    slug: s.slug,
    name: s.name,
    mainImageUrl: s.mainImageUrl,
    hourlyPrice: String(s.hourlyPrice),
    capacity: s.capacity,
  })))
}

// =============================================================================
// Write Actions (using withPermission HOF)
// =============================================================================

/**
 * スペースを作成
 */
export const createSpace = withPermission<[input: SpaceFormData], { id: string }>(
  'space',
  'create'
)(async (_user, input): Promise<ActionResult<{ id: string }>> => {
  const parsed = spaceFormSchema.safeParse(input)
  if (!parsed.success) {
    return createValidationError(parsed.error)
  }

  const data = parsed.data

  // スラッグの使用可能チェック（予約パス＋全コンテンツタイプ横断）
  const slugCheck = await checkSlugAvailability(data.slug, {
    currentType: 'space',
  })
  if (!slugCheck.available) {
    return createFailure(getSlugErrorMessage(slugCheck.reason))
  }

  const space = await prisma.space.create({
    data: {
      slug: data.slug,
      name: data.name,
      description: (await renderDescriptionHtml(data.description)) ?? data.description,
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
      termsId: data.termsId || null,
      locationId: data.locationId || null,
      categoryId: data.categoryId || null,
      // 割引設定
      discountType: data.discountType ?? DiscountType.none,
      discountValue: data.discountValue ?? null,
      durationDiscountOverride: data.durationDiscountOverride ?? DurationDiscountOverride.inherit,
      // 税率設定
      taxRateType: data.taxRateType ?? TaxRateType.standard,
      // SEO フィールド
      metaDescription: data.metaDescription || null,
      metaKeywords: data.metaKeywords || null,
      // OGP フィールド
      ogpTitle: data.ogpTitle || null,
      ogpDescription: data.ogpDescription || null,
      ogpImageUrl: data.ogpImageUrl || null,
    },
  })

  updateTag(CACHE_TAGS.SPACES)

  // Cloudflare CDN キャッシュパージ（設定がある場合のみ実行）
  fireAndForget(purgeSpaceCache(space.id), { operation: 'purgeSpaceCache', category: ErrorCategory.EXTERNAL_API, severity: ErrorSeverity.LOW })

  return createSuccess('スペースを作成しました', { id: space.id })
})

/**
 * スペースを更新
 */
export const updateSpace = withPermission<[id: string, input: SpaceFormData], void>(
  'space',
  'update'
)(async (_user, id, input): Promise<ActionResult<void>> => {
  const parsed = spaceFormSchema.safeParse(input)
  if (!parsed.success) {
    return createValidationError(parsed.error)
  }

  const existingSpace = await prisma.space.findUnique({
    where: { id },
    select: { id: true, publishedAt: true, isPublished: true },
  })

  if (!existingSpace) {
    return createFailure('スペースが見つかりません')
  }

  const data = parsed.data

  // スラッグの使用可能チェック（予約パス＋全コンテンツタイプ横断、自分自身は除外）
  const slugCheck = await checkSlugAvailability(data.slug, {
    currentType: 'space',
    currentId: id,
  })
  if (!slugCheck.available) {
    return createFailure(getSlugErrorMessage(slugCheck.reason))
  }

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
      slug: data.slug,
      name: data.name,
      description: (await renderDescriptionHtml(data.description)) ?? data.description,
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
      termsId: data.termsId || null,
      locationId: data.locationId || null,
      categoryId: data.categoryId || null,
      // 割引設定
      discountType: data.discountType ?? DiscountType.none,
      discountValue: data.discountValue ?? null,
      durationDiscountOverride: data.durationDiscountOverride ?? DurationDiscountOverride.inherit,
      // 税率設定
      taxRateType: data.taxRateType ?? TaxRateType.standard,
      // SEO フィールド
      metaDescription: data.metaDescription || null,
      metaKeywords: data.metaKeywords || null,
      // OGP フィールド
      ogpTitle: data.ogpTitle || null,
      ogpDescription: data.ogpDescription || null,
      ogpImageUrl: data.ogpImageUrl || null,
    },
  })

  updateTag(CACHE_TAGS.SPACES)
  updateTag(getCacheTag.spaces.detail(id))

  // Cloudflare CDN キャッシュパージ
  fireAndForget(purgeSpaceCache(id), { operation: 'purgeSpaceCache', category: ErrorCategory.EXTERNAL_API, severity: ErrorSeverity.LOW })

  return createSuccess('スペースを更新しました')
})

/**
 * スペースの公開状態を更新
 */
export const updateSpacePublish = withPermission<[id: string, isPublished: boolean], void>(
  'space',
  'publish'
)(async (_user, id, isPublished): Promise<ActionResult<void>> => {
  const space = await prisma.space.findUnique({
    where: { id },
    select: { id: true },
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

  updateTag(CACHE_TAGS.SPACES)
  updateTag(getCacheTag.spaces.detail(id))

  // Cloudflare CDN キャッシュパージ
  fireAndForget(purgeSpaceCache(id), { operation: 'purgeSpaceCache', category: ErrorCategory.EXTERNAL_API, severity: ErrorSeverity.LOW })

  return createSuccess('公開状態を更新しました')
})

/**
 * スペースを削除（論理削除）
 */
export const deleteSpace = withPermission<[id: string], void>(
  'space',
  'delete'
)(async (_user, id): Promise<ActionResult<void>> => {
  const space = await prisma.space.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          reservations: {
            where: {
              status: { in: [...ACTIVE_RESERVATION_STATUSES] },
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

  updateTag(CACHE_TAGS.SPACES)

  // Cloudflare CDN キャッシュパージ
  fireAndForget(purgeSpaceCache(id), { operation: 'purgeSpaceCache', category: ErrorCategory.EXTERNAL_API, severity: ErrorSeverity.LOW })

  return createSuccess('スペースを削除しました')
})


/**
 * スペースの公開状態をトグル
 */
export const toggleSpacePublished = withPermission<[id: string], void>(
  'space',
  'publish'
)(async (_user, id): Promise<ActionResult<void>> => {
  const space = await prisma.space.findUnique({
    where: { id },
    select: { id: true, isPublished: true },
  })

  if (!space) {
    return createFailure('スペースが見つかりません')
  }

  const newIsPublished = !space.isPublished

  await prisma.space.update({
    where: { id },
    data: {
      isPublished: newIsPublished,
      publishedAt: newIsPublished ? new Date() : null,
    },
  })

  updateTag(CACHE_TAGS.SPACES)
  updateTag(getCacheTag.spaces.detail(id))

  // Cloudflare CDN キャッシュパージ
  fireAndForget(purgeSpaceCache(id), { operation: 'purgeSpaceCache', category: ErrorCategory.EXTERNAL_API, severity: ErrorSeverity.LOW })

  return createSuccess(newIsPublished ? 'スペースを公開しました' : 'スペースを非公開にしました')
})
