"use client";

import {
  ActionDropdown,
  ActionDropdownItem,
} from "@/admin/components/ActionDropdown";

type CouponActionCellProps = {
  couponId: string;
};

export function CouponActionCell({ couponId }: CouponActionCellProps) {
  return (
    <ActionDropdown>
      <ActionDropdownItem href={`/admin/coupons/${couponId}`}>
        編集
      </ActionDropdownItem>
    </ActionDropdown>
  );
}
