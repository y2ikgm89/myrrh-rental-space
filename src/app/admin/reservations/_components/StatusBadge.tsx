'use client'

import { Badge } from '@/components/admin/ui'
import type { ReservationStatus } from '@/generated/prisma/client/enums'

const statusConfig: Record<
  ReservationStatus,
  { label: string; variant: 'pending' | 'success' | 'destructive' }
> = {
  PENDING: { label: '保留中', variant: 'pending' },
  CONFIRMED: { label: '確認済み', variant: 'success' },
  CANCELLED: { label: 'キャンセル', variant: 'destructive' },
}

type StatusBadgeProps = {
  status: ReservationStatus
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status]

  return <Badge variant={config.variant}>{config.label}</Badge>
}
