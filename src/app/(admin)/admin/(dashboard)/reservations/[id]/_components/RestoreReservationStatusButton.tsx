"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { IconRotateClockwise } from "@tabler/icons-react";
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
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui";
import { restoreReservationStatus } from "@/admin/actions/reservation";
import { isMutationError } from "@/shared/lib/mutation-result";
import { ReservationStatus } from "@/shared/lib/validations/enums/prisma-types";
import { isValidReservationStatus } from "@/shared/lib/validations/enums/guards";
import {
  RESERVATION_STATUS_LABELS,
  TERMINAL_RESERVATION_STATUSES,
} from "@/shared/lib/validations/enums/helpers";

const RESTORE_TARGET_STATUSES: readonly ReservationStatus[] = [
  ReservationStatus.PENDING,
  ReservationStatus.CONFIRMED,
];

const TERMINAL_STATUS_SET = new Set<ReservationStatus>(
  TERMINAL_RESERVATION_STATUSES,
);

type RestoreReservationStatusButtonProps = {
  reservationId: string;
  currentStatus: ReservationStatus;
};

export function RestoreReservationStatusButton({
  reservationId,
  currentStatus,
}: RestoreReservationStatusButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [targetStatus, setTargetStatus] = useState<ReservationStatus>(
    ReservationStatus.CONFIRMED,
  );
  const [isPending, startTransition] = useTransition();

  if (!TERMINAL_STATUS_SET.has(currentStatus)) {
    return null;
  }

  const handleConfirm = () => {
    startTransition(async () => {
      const result = await restoreReservationStatus(
        reservationId,
        targetStatus,
      );
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success("ステータスを復元しました");
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        className="border-warning text-warning hover:bg-warning/10 focus-visible:ring-warning"
      >
        <IconRotateClockwise className="mr-2 h-4 w-4" />
        ステータスを復元
      </Button>

      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          if (!next && !isPending) {
            setOpen(false);
            setTargetStatus(ReservationStatus.CONFIRMED);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ステータスを復元しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              現在のステータス「
              {RESERVATION_STATUS_LABELS[currentStatus]}
              」から、選択した非終端ステータスに巻き戻します。
              <br />
              復元先が「確認済み」の場合、同じ時間帯に他の有効な予約があると失敗します。
              <br />
              この操作は監査ログに記録されます。
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2">
            <label
              htmlFor="restore-target-status"
              className="text-sm font-medium"
            >
              復元先ステータス
            </label>
            <Select
              value={targetStatus}
              onValueChange={(value) => {
                if (isValidReservationStatus(value)) setTargetStatus(value);
              }}
              disabled={isPending}
            >
              <SelectTrigger id="restore-target-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RESTORE_TARGET_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {RESERVATION_STATUS_LABELS[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>
              キャンセル
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} disabled={isPending}>
              {isPending ? "復元中..." : "復元する"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
