"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteCoupon } from "@/admin/actions/coupon";
import { DeleteConfirmDialog } from "@/admin/components/DeleteConfirmDialog";
import { Button } from "@/admin/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/admin/components/ui/card";
import { isMutationError } from "@/shared/lib/mutation-result";

type CouponDangerZoneProps = {
  couponId: string;
  itemName: string;
};

export function CouponDangerZone({
  couponId,
  itemName,
}: CouponDangerZoneProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const handleConfirm = () => {
    startTransition(async () => {
      const result = await deleteCoupon(couponId);
      if (isMutationError(result)) {
        setOpen(false);
        toast.error(result.error);
        return;
      }

      toast.success("クーポンを削除しました");
      router.push("/admin/coupons");
    });
  };

  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <CardTitle className="text-base font-semibold text-destructive">
          危険な操作
        </CardTitle>
        <CardDescription>この操作は取り消せません</CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => setOpen(true)}
          disabled={isPending}
        >
          クーポンを削除
        </Button>
      </CardContent>
      <DeleteConfirmDialog
        open={open}
        onOpenChange={setOpen}
        itemName={itemName}
        onConfirm={handleConfirm}
        isPending={isPending}
      />
    </Card>
  );
}
