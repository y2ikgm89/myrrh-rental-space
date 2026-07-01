"use client";

import {
  ActionDropdown,
  ActionDropdownItem,
} from "@/admin/components/ActionDropdown";
import type { UserData } from "@/shared/domain/users/types";

type Props = {
  user: UserData;
};

export function UserActions({ user }: Props) {
  return (
    <ActionDropdown>
      <ActionDropdownItem href={`/admin/staff/${user.id}`}>
        詳細
      </ActionDropdownItem>
    </ActionDropdown>
  );
}
