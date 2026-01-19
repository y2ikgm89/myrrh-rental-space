'use client'

import { BaseFilters, type StatusOption } from '@/admin/components/table'

// =============================================================================
// Constants
// =============================================================================

const CUSTOMER_STATUS_OPTIONS: StatusOption[] = [
  { value: 'ALL', label: 'すべて' },
  { value: 'NEW', label: '新規' },
  { value: 'REGULAR', label: 'リピーター' },
  { value: 'VIP', label: 'VIP' },
  { value: 'INACTIVE', label: '休眠' },
  { value: 'BLACKLIST', label: 'ブラックリスト' },
]

// =============================================================================
// CustomerFilters Component
// =============================================================================

export function CustomerFilters() {
  return (
    <BaseFilters
      basePath="/admin/customers"
      statusOptions={CUSTOMER_STATUS_OPTIONS}
      searchPlaceholder="名前、メール、電話番号で検索..."
    />
  )
}
