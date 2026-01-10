'use client'

import { Badge } from '@/components/admin/ui'
import type { InquiryStatus } from '@/generated/prisma/client/enums'

type StatusConfig = {
  label: string
  variant: 'default' | 'secondary' | 'destructive' | 'outline'
}

const statusConfig: Record<InquiryStatus, StatusConfig> = {
  NEW: { label: '新規', variant: 'destructive' },
  IN_PROGRESS: { label: '対応中', variant: 'default' },
  RESOLVED: { label: '解決済み', variant: 'secondary' },
  CLOSED: { label: 'クローズ', variant: 'outline' },
}

type StatusBadgeProps = {
  status: InquiryStatus
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status]
  return <Badge variant={config.variant}>{config.label}</Badge>
}
