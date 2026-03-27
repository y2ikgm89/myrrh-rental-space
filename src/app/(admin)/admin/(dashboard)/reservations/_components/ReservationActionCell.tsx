"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ActionDropdown,
  ActionDropdownItem,
  ActionDropdownSeparator,
} from "@/admin/components/ActionDropdown";
import { DeleteConfirmDialog } from "@/admin/components/DeleteConfirmDialog";
import {
  deleteReservation,
  restoreReservation,
} from "@/admin/actions/reservation";
import { isMutationError } from "@/shared/lib/mutation-result";

type ReservationActionCellProps = {
  reservationId: string;
  isDeleted: boolean;
};

export function ReservationActionCell({
  reservationId,
  isDeleted,
}: ReservationActionCellProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isRestoring, startRestoreTransition] = useTransition();
  const router = useRouter();

  const handleRestore = () => {
    startRestoreTransition(async () => {
      const result = await restoreReservation(reservationId);
      if (isMutationError(result)) {
        toast.error(result.error);
      } else {
        toast.success("予約を復元しました");
        router.refresh();
      }
    });
  };

  return (
    <>
      <ActionDropdown>
        {!isDeleted && (
          <ActionDropdownItem
            href={`/admin/reservations/${reservationId}/edit`}
          >
            編集
          </ActionDropdownItem>
        )}
        <ActionDropdownItem href={`/admin/reservations/${reservationId}`}>
          詳細
        </ActionDropdownItem>
        <ActionDropdownSeparator />
        {isDeleted ? (
          <ActionDropdownItem onClick={handleRestore} disabled={isRestoring}>
            復元
          </ActionDropdownItem>
        ) : (
          <ActionDropdownItem destructive onClick={() => setDeleteOpen(true)}>
            削除
          </ActionDropdownItem>
        )}
      </ActionDropdown>
      <DeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        itemName={`予約 #${reservationId.slice(0, 8)}`}
        onConfirm={async () => {
          const result = await deleteReservation(reservationId);
          if (isMutationError(result)) {
            toast.error(result.error);
          } else {
            toast.success("予約を削除しました");
            router.refresh();
          }
        }}
      />
    </>
  );
}
