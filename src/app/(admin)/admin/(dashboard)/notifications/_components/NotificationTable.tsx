"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconCheck, IconTrash } from "@tabler/icons-react";
import {
  markNotificationAsRead,
  deleteNotification,
} from "@/admin/actions/notification";
import { isMutationError } from "@/shared/lib/mutation-result";
import {
  NOTIFICATION_TYPE_LABELS,
  NOTIFICATION_TYPE_BADGE_VARIANTS,
  isValidNotificationType,
} from "@/shared/lib/validations/enums/helpers";
import { formatDateTimeShort } from "@/shared/lib/date-format";
import {
  Badge,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/admin/components/ui";
import type { SerializedAdminNotificationData } from "@/shared/domain/notifications/admin-queries";
import { getNotificationResourceHref } from "@/admin/lib/notification-helpers";

type NotificationTableProps = {
  notifications: SerializedAdminNotificationData[];
};

export function NotificationTable({ notifications }: NotificationTableProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (notifications.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-12 text-center">
        <p className="text-muted-foreground">通知はありません</p>
      </div>
    );
  }

  const handleMarkAsRead = (id: string) => {
    startTransition(async () => {
      const result = await markNotificationAsRead(id);
      if (!isMutationError(result)) {
        router.refresh();
      }
    });
  };

  const handleDelete = (id: string) => {
    startTransition(async () => {
      const result = await deleteNotification(id);
      if (!isMutationError(result)) {
        router.refresh();
      }
    });
  };

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead className="whitespace-nowrap">タイプ</TableHead>
              <TableHead>内容</TableHead>
              <TableHead className="hidden md:table-cell whitespace-nowrap">
                日時
              </TableHead>
              <TableHead className="whitespace-nowrap">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {notifications.map((notification) => {
              const validType = isValidNotificationType(notification.type)
                ? notification.type
                : null;
              const typeLabel = validType
                ? NOTIFICATION_TYPE_LABELS[validType]
                : notification.type;
              const badgeVariant = validType
                ? NOTIFICATION_TYPE_BADGE_VARIANTS[validType]
                : "secondary";
              const href = getNotificationResourceHref(
                notification.resourceType,
                notification.resourceId,
              );

              return (
                <TableRow key={notification.id}>
                  <TableCell className="w-8 pr-0">
                    {!notification.isRead && (
                      <span
                        className="inline-block h-2 w-2 rounded-full bg-primary"
                        aria-label="未読"
                      />
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Badge variant={badgeVariant}>{typeLabel}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {notification.title}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                        {notification.message}
                      </p>
                      {href && (
                        <Link
                          href={href}
                          className="mt-1 inline-block text-xs text-primary hover:underline"
                        >
                          詳細を見る
                        </Link>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell whitespace-nowrap text-sm text-muted-foreground">
                    {formatDateTimeShort(notification.createdAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {!notification.isRead && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          disabled={isPending}
                          onClick={() => handleMarkAsRead(notification.id)}
                          aria-label="既読にする"
                        >
                          <IconCheck className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                        disabled={isPending}
                        onClick={() => handleDelete(notification.id)}
                        aria-label="削除"
                      >
                        <IconTrash className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
