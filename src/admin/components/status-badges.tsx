'use client'

import { Badge, type BadgeProps } from '@/admin/components/ui'
import type {
  CustomerStatus,
  InquiryStatus,
  ReservationStatus,
  BlogPostStatus,
  NewsStatus,
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

const blogPostStatusConfig: StatusConfig<BlogPostStatus> = {
  DRAFT: { label: '下書き', variant: 'secondary' },
  PUBLISHED: { label: '公開中', variant: 'success' },
  ARCHIVED: { label: 'アーカイブ', variant: 'outline' },
}

const newsStatusConfig: StatusConfig<NewsStatus> = {
  DRAFT: { label: '下書き', variant: 'secondary' },
  PUBLISHED: { label: '公開中', variant: 'success' },
  ARCHIVED: { label: 'アーカイブ', variant: 'outline' },
}

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

export function BlogPostStatusBadge({ status }: { status: BlogPostStatus }) {
  const config = blogPostStatusConfig[status]
  return <Badge variant={config.variant}>{config.label}</Badge>
}

export function NewsStatusBadge({ status }: { status: NewsStatus }) {
  const config = newsStatusConfig[status]
  return <Badge variant={config.variant}>{config.label}</Badge>
}
