"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconBell } from "@tabler/icons-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/admin/components/ui/popover";
import { Button } from "@/admin/components/ui";
import { markAllNotificationsAsRead } from "@/admin/actions/notification";
import { isMutationError } from "@/shared/lib/mutation-result";
import { NotificationList } from "./NotificationList";
import type { SerializedAdminNotificationData } from "@/shared/domain/notifications/admin-queries";

type NotificationBellProps = {
  unreadCount: number;
  recentNotifications: SerializedAdminNotificationData[];
};

export function NotificationBell({
  unreadCount,
  recentNotifications,
}: NotificationBellProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleMarkAllAsRead = () => {
    startTransition(async () => {
      const result = await markAllNotificationsAsRead();
      if (!isMutationError(result)) {
        router.refresh();
      }
    });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative rounded-md p-2 text-muted-foreground transition-colors duration-200 hover:bg-accent hover:text-foreground"
          aria-label="通知"
        >
          <IconBell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
              {unreadCount > 99 ? "99+" : String(unreadCount)}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">通知</h3>
          {unreadCount > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={isPending}
              onClick={handleMarkAllAsRead}
            >
              すべて既読にする
            </Button>
          )}
        </div>

        {/* Body */}
        <NotificationList notifications={recentNotifications} />

        {/* Footer */}
        <div className="border-t px-4 py-2">
          <Link
            href="/admin/notifications"
            className="block text-center text-xs text-primary hover:underline"
          >
            すべての通知を見る
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
