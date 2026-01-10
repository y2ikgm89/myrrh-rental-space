'use client'

import { Badge } from '@/components/admin/ui'
import type { CustomerStatus } from '@/generated/prisma/client/enums'

type StatusConfig = {
  label: string
  variant: 'default' | 'secondary' | 'destructive' | 'outline'
}

const statusConfig: Record<CustomerStatus, StatusConfig> = {
  NEW: { label: '新規', variant: 'default' },
  REGULAR: { label: 'リピーター', variant: 'secondary' },
  VIP: { label: 'VIP', variant: 'default' },
  INACTIVE: { label: '休眠', variant: 'outline' },
  BLACKLIST: { label: 'ブラックリスト', variant: 'destructive' },
}

type StatusBadgeProps = {
  status: CustomerStatus
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status]
  return <Badge variant={config.variant}>{config.label}</Badge>
}
