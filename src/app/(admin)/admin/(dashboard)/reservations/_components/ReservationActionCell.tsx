"use client";

import {
  ActionDropdown,
  ActionDropdownItem,
} from "@/admin/components/ActionDropdown";

type ReservationActionCellProps = {
  reservationId: string;
};

export function ReservationActionCell({
  reservationId,
}: ReservationActionCellProps) {
  return (
    <ActionDropdown>
      <ActionDropdownItem href={`/admin/reservations/${reservationId}/edit`}>
        編集
      </ActionDropdownItem>
      <ActionDropdownItem href={`/admin/reservations/${reservationId}`}>
        詳細
      </ActionDropdownItem>
    </ActionDropdown>
  );
}
