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
import { ReservationStatus } from "@/shared/lib/validations/enums/prisma-types";
import { isValidReservationStatus } from "@/shared/lib/validations/enums/guards";
import {
  TERMINAL_RESERVATION_STATUSES,
  RESERVATION_STATUS_TRANSITIONS,
  RESERVATION_STATUS_LABELS,
} from "@/shared/lib/validations/enums/helpers";

// =============================================================================
// Component
// =============================================================================

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

  const isTerminal = TERMINAL_RESERVATION_STATUSES.includes(currentStatus);
  const allowedNextStatuses =
    RESERVATION_STATUS_TRANSITIONS[currentStatus] ?? [];

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
      disabled={isPending || isTerminal}
    >
      <SelectTrigger className="w-36">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {/* Current status is always shown */}
        <SelectItem value={currentStatus}>
          {RESERVATION_STATUS_LABELS[currentStatus]}
        </SelectItem>
        {/* Allowed transitions */}
        {allowedNextStatuses.map((status) => (
          <SelectItem key={status} value={status}>
            {RESERVATION_STATUS_LABELS[status]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
