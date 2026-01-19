'use client'

import { BaseFilters, type StatusOption } from '@/admin/components/table'

const PUBLISH_STATUS_OPTIONS: StatusOption[] = [
  { value: 'ALL', label: 'すべて' },
  { value: 'true', label: '公開中' },
  { value: 'false', label: '非公開' },
]

export function LocationFilters() {
  return (
    <BaseFilters
      basePath="/admin/spaces"
      statusOptions={PUBLISH_STATUS_OPTIONS}
      statusParamName="published"
      searchPlaceholder="名前・住所で検索..."
      preserveParams={{ tab: 'locations' }}
    />
  )
}
