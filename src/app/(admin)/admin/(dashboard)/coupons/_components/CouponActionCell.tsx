"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ActionDropdown,
  ActionDropdownItem,
  ActionDropdownSeparator,
} from "@/admin/components/ActionDropdown";
import { toggleCouponActive } from "@/admin/actions/coupon";
import { isMutationError } from "@/shared/lib/mutation-result";

type CouponActionCellProps = {
  couponId: string;
  couponName: string;
  isActive: boolean;
};

export function CouponActionCell({
  couponId,
  couponName,
  isActive,
}: CouponActionCellProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleToggleActive = () => {
    startTransition(async () => {
      const result = await toggleCouponActive(couponId);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success(
        result.isActive
          ? `${couponName} を有効化しました`
          : `${couponName} を無効化しました`,
      );
      router.refresh();
    });
  };

  return (
    <ActionDropdown>
      <ActionDropdownItem href={`/admin/coupons/${couponId}/edit`}>
        編集
      </ActionDropdownItem>
      <ActionDropdownItem href={`/admin/coupons/${couponId}`}>
        詳細
      </ActionDropdownItem>
      <ActionDropdownSeparator />
      <ActionDropdownItem onClick={handleToggleActive} disabled={isPending}>
        {isActive ? "無効化する" : "有効化する"}
      </ActionDropdownItem>
    </ActionDropdown>
  );
}
