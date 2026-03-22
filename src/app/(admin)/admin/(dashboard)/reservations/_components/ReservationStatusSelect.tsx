"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui";
import { updateReservationStatus } from "@/admin/actions/reservation";
import { isMutationError } from "@/shared/lib/mutation-result";
import type { ReservationStatus } from "@/shared/db/enums";
import { isValidReservationStatus } from "@/shared/lib/validations/enums/guards";

type ReservationStatusSelectProps = {
  reservationId: string;
  currentStatus: ReservationStatus;
};

export function ReservationStatusSelect({
  reservationId,
  currentStatus,
}: ReservationStatusSelectProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleStatusChange = (newStatus: ReservationStatus) => {
    if (newStatus === currentStatus) return;

    startTransition(async () => {
      const result = await updateReservationStatus(reservationId, newStatus);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      toast.success("ステータスを更新しました");
      router.refresh();
    });
  };

  return (
    <Select
      value={currentStatus}
      onValueChange={(value) => {
        if (isValidReservationStatus(value)) handleStatusChange(value);
      }}
      disabled={isPending}
    >
      <SelectTrigger className="w-32">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="PENDING">保留中</SelectItem>
        <SelectItem value="CONFIRMED">確認済み</SelectItem>
        <SelectItem value="CANCELLED">キャンセル</SelectItem>
      </SelectContent>
    </Select>
  );
}
