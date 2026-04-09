"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconCheck } from "@tabler/icons-react";
import { markNotificationAsRead } from "@/admin/actions/notification";
import { isMutationError } from "@/shared/lib/mutation-result";
import {
  NOTIFICATION_TYPE_LABELS,
  isValidNotificationType,
} from "@/shared/lib/validations/enums/helpers";
import { Button } from "@/admin/components/ui";
import { cn } from "@/shared/lib/cn";
import type { SerializedAdminNotificationData } from "@/shared/domain/notifications/admin-queries";
import { getNotificationResourceHref } from "@/admin/lib/notification-helpers";
import { useNotificationPolling } from "./NotificationPollingProvider";

type NotificationListProps = {
  notifications: SerializedAdminNotificationData[];
};

function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "たった今";
  if (diffMin < 60) return `${String(diffMin)}分前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${String(diffHour)}時間前`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${String(diffDay)}日前`;
  return date.toLocaleDateString("ja-JP");
}

export function NotificationList({ notifications }: NotificationListProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { refresh } = useNotificationPolling();

  if (notifications.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
        通知はありません
      </div>
    );
  }

  const handleMarkAsRead = (id: string) => {
    startTransition(async () => {
      const result = await markNotificationAsRead(id);
      if (!isMutationError(result)) {
        router.refresh();
        refresh();
      }
    });
  };

  return (
    <div className="max-h-[400px] overflow-y-auto">
      {notifications.map((notification) => {
        const typeLabel = isValidNotificationType(notification.type)
          ? NOTIFICATION_TYPE_LABELS[notification.type]
          : notification.type;
        const href = getNotificationResourceHref(
          notification.resourceType,
          notification.resourceId,
        );

        return (
          <div
            key={notification.id}
            className={cn(
              "border-b px-4 py-3 last:border-b-0",
              notification.isRead ? "opacity-60" : "bg-primary/5",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    {typeLabel}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatRelativeTime(notification.createdAt)}
                  </span>
                </div>
                <p className="mt-1 text-sm font-medium text-foreground">
                  {notification.title}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                  {notification.message}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  {href && (
                    <Link
                      href={href}
                      className="text-xs text-primary hover:underline"
                      {...(!notification.isRead && {
                        onClick: () => handleMarkAsRead(notification.id),
                      })}
                    >
                      詳細を見る
                    </Link>
                  )}
                  {!notification.isRead && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      disabled={isPending}
                      onClick={() => handleMarkAsRead(notification.id)}
                    >
                      <IconCheck className="mr-1 h-3 w-3" />
                      既読にする
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
