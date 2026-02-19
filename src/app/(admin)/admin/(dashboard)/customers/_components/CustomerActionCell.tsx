'use client'

import {
  ActionDropdown,
  ActionDropdownItem,
} from '@/admin/components/ActionDropdown'

// =============================================================================
// Types
// =============================================================================

type CustomerActionCellProps = {
  customerId: string
}

// =============================================================================
// CustomerActionCell Component
// =============================================================================

export function CustomerActionCell({ customerId }: CustomerActionCellProps) {
  return (
    <ActionDropdown>
      <ActionDropdownItem href={`/admin/customers/${customerId}/edit`}>
        編集
      </ActionDropdownItem>
      <ActionDropdownItem href={`/admin/customers/${customerId}`}>
        詳細
      </ActionDropdownItem>
    </ActionDropdown>
  )
}
