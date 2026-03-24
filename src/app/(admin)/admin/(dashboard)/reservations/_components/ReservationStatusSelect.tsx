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
import { ReservationStatus } from "@/shared/db/enums";
import { isValidReservationStatus } from "@/shared/lib/validations/enums/guards";
import { TERMINAL_RESERVATION_STATUSES } from "@/shared/lib/validations/enums/helpers";

// =============================================================================
// Status transition rules (UI layer — mirrors domain validateStatusTransition)
// =============================================================================

const ALLOWED_TRANSITIONS: Record<
  ReservationStatus,
  readonly ReservationStatus[]
> = {
  [ReservationStatus.PENDING]: [
    ReservationStatus.CONFIRMED,
    ReservationStatus.CANCELLED,
  ],
  [ReservationStatus.CONFIRMED]: [
    ReservationStatus.COMPLETED,
    ReservationStatus.NO_SHOW,
    ReservationStatus.CANCELLED,
  ],
  [ReservationStatus.COMPLETED]: [],
  [ReservationStatus.CANCELLED]: [],
  [ReservationStatus.NO_SHOW]: [],
};

const STATUS_LABELS: Record<ReservationStatus, string> = {
  [ReservationStatus.PENDING]: "保留中",
  [ReservationStatus.CONFIRMED]: "確認済み",
  [ReservationStatus.COMPLETED]: "完了",
  [ReservationStatus.CANCELLED]: "キャンセル",
  [ReservationStatus.NO_SHOW]: "無断キャンセル",
};

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
  const allowedNextStatuses = ALLOWED_TRANSITIONS[currentStatus];

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
          {STATUS_LABELS[currentStatus]}
        </SelectItem>
        {/* Allowed transitions */}
        {allowedNextStatuses.map((status) => (
          <SelectItem key={status} value={status}>
            {STATUS_LABELS[status]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
