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
  markNotificationAsRead,
  deleteNotification,
} from "@/admin/actions/notification";
import { isMutationError } from "@/shared/lib/mutation-result";
import { useNotificationPolling } from "../../_components/NotificationPollingProvider";

type NotificationActionCellProps = {
  id: string;
  isRead: boolean;
};

export function NotificationActionCell({
  id,
  isRead,
}: NotificationActionCellProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { refresh } = useNotificationPolling();

  const handleMarkAsRead = () => {
    startTransition(async () => {
      const result = await markNotificationAsRead(id);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      router.refresh();
      refresh();
    });
  };

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteNotification(id);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      setDeleteOpen(false);
      router.refresh();
      refresh();
    });
  };

  return (
    <>
      <ActionDropdown disabled={isPending}>
        {!isRead && (
          <>
            <ActionDropdownItem onClick={handleMarkAsRead}>
              既読にする
            </ActionDropdownItem>
            <ActionDropdownSeparator />
          </>
        )}
        <ActionDropdownItem destructive onClick={() => setDeleteOpen(true)}>
          削除
        </ActionDropdownItem>
      </ActionDropdown>
      <DeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="通知を削除しますか？"
        description="この通知を削除します。この操作は取り消せません。"
        onConfirm={handleDelete}
        isPending={isPending}
      />
    </>
  );
}
