'use server'

/**
 * クーポン管理 Server Actions
 *
 * クーポンの作成・更新・削除・一覧取得
 * - パーセント割引（例: 20%OFF）
 * - 定額割引（例: ¥1,000OFF）
 * - 有効期限・利用回数制限
 * - 長時間割引との併用設定
 */

import { prisma, Prisma, type Coupon } from '@/shared/lib/prisma'
import { updateTag } from 'next/cache'
import { CACHE_TAGS, getCacheTag } from '@/shared/lib/constants'
import { createSuccess, createFailure, type ActionResult } from '@/admin/types/server-actions'
import { createValidationError } from '@/shared/lib/action-helpers'
import { withPermission } from '@/admin/lib/server-action-helpers'
import { checkReadPermissionFor } from '@/admin/lib/permissions'
import {
  couponFormSchema,
  type CouponFormInput,
} from '@/shared/lib/validations/coupon'
import type { CouponType } from '@/shared/generated/prisma/enums'

// =============================================================================
// Types
// =============================================================================

export type CouponData = {
  id: string
  code: string
  name: string
  description: string | null
  type: CouponType
  discountValue: number
  minReservationAmount: number | null
  maxDiscountAmount: number | null
  validFrom: Date
  validUntil: Date | null
  usageLimit: number | null
  usageCount: number
  isActive: boolean
  canCombineWithDurationDiscount: boolean
  createdAt: Date
  updatedAt: Date
}

export type GetCouponsResult = {
  coupons: CouponData[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export type CouponStatusFilter = 'active' | 'inactive' | 'expired' | 'limitReached' | 'notStarted'

export type CouponFilters = {
  status?: CouponStatusFilter
  type?: CouponType
  search?: string
}

export type CouponPagination = {
  page?: number
  limit?: number
  sortBy?: 'code' | 'name' | 'createdAt' | 'validFrom' | 'usageCount'
  sortOrder?: 'asc' | 'desc'
}

// =============================================================================
// Helper Functions
// =============================================================================

const checkReadPermission = checkReadPermissionFor('coupon')

/**
 * Prisma Couponをフロントエンド用に変換
 */
function formatCoupon(coupon: Coupon): CouponData {
  return { ...coupon }
}

// =============================================================================
// Actions
// =============================================================================

/**
 * ステータスに応じたPrisma whereクエリを構築
 */
function buildStatusWhereClause(status: CouponStatusFilter): Record<string, unknown> {
  const now = new Date()

  switch (status) {
    case 'active':
      // 有効: isActive=true かつ 期間内 かつ 上限未到達
      return {
        isActive: true,
        validFrom: { lte: now },
        OR: [
          { validUntil: null },
          { validUntil: { gte: now } },
        ],
        // usageLimitは後でフィルタリング（Prismaで直接比較できない）
      }
    case 'inactive':
      return { isActive: false }
    case 'expired':
      // 期限切れ: validUntil < now かつ isActive=true（手動無効は別）
      return {
        isActive: true,
        validUntil: { lt: now },
      }
    case 'limitReached':
      // 上限到達は直接クエリできないので、全取得後にフィルタリング
      // ここでは isActive=true のみ指定
      return { isActive: true }
    case 'notStarted':
      return {
        isActive: true,
        validFrom: { gt: now },
      }
    default:
      return {}
  }
}

/**
 * クーポン一覧を取得
 */
export async function getCoupons(
  filters: CouponFilters = {},
  pagination: CouponPagination = {}
): Promise<GetCouponsResult> {
  if (!(await checkReadPermission())) {
    return { coupons: [], total: 0, page: 1, limit: 10, totalPages: 0 }
  }

  const { status, type, search } = filters
  const {
    page = 1,
    limit = 10,
    sortBy: rawSortBy = 'createdAt',
    sortOrder: rawSortOrder = 'desc',
  } = pagination

  // ランタイムホワイトリスト検証（SQLインジェクション防止）
  const ALLOWED_SORT_BY = new Set(['code', 'name', 'createdAt', 'validFrom', 'usageCount'])
  const ALLOWED_SORT_ORDER = new Set(['asc', 'desc'])
  const sortBy = ALLOWED_SORT_BY.has(rawSortBy) ? rawSortBy : 'createdAt'
  const sortOrder = ALLOWED_SORT_ORDER.has(rawSortOrder) ? rawSortOrder : 'desc'

  const where: Record<string, unknown> = {}

  // ステータスフィルター
  if (status) {
    Object.assign(where, buildStatusWhereClause(status))
  }

  if (type) {
    where['type'] = type
  }

  if (search) {
    // 検索条件を追加（既存のORと競合しないよう注意）
    const searchCondition = [
      { code: { contains: search, mode: 'insensitive' as const } },
      { name: { contains: search, mode: 'insensitive' as const } },
    ]
    const existingOr = where['OR']
    if (existingOr && Array.isArray(existingOr)) {
      // 既存のOR条件とANDで結合
      where['AND'] = [
        { OR: existingOr },
        { OR: searchCondition },
      ]
      delete where['OR']
    } else {
      where['OR'] = searchCondition
    }
  }

  // limitReached/activeステータスは usageCount vs usageLimit の比較が必要
  // Prisma ORMでは同一テーブル内のフィールド比較ができないため、$queryRawを使用
  let total: number
  let coupons: Awaited<ReturnType<typeof prisma.coupon.findMany>>

  if (status === 'limitReached') {
    // 上限到達クエリ（RAW SQL）
    const now = new Date()
    const countResult = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM "Coupon"
      WHERE "isActive" = true
        AND "usageLimit" IS NOT NULL
        AND "usageCount" >= "usageLimit"
        AND "validFrom" <= ${now}
        AND ("validUntil" IS NULL OR "validUntil" >= ${now})
    `
    total = Number(countResult[0].count)

    coupons = await prisma.$queryRaw`
      SELECT * FROM "Coupon"
      WHERE "isActive" = true
        AND "usageLimit" IS NOT NULL
        AND "usageCount" >= "usageLimit"
        AND "validFrom" <= ${now}
        AND ("validUntil" IS NULL OR "validUntil" >= ${now})
      ORDER BY "${Prisma.raw(sortBy)}" ${Prisma.raw(sortOrder.toUpperCase())}
      LIMIT ${limit} OFFSET ${(page - 1) * limit}
    `
  } else if (status === 'active') {
    // activeステータスも usageLimit チェックが必要（RAW SQL）
    const now = new Date()
    const countResult = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM "Coupon"
      WHERE "isActive" = true
        AND "validFrom" <= ${now}
        AND ("validUntil" IS NULL OR "validUntil" >= ${now})
        AND ("usageLimit" IS NULL OR "usageCount" < "usageLimit")
    `
    total = Number(countResult[0].count)

    coupons = await prisma.$queryRaw`
      SELECT * FROM "Coupon"
      WHERE "isActive" = true
        AND "validFrom" <= ${now}
        AND ("validUntil" IS NULL OR "validUntil" >= ${now})
        AND ("usageLimit" IS NULL OR "usageCount" < "usageLimit")
      ORDER BY "${Prisma.raw(sortBy)}" ${Prisma.raw(sortOrder.toUpperCase())}
      LIMIT ${limit} OFFSET ${(page - 1) * limit}
    `
  } else {
    // その他のステータスは通常のPrismaクエリ
    ;[total, coupons] = await prisma.$transaction([
      prisma.coupon.count({ where }),
      prisma.coupon.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ])
  }

  return {
    coupons: coupons.map(formatCoupon),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  }
}

/**
 * クーポン詳細を取得
 */
export async function getCouponById(id: string): Promise<CouponData | null> {
  if (!(await checkReadPermission())) {
    return null
  }

  const coupon = await prisma.coupon.findUnique({
    where: { id },
  })

  if (!coupon) return null

  return formatCoupon(coupon)
}

/**
 * クーポンを新規作成
 */
export const createCoupon = withPermission<[input: CouponFormInput], { id: string }>(
  'coupon',
  'create'
)(async (_user, input): Promise<ActionResult<{ id: string }>> => {
  const parsed = couponFormSchema.safeParse(input)
  if (!parsed.success) {
    return createValidationError(parsed.error)
  }

  const data = parsed.data

  // コードの重複チェック
  const existing = await prisma.coupon.findUnique({
    where: { code: data.code },
    select: { id: true },
  })

  if (existing) {
    return createFailure('このクーポンコードは既に使用されています')
  }

  const coupon = await prisma.coupon.create({
    data: {
      code: data.code,
      name: data.name,
      description: data.description || null,
      type: data.type,
      discountValue: data.discountValue,
      minReservationAmount: data.minReservationAmount ?? null,
      maxDiscountAmount: data.maxDiscountAmount ?? null,
      validFrom: data.validFrom,
      validUntil: data.validUntil ?? null,
      usageLimit: data.usageLimit ?? null,
      isActive: data.isActive,
      canCombineWithDurationDiscount: data.canCombineWithDurationDiscount,
    },
  })

  updateTag(CACHE_TAGS.COUPONS)

  return createSuccess('クーポンを作成しました', { id: coupon.id })
})

/**
 * クーポンを更新
 */
export const updateCoupon = withPermission<[id: string, input: CouponFormInput], void>(
  'coupon',
  'update'
)(async (_user, id, input): Promise<ActionResult<void>> => {
  const parsed = couponFormSchema.safeParse(input)
  if (!parsed.success) {
    return createValidationError(parsed.error)
  }

  const data = parsed.data

  // 存在チェック
  const existing = await prisma.coupon.findUnique({
    where: { id },
    select: { id: true, code: true },
  })

  if (!existing) {
    return createFailure('クーポンが見つかりません')
  }

  // コードの重複チェック（自分以外）
  if (data.code !== existing.code) {
    const duplicate = await prisma.coupon.findUnique({
      where: { code: data.code },
      select: { id: true },
    })

    if (duplicate) {
      return createFailure('このクーポンコードは既に使用されています')
    }
  }

  await prisma.coupon.update({
    where: { id },
    data: {
      code: data.code,
      name: data.name,
      description: data.description || null,
      type: data.type,
      discountValue: data.discountValue,
      minReservationAmount: data.minReservationAmount ?? null,
      maxDiscountAmount: data.maxDiscountAmount ?? null,
      validFrom: data.validFrom,
      validUntil: data.validUntil ?? null,
      usageLimit: data.usageLimit ?? null,
      isActive: data.isActive,
      canCombineWithDurationDiscount: data.canCombineWithDurationDiscount,
    },
  })

  updateTag(CACHE_TAGS.COUPONS)
  updateTag(getCacheTag.coupons.detail(id))

  return createSuccess('クーポンを更新しました')
})

/**
 * クーポンを削除
 */
export const deleteCoupon = withPermission<[id: string], void>(
  'coupon',
  'delete'
)(async (_user, id): Promise<ActionResult<void>> => {
  // 存在チェック
  const coupon = await prisma.coupon.findUnique({
    where: { id },
    select: { id: true },
  })

  if (!coupon) {
    return createFailure('クーポンが見つかりません')
  }

  // 使用中の予約があるか確認
  const usedReservations = await prisma.reservation.count({
    where: { couponId: id },
  })

  if (usedReservations > 0) {
    return createFailure(`このクーポンは${usedReservations}件の予約で使用されているため削除できません`)
  }

  await prisma.coupon.delete({
    where: { id },
  })

  updateTag(CACHE_TAGS.COUPONS)
  updateTag(getCacheTag.coupons.detail(id))

  return createSuccess('クーポンを削除しました')
})

/**
 * クーポンの有効/無効を切り替え
 */
export const toggleCouponActive = withPermission<[id: string], void>(
  'coupon',
  'update'
)(async (_user, id): Promise<ActionResult<void>> => {
  const coupon = await prisma.coupon.findUnique({
    where: { id },
    select: { id: true, isActive: true },
  })

  if (!coupon) {
    return createFailure('クーポンが見つかりません')
  }

  await prisma.coupon.update({
    where: { id },
    data: { isActive: !coupon.isActive },
  })

  updateTag(CACHE_TAGS.COUPONS)
  updateTag(getCacheTag.coupons.detail(id))

  return createSuccess(coupon.isActive ? 'クーポンを無効化しました' : 'クーポンを有効化しました')
})

