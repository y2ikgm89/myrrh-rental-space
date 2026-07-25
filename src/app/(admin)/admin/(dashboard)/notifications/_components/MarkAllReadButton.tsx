"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { IconChecks } from "@tabler/icons-react";
import { markAllNotificationsAsRead } from "@/admin/actions/notification";
import { isMutationError } from "@/shared/lib/mutation-result";
import { Button } from "@/admin/components/ui";
import { useNotificationPolling } from "../../_components/NotificationPollingProvider";

export function MarkAllReadButton() {
  const router = useRouter();
  const { refresh, unreadCount } = useNotificationPolling();
  const [isPending, startTransition] = useTransition();

  if (unreadCount <= 0) {
    return null;
  }

  const handleMarkAllRead = () => {
    startTransition(async () => {
      const result = await markAllNotificationsAsRead();
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      router.refresh();
      refresh();
    });
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={handleMarkAllRead}
    >
      <IconChecks className="mr-2 h-4 w-4" />
      すべて既読にする
    </Button>
  );
}
