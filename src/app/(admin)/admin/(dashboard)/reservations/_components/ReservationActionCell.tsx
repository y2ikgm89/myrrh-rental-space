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
import { ReservationStatus } from "@/shared/lib/validations/enums/prisma-types";

type ReservationActionCellProps = {
  reservationId: string;
  isDeleted: boolean;
  status: ReservationStatus;
  /** 編集 / 復元（どちらも `reservation:update`） */
  canUpdate?: boolean;
  /**
   * 削除（`reservation:delete`）。
   *
   * `canUpdate` で兼用しない（監査 A-53）。サーバ側の `deleteReservation` は
   * `reservation:delete` を要求する一方で、詳細ページはそのキーで出し分けている。
   * 同じ「予約を削除する」導線を画面ごとに別の権限キーで出し分けない。
   */
  canDelete?: boolean;
};

export function ReservationActionCell({
  reservationId,
  isDeleted,
  status,
  canUpdate = true,
  canDelete = true,
}: ReservationActionCellProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isRestoring, startRestoreTransition] = useTransition();
  const router = useRouter();

  const isCancelledTrash = isDeleted && status === ReservationStatus.CANCELLED;

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

  const handleConfirmDelete = () => {
    void (async () => {
      const result = await deleteReservation(reservationId);
      if (isMutationError(result)) {
        toast.error(result.error);
      } else {
        toast.success("予約を削除しました");
        router.refresh();
      }
    })();
  };

  return (
    <>
      <ActionDropdown>
        {canUpdate && !isDeleted && (
          <ActionDropdownItem
            href={`/admin/reservations/${reservationId}/edit`}
          >
            編集
          </ActionDropdownItem>
        )}
        <ActionDropdownItem href={`/admin/reservations/${reservationId}`}>
          詳細
        </ActionDropdownItem>
        {isDeleted
          ? canUpdate && (
              <>
                <ActionDropdownSeparator />
                {isCancelledTrash ? (
                  <ActionDropdownItem disabled>
                    復元不可（キャンセル済み）
                  </ActionDropdownItem>
                ) : (
                  <ActionDropdownItem
                    onClick={handleRestore}
                    disabled={isRestoring}
                  >
                    復元
                  </ActionDropdownItem>
                )}
              </>
            )
          : canDelete && (
              <>
                <ActionDropdownSeparator />
                <ActionDropdownItem
                  destructive
                  onClick={() => setDeleteOpen(true)}
                >
                  削除
                </ActionDropdownItem>
              </>
            )}
      </ActionDropdown>
      {canDelete ? (
        <DeleteConfirmDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          itemName={`予約 #${reservationId.slice(0, 8)}`}
          onConfirm={handleConfirmDelete}
        />
      ) : null}
    </>
  );
}
