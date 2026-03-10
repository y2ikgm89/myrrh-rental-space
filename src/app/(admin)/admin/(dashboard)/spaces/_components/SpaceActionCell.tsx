"use client";

import {
  ActionDropdown,
  ActionDropdownItem,
} from "@/admin/components/ActionDropdown";

// =============================================================================
// Types
// =============================================================================

type SpaceActionCellProps = {
  spaceId: string;
};

// =============================================================================
// SpaceActionCell Component (Client Component)
// =============================================================================

export function SpaceActionCell({ spaceId }: SpaceActionCellProps) {
  return (
    <ActionDropdown>
      <ActionDropdownItem href={`/admin/spaces/${spaceId}/edit`}>
        編集
      </ActionDropdownItem>
      <ActionDropdownItem href={`/admin/spaces/${spaceId}`}>
        詳細
      </ActionDropdownItem>
    </ActionDropdown>
  );
}
