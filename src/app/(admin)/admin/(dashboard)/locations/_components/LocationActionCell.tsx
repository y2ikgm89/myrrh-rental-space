"use client";

import {
  ActionDropdown,
  ActionDropdownItem,
} from "@/admin/components/ActionDropdown";

// =============================================================================
// Types
// =============================================================================

type LocationActionCellProps = {
  locationId: string;
};

// =============================================================================
// LocationActionCell Component (Client Component)
// =============================================================================

export function LocationActionCell({ locationId }: LocationActionCellProps) {
  return (
    <ActionDropdown>
      <ActionDropdownItem href={`/admin/locations/${locationId}/edit`}>
        編集
      </ActionDropdownItem>
      <ActionDropdownItem href={`/admin/locations/${locationId}`}>
        詳細
      </ActionDropdownItem>
    </ActionDropdown>
  );
}
