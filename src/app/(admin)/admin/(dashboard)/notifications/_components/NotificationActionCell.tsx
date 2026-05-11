"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ActionDropdown,
  ActionDropdownItem,
  ActionDropdownSeparator,
} from "@/admin/components/ActionDropdown";
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
  const { refresh } = useNotificationPolling();

  const handleMarkAsRead = () => {
    startTransition(async () => {
      const result = await markNotificationAsRead(id);
      if (!isMutationError(result)) {
        router.refresh();
        refresh();
      }
    });
  };

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteNotification(id);
      if (!isMutationError(result)) {
        router.refresh();
        refresh();
      }
    });
  };

  return (
    <ActionDropdown disabled={isPending}>
      {!isRead && (
        <>
          <ActionDropdownItem onClick={handleMarkAsRead}>
            既読にする
          </ActionDropdownItem>
          <ActionDropdownSeparator />
        </>
      )}
      <ActionDropdownItem destructive onClick={handleDelete}>
        削除
      </ActionDropdownItem>
    </ActionDropdown>
  );
}
