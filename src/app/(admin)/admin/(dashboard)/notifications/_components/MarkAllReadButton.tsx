"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconChecks } from "@tabler/icons-react";
import { markAllNotificationsAsRead } from "@/admin/actions/notification";
import { isMutationError } from "@/shared/lib/mutation-result";
import { Button } from "@/admin/components/ui";

export function MarkAllReadButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleMarkAllRead = () => {
    startTransition(async () => {
      const result = await markAllNotificationsAsRead();
      if (!isMutationError(result)) {
        router.refresh();
      }
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
