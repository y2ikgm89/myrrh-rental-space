import { connection } from "next/server";
import Link from "next/link";
import { cn } from "@/shared/lib/cn";
import { getRecentNotifications } from "@/admin/queries/notification";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/admin/components/ui/card";
import { Button } from "@/admin/components/ui/button";
import { Badge } from "@/admin/components/ui";
import { EmptyState } from "@/admin/components/EmptyState";
import {
  NOTIFICATION_TYPE_LABELS,
  NOTIFICATION_TYPE_BADGE_VARIANTS,
  isValidNotificationType,
} from "@/shared/lib/validations/enums/helpers";
import { getNotificationResourceHref } from "@/admin/lib/notification-helpers";
import { formatDateTimeShort } from "@/shared/lib/date-format";

export async function DashboardNotificationsSection() {
  await connection();
  const notifications = await getRecentNotifications(5);
  const unreadNotifications = notifications.filter((n) => !n.isRead);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>最新の通知</CardTitle>
          <CardDescription>
            {unreadNotifications.length > 0
              ? `未読 ${String(unreadNotifications.length)} 件`
              : "未読なし"}
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/admin/notifications">すべて表示</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {notifications.length === 0 ? (
          <EmptyState message="通知はありません" />
        ) : (
          <div className="space-y-3">
            {notifications.map((notification) => {
              const typeLabel = isValidNotificationType(notification.type)
                ? NOTIFICATION_TYPE_LABELS[notification.type]
                : notification.type;
              const badgeVariant = isValidNotificationType(notification.type)
                ? NOTIFICATION_TYPE_BADGE_VARIANTS[notification.type]
                : "secondary";
              const href = getNotificationResourceHref(
                notification.resourceType,
                notification.resourceId,
              );

              return (
                <div
                  key={notification.id}
                  className={cn(
                    "flex items-start gap-3",
                    notification.isRead && "opacity-60",
                  )}
                >
                  {!notification.isRead && (
                    <span className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-primary" />
                  )}
                  {notification.isRead && <span className="w-2 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={badgeVariant}>{typeLabel}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTimeShort(notification.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm">{notification.title}</p>
                    {href && (
                      <Link
                        href={href}
                        className="text-xs text-primary hover:underline"
                      >
                        詳細を見る
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
