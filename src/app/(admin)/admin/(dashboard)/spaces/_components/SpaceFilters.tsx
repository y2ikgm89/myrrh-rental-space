'use client'

import { BaseFilters } from '@/admin/components/table'

const PUBLISH_STATUS_OPTIONS = [
  { value: 'ALL', label: 'すべて' },
  { value: 'true', label: '公開中' },
  { value: 'false', label: '非公開' },
]

export function SpaceFilters() {
  return (
    <BaseFilters
      statusOptions={PUBLISH_STATUS_OPTIONS}
      searchPlaceholder="名前・住所で検索..."
    />
  )
}
