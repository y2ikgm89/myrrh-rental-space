"use client";

import { useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { IconCheck } from "@tabler/icons-react";
import { markNotificationAsRead } from "@/admin/actions/notification";
import { isMutationError } from "@/shared/lib/mutation-result";
import {
  NOTIFICATION_TYPE_LABELS,
  isValidNotificationType,
} from "@/shared/lib/validations/enums/helpers";
import { Button } from "@/admin/components/ui";
import { cn } from "@/shared/lib/cn";
import { formatDateShort } from "@/shared/lib/date-format";
import type { SerializedAdminNotificationData } from "@/shared/domain/notifications/admin-queries";
import { getNotificationResourceHref } from "@/admin/lib/notification-helpers";
import { useNotificationPolling } from "./NotificationPollingProvider";

type NotificationListProps = {
  notifications: SerializedAdminNotificationData[];
};

// hydration 完了を SSR 安全に検出する（useState + useEffect の set-state-in-effect を
// 避ける React 19 公式パターン。share-buttons.tsx と同型）。
// SSR と hydration 初回 render は false、hydration 後に true。
const subscribeNoop = (): (() => void) => () => {};
const getHydratedSnapshot = (): boolean => true;
const getServerSnapshot = (): boolean => false;

function formatRelativeTime(dateStr: string, nowMs: number): string {
  const date = new Date(dateStr);
  const diffMs = nowMs - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "たった今";
  if (diffMin < 60) return `${String(diffMin)}分前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${String(diffHour)}時間前`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${String(diffDay)}日前`;
  return formatDateShort(dateStr);
}

export function NotificationList({ notifications }: NotificationListProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { refresh } = useNotificationPolling();
  // 相対時刻は現在時刻 (new Date()) 依存でサーバ(SSR時刻)とクライアント(hydration時刻)
  // で食い違い #418/#425 を起こす。hydration 済みか SSR 安全に判定し、初回 render
  // (=SSR と一致) は決定的な絶対日付 (formatDateShort = JST 固定) を出し、hydration 後に
  // 相対時刻へ切替える。
  const isHydrated = useSyncExternalStore(
    subscribeNoop,
    getHydratedSnapshot,
    getServerSnapshot,
  );
  // formatRelativeTime の基準時刻を明示的な引数として渡す（helper 内部で
  // new Date() を呼ぶと React Compiler の purity ルールの検知対象から漏れる
  // ため、呼び出し側で明示的に読み取り、意図を明記した上で disable する）。
  // eslint-disable-next-line react-hooks/purity, @eslint-react/purity -- Client Component: 相対時刻表示の基準時刻読み取りは意図的
  const nowMs = Date.now();

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
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      router.refresh();
      refresh();
    });
  };

  return (
    <div className="max-h-[400px] overflow-y-auto">
      {notifications.map((notification) => {
        const typeLabel = isValidNotificationType(notification.type)
          ? NOTIFICATION_TYPE_LABELS[notification.type]
          : notification.type;
        const href = getNotificationResourceHref(
          notification.type,
          notification.resourceType,
          notification.resourceId,
        );

        return (
          <div
            key={notification.id}
            className={cn(
              "border-b px-4 py-3 last:border-b-0",
              !notification.isRead && "bg-primary/5",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    {typeLabel}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {isHydrated
                      ? formatRelativeTime(notification.createdAt, nowMs)
                      : formatDateShort(notification.createdAt)}
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
