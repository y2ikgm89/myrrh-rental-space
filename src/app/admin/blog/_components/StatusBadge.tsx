'use client'

import { Badge } from '@/components/admin/ui'

type StatusBadgeProps = {
  isPublished: boolean
}

export function StatusBadge({ isPublished }: StatusBadgeProps) {
  return (
    <Badge variant={isPublished ? 'default' : 'secondary'}>
      {isPublished ? '公開中' : '下書き'}
    </Badge>
  )
}
