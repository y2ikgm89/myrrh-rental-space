"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
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

type ReservationStatusSelectProps = {
  reservationId: string;
  currentStatus: ReservationStatus;
};

const TERMINAL_STATUS_SET = new Set<ReservationStatus>(
  TERMINAL_RESERVATION_STATUSES,
);

function isTerminalTransition(target: ReservationStatus): boolean {
  return TERMINAL_STATUS_SET.has(target);
}

export function ReservationStatusSelect({
  reservationId,
  currentStatus,
}: ReservationStatusSelectProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingTerminal, setPendingTerminal] =
    useState<ReservationStatus | null>(null);

  const isTerminal = TERMINAL_STATUS_SET.has(currentStatus);
  const allowedNextStatuses =
    RESERVATION_STATUS_TRANSITIONS[currentStatus] ?? [];

  const performStatusChange = (newStatus: ReservationStatus) => {
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

  const handleStatusChange = (newStatus: ReservationStatus) => {
    if (newStatus === currentStatus) return;
    if (isTerminalTransition(newStatus)) {
      setPendingTerminal(newStatus);
      return;
    }
    performStatusChange(newStatus);
  };

  const handleConfirmTerminal = () => {
    if (!pendingTerminal) return;
    const target = pendingTerminal;
    setPendingTerminal(null);
    performStatusChange(target);
  };

  return (
    <>
      <Select
        value={currentStatus}
        onValueChange={(value) => {
          if (isValidReservationStatus(value)) handleStatusChange(value);
        }}
        disabled={isPending || isTerminal}
      >
        <SelectTrigger
          className="w-36"
          aria-label={`予約ステータス（現在: ${RESERVATION_STATUS_LABELS[currentStatus]}）`}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={currentStatus}>
            {RESERVATION_STATUS_LABELS[currentStatus]}
          </SelectItem>
          {allowedNextStatuses.map((status) => (
            <SelectItem key={status} value={status}>
              {RESERVATION_STATUS_LABELS[status]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <AlertDialog
        open={pendingTerminal !== null}
        onOpenChange={(open) => {
          if (!open) setPendingTerminal(null);
        }}
      >
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              ステータスを「
              {pendingTerminal
                ? RESERVATION_STATUS_LABELS[pendingTerminal]
                : ""}
              」に変更しますか？
            </AlertDialogTitle>
            <AlertDialogDescription>
              この操作後、ステータスは終端状態となり、通常の管理者では戻せません。誤操作の場合は
              SUPER_ADMIN
              権限を持つ管理者に「ステータスを復元」を依頼してください。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>
              キャンセル
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmTerminal}
              disabled={isPending}
            >
              {isPending ? "変更中..." : "変更する"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
