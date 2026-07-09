"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { markNotificationAsRead } from "@/admin/actions/notification";
import { isMutationError } from "@/shared/lib/mutation-result";
import {
  NOTIFICATION_TYPE_LABELS,
  NOTIFICATION_TYPE_BADGE_VARIANTS,
  NOTIFICATION_TYPE_ICONS,
  isValidNotificationType,
} from "@/shared/lib/validations/enums/helpers";
import { CuratedIcon } from "@/shared/components/icon-curation/CuratedIcon";
import { formatDateTimeShort } from "@/shared/lib/date-format";
import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableShell,
} from "@/admin/components/ui";
import type { SerializedAdminNotificationData } from "@/shared/domain/notifications/admin-queries";
import { getNotificationResourceHref } from "@/admin/lib/notification-helpers";
import { useNotificationPolling } from "../../_components/NotificationPollingProvider";
import { NotificationActionCell } from "./NotificationActionCell";

type NotificationTableProps = {
  notifications: SerializedAdminNotificationData[];
};

export function NotificationTable({ notifications }: NotificationTableProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const { refresh } = useNotificationPolling();

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
        refresh();
      }
    });
  };

  return (
    <TableShell>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8" />
            <TableHead>タイプ</TableHead>
            <TableHead>内容</TableHead>
            <TableHead className="hidden md:table-cell">日時</TableHead>
            <TableHead>操作</TableHead>
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
            const typeIconName = validType
              ? NOTIFICATION_TYPE_ICONS[validType]
              : null;
            const href = getNotificationResourceHref(
              notification.type,
              notification.resourceType,
              notification.resourceId,
            );

            return (
              <TableRow key={notification.id}>
                <TableCell className="w-8 pr-0">
                  {!notification.isRead && (
                    <>
                      <span
                        className="inline-block h-2 w-2 rounded-full bg-primary"
                        aria-hidden="true"
                      />
                      <span className="sr-only">未読</span>
                    </>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <Badge
                    variant={badgeVariant}
                    className="inline-flex items-center gap-1.5"
                  >
                    {typeIconName ? (
                      <CuratedIcon name={typeIconName} className="h-3 w-3" />
                    ) : null}
                    <span>{typeLabel}</span>
                  </Badge>
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
                        className="mt-1 inline-block whitespace-nowrap text-xs text-primary hover:underline"
                        {...(!notification.isRead && {
                          onClick: () => handleMarkAsRead(notification.id),
                        })}
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
                  <NotificationActionCell
                    id={notification.id}
                    isRead={notification.isRead}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableShell>
  );
}
