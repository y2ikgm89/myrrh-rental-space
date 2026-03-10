"use client";

import {
  ActionDropdown,
  ActionDropdownItem,
} from "@/admin/components/ActionDropdown";

type InquiryActionCellProps = {
  inquiryId: string;
};

export function InquiryActionCell({ inquiryId }: InquiryActionCellProps) {
  return (
    <ActionDropdown>
      <ActionDropdownItem href={`/admin/inquiries/${inquiryId}`}>
        詳細
      </ActionDropdownItem>
    </ActionDropdown>
  );
}
