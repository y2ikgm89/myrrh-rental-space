'use client'

import { Badge, type BadgeProps } from '@/admin/components/ui'
import type {
  CustomerStatus,
  InquiryStatus,
  ReservationStatus,
  PostStatus,
  CouponType,
} from '@/shared/generated/prisma/enums'

// =============================================================================
// Types
// =============================================================================

type BadgeVariant = NonNullable<BadgeProps['variant']>

type StatusConfig<T extends string> = Record<
  T,
  { label: string; variant: BadgeVariant }
>

// =============================================================================
// Configurations
// =============================================================================

const customerStatusConfig: StatusConfig<CustomerStatus> = {
  NEW: { label: '新規', variant: 'warning' },
  REGULAR: { label: 'リピーター', variant: 'success' },
  VIP: { label: 'VIP', variant: 'default' },
  INACTIVE: { label: '休眠', variant: 'outline' },
  BLACKLIST: { label: 'ブラックリスト', variant: 'destructive' },
}

const inquiryStatusConfig: StatusConfig<InquiryStatus> = {
  NEW: { label: '新規', variant: 'warning' },
  IN_PROGRESS: { label: '対応中', variant: 'pending' },
  RESOLVED: { label: '解決済み', variant: 'success' },
  CLOSED: { label: 'クローズ', variant: 'outline' },
}

const reservationStatusConfig: StatusConfig<ReservationStatus> = {
  PENDING: { label: '保留中', variant: 'pending' },
  CONFIRMED: { label: '確認済み', variant: 'success' },
  CANCELLED: { label: 'キャンセル', variant: 'destructive' },
}

const postStatusConfig: StatusConfig<PostStatus> = {
  DRAFT: { label: '下書き', variant: 'secondary' },
  PUBLISHED: { label: '公開中', variant: 'success' },
  ARCHIVED: { label: 'アーカイブ', variant: 'outline' },
}

// News はisPublished (boolean) 方式に移行
const newsPublishConfig = {
  published: { label: '公開中', variant: 'success' },
  draft: { label: '下書き', variant: 'secondary' },
} satisfies Record<string, { label: string; variant: BadgeVariant }>

// クーポンタイプ
const couponTypeConfig: StatusConfig<CouponType> = {
  PERCENTAGE: { label: '%割引', variant: 'default' },
  FIXED_AMOUNT: { label: '定額割引', variant: 'secondary' },
}

// クーポン有効/無効（シンプル版）
const couponActiveConfig = {
  active: { label: '有効', variant: 'success' },
  inactive: { label: '無効', variant: 'outline' },
} satisfies Record<string, { label: string; variant: BadgeVariant }>

// クーポン詳細ステータス
const couponStatusConfig = {
  active: { label: '有効', variant: 'success' },
  inactive: { label: '無効', variant: 'outline' },
  expired: { label: '期限切れ', variant: 'destructive' },
  limitReached: { label: '上限到達', variant: 'warning' },
  notStarted: { label: '期間前', variant: 'secondary' },
} satisfies Record<string, { label: string; variant: BadgeVariant }>

// =============================================================================
// Components
// =============================================================================

export function CustomerStatusBadge({ status }: { status: CustomerStatus }) {
  const config = customerStatusConfig[status]
  return <Badge variant={config.variant}>{config.label}</Badge>
}

export function InquiryStatusBadge({ status }: { status: InquiryStatus }) {
  const config = inquiryStatusConfig[status]
  return <Badge variant={config.variant}>{config.label}</Badge>
}

export function ReservationStatusBadge({
  status,
}: {
  status: ReservationStatus
}) {
  const config = reservationStatusConfig[status]
  return <Badge variant={config.variant}>{config.label}</Badge>
}

export function PostStatusBadge({ status }: { status: PostStatus }) {
  const config = postStatusConfig[status]
  return <Badge variant={config.variant}>{config.label}</Badge>
}

export function NewsStatusBadge({ isPublished }: { isPublished: boolean }) {
  const config = isPublished ? newsPublishConfig.published : newsPublishConfig.draft
  return <Badge variant={config.variant}>{config.label}</Badge>
}

export function CouponTypeBadge({ type }: { type: CouponType }) {
  const config = couponTypeConfig[type]
  return <Badge variant={config.variant}>{config.label}</Badge>
}

export function CouponActiveBadge({ isActive }: { isActive: boolean }) {
  const config = isActive ? couponActiveConfig.active : couponActiveConfig.inactive
  return <Badge variant={config.variant}>{config.label}</Badge>
}

/**
 * クーポン詳細ステータスバッジ
 * 期限切れ・上限到達・期間前などの詳細状態を表示
 */
export type CouponStatusType = 'active' | 'inactive' | 'expired' | 'limitReached' | 'notStarted'

export function getCouponStatus(coupon: {
  isActive: boolean
  validFrom: Date
  validUntil: Date | null
  usageLimit: number | null
  usageCount: number
}): CouponStatusType {
  // 手動で無効化されている場合
  if (!coupon.isActive) {
    return 'inactive'
  }

  const now = new Date()

  // 期間前
  if (coupon.validFrom > now) {
    return 'notStarted'
  }

  // 期限切れ
  if (coupon.validUntil && coupon.validUntil < now) {
    return 'expired'
  }

  // 利用上限到達
  if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
    return 'limitReached'
  }

  return 'active'
}

export function CouponStatusBadge({
  coupon,
}: {
  coupon: {
    isActive: boolean
    validFrom: Date
    validUntil: Date | null
    usageLimit: number | null
    usageCount: number
  }
}) {
  const status = getCouponStatus(coupon)
  const config = couponStatusConfig[status]
  return <Badge variant={config.variant}>{config.label}</Badge>
}
