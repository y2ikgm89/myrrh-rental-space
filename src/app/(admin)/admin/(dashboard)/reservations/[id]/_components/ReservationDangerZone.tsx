"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { DeleteConfirmDialog } from "@/admin/components/DeleteConfirmDialog";
import { Button } from "@/admin/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/admin/components/ui/card";
import { deleteReservation } from "@/admin/actions/reservation";
import { isMutationError } from "@/shared/lib/mutation-result";

type ReservationDangerZoneProps = {
  reservationId: string;
  itemName: string;
};

export function ReservationDangerZone({
  reservationId,
  itemName,
}: ReservationDangerZoneProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const handleConfirm = () => {
    startTransition(async () => {
      const result = await deleteReservation(reservationId);
      if (isMutationError(result)) {
        setOpen(false);
        toast.error(result.error);
        return;
      }

      toast.success("予約を削除しました");
      router.push("/admin/reservations");
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
          予約を削除
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
