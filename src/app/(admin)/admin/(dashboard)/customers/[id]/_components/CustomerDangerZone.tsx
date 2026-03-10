"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteCustomer } from "@/admin/actions/customer";
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

type CustomerDangerZoneProps = {
  customerId: string;
  itemName: string;
};

export function CustomerDangerZone({
  customerId,
  itemName,
}: CustomerDangerZoneProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const handleConfirm = () => {
    startTransition(async () => {
      const result = await deleteCustomer(customerId);
      if (isMutationError(result)) {
        setOpen(false);
        toast.error(result.error);
        return;
      }

      toast.success("顧客を削除しました");
      router.push("/admin/customers");
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
          顧客を削除
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
