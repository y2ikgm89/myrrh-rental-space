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
      <ActionDropdownItem href={`/admin/coupons/${couponId}/edit`}>
        編集
      </ActionDropdownItem>
      <ActionDropdownItem href={`/admin/coupons/${couponId}`}>
        詳細
      </ActionDropdownItem>
    </ActionDropdown>
  );
}
